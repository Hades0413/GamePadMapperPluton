// Supabase Edge Function "importar-juego" (Deno).
//
// Lee la ficha PUBLICA de un juego en Google Play y:
//  - accion "rellenar" (cualquier usuario con sesion): pone icono y captura SOLO si el juego
//    aun no los tiene (nunca sustituye lo que puso la moderacion). Se usa al subir un perfil.
//  Solo administradores:
//  - accion "icono" (por defecto): nombre oficial + copia del icono en Storage (iconos/).
//  - accion "capturas": devuelve las capturas horizontales de la ficha para elegir una.
//  - accion "fondo": copia en Storage (fondos/) la captura elegida y la pone como fondo del juego.
// Las imagenes se COPIAN a Storage: la web y la app nunca cargan imagenes de otros sitios.
//
// Seguridad:
//  - Requiere sesion (JWT). Todo es solo para administradores salvo "rellenar", que cualquier
//    usuario no bloqueado puede usar pero solo completa lo vacio y solo desde la ficha oficial.
//  - El paquete se valida con la misma regla que la base de datos y no admite apps del sistema.
//  - Solo se descarga de play.google.com y play-lh.googleusercontent.com, con tamano maximo.
//  - Usa la clave de servicio que Supabase inyecta en la funcion (nunca sale del servidor).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const SENSITIVE =
  /^(android|com\.android|com\.google\.android|com\.miui|com\.xiaomi|com\.samsung\.android|com\.sec\.android|com\.oplus|com\.coloros|com\.huawei|com\.hihonor|com\.oneplus|com\.motorola|com\.lineageos|org\.lineageos|com\.topjohnwu|io\.github\.huskydg|me\.weishu|moe\.shizuku|rikka\.shizuku|com\.gamepadmapper)(\.|$)/i;
/** Imagen de Google Play: dominio fijo y ruta sin caracteres raros. */
const PLAY_IMAGE = /^https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_-]{20,300}$/;
const MAX_ICON_BYTES = 512 * 1024;
const MAX_BACKGROUND_BYTES = 1024 * 1024;
const ALLOWED_ORIGIN = Deno.env.get('SITE_ORIGIN') ?? 'https://hades0413.github.io';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Contenido de una etiqueta <meta property="og:..."> (o null). */
function meta(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`, 'i');
  const m = re.exec(html) ?? new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`, 'i').exec(html);
  return m ? decode(m[1] ?? '') : null;
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Nombre limpio: sin el sufijo de la tienda, una linea, sin < >, 2..60 caracteres. */
function cleanName(title: string): string | null {
  const name = title.replace(/\s+[-–]\s+(Apps|Aplicaciones|Apps en|Apps on).*$/i, '').replace(/[<>\s]+/g, ' ').trim();
  return name.length >= 2 && name.length <= 60 ? name : null;
}

/** Direccion base de una imagen de Play (sin el sufijo de tamano "=w526-h296..."). */
function playBase(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'play-lh.googleusercontent.com') return null;
    const base = `${u.origin}${u.pathname.replace(/=[^/]*$/, '')}`;
    return PLAY_IMAGE.test(base) ? base : null;
  } catch {
    return null;
  }
}

/** Capturas horizontales de la ficha (sin repetir), en el orden de la tienda. */
function screenshots(html: string): string[] {
  const out: string[] = [];
  const tags = html.match(/<img[^>]+alt="[^"]*(captura|screenshot)[^"]*"[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const src = /src="([^"]+)"/.exec(tag)?.[1];
    if (!src) continue;
    const size = /=w(\d+)-h(\d+)/.exec(src);
    if (size && Number(size[1]) <= Number(size[2])) continue;   // solo horizontales
    const base = playBase(decode(src));
    if (base && !out.includes(base)) out.push(base);
    if (out.length >= 16) break;
  }
  return out;
}

async function playPage(pkg: string): Promise<string | Response> {
  const page = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=es&gl=US`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (GamepadMapperPluton; importar-juego)', 'Accept-Language': 'es' },
    redirect: 'manual',
  });
  if (page.status === 404) return reply(404, { error: 'El juego no está en Google Play.' });
  if (!page.ok) return reply(502, { error: `Google Play respondió ${page.status}.` });
  return (await page.text()).slice(0, 3_000_000);
}

/** Descarga una imagen de Play y la guarda en Storage. Devuelve la URL publica (con ?v=). */
async function copyImage(db: SupabaseClient, url: string, folder: 'iconos' | 'fondos', pkg: string, maxBytes: number) {
  const img = await fetch(url, { redirect: 'error' });
  const type = img.headers.get('content-type') ?? '';
  if (!img.ok || !/^image\/(png|jpeg|webp)$/.test(type)) throw new Error('No se pudo descargar la imagen.');
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxBytes) throw new Error('La imagen es demasiado grande.');
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${pkg}.${ext}`;
  const up = await db.storage.from('juegos').upload(path, bytes, { contentType: type, upsert: true, cacheControl: '86400' });
  if (up.error) throw new Error('No se pudo guardar la imagen.');
  return `${db.storage.from('juegos').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, service, { auth: { persistSession: false } });

  // 1. Sesion valida (y admin para todo salvo "rellenar")
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: user } = await db.auth.getUser(jwt);
  if (!user?.user) return reply(401, { error: 'Inicia sesión.' });
  const { data: author } = await db.from('authors').select('is_admin,is_banned').eq('id', user.user.id).maybeSingle();
  if (!author || author.is_banned) return reply(403, { error: 'Tu cuenta no puede hacer esto.' });

  // 2. Peticion y paquete validos
  let body: { package?: unknown; updateName?: unknown; action?: unknown; image?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Petición no válida.' });
  }
  const action = body.action === 'capturas' || body.action === 'fondo' || body.action === 'rellenar' ? body.action : 'icono';
  if (action !== 'rellenar' && !author.is_admin) return reply(403, { error: 'Solo para administradores.' });
  const pkg = typeof body.package === 'string' ? body.package.trim() : '';
  if (pkg.length > 150 || !PACKAGE.test(pkg) || SENSITIVE.test(pkg)) return reply(400, { error: 'Paquete no válido.' });
  const { data: game } = await db.from('games').select('package,icon_url,background_url,is_hidden').eq('package', pkg).maybeSingle();
  if (!game || game.is_hidden) return reply(404, { error: 'Ese juego no existe en la comunidad.' });

  try {
    // 3. Rellenar lo que falte (no sustituye nada; para usuarios al subir un perfil)
    if (action === 'rellenar') {
      if (game.icon_url && game.background_url) {
        return reply(200, { package: pkg, iconUrl: game.icon_url, backgroundUrl: game.background_url });
      }
      const html = await playPage(pkg);
      if (html instanceof Response) return html;
      const changes: Record<string, string> = {};
      if (!game.icon_url) {
        const icon = playBase(meta(html, 'og:image') ?? '');
        if (icon) changes.icon_url = await copyImage(db, `${icon}=s256`, 'iconos', pkg, MAX_ICON_BYTES);
      }
      if (!game.background_url) {
        const first = screenshots(html)[0];
        if (first) changes.background_url = await copyImage(db, `${first}=w1600`, 'fondos', pkg, MAX_BACKGROUND_BYTES);
      }
      if (Object.keys(changes).length > 0) {
        // .is(null): si otro lo relleno a la vez, no se pisa.
        if (changes.icon_url) await db.from('games').update({ icon_url: changes.icon_url }).eq('package', pkg).is('icon_url', null);
        if (changes.background_url) {
          await db.from('games').update({ background_url: changes.background_url }).eq('package', pkg).is('background_url', null);
        }
      }
      return reply(200, {
        package: pkg,
        iconUrl: game.icon_url ?? changes.icon_url ?? null,
        backgroundUrl: game.background_url ?? changes.background_url ?? null,
      });
    }

    // 3a. Copiar como fondo una captura elegida (solo si de verdad esta en la ficha del juego)
    if (action === 'fondo') {
      const chosen = typeof body.image === 'string' ? playBase(body.image) : null;
      if (!chosen) return reply(400, { error: 'Imagen no válida.' });
      const html = await playPage(pkg);
      if (html instanceof Response) return html;
      if (!screenshots(html).includes(chosen)) return reply(400, { error: 'Esa imagen no es de la ficha del juego.' });
      const publicUrl = await copyImage(db, `${chosen}=w1600`, 'fondos', pkg, MAX_BACKGROUND_BYTES);
      const upd = await db.from('games').update({ background_url: publicUrl }).eq('package', pkg);
      if (upd.error) return reply(500, { error: 'No se pudo actualizar el juego.' });
      return reply(200, { package: pkg, backgroundUrl: publicUrl });
    }

    const html = await playPage(pkg);
    if (html instanceof Response) return html;

    // 3b. Lista de capturas para elegir (miniaturas servidas por Google; el admin elige una)
    if (action === 'capturas') {
      const list = screenshots(html);
      return reply(200, { package: pkg, screenshots: list.map((base) => ({ id: base, thumb: `${base}=w480` })) });
    }

    // 3c. Nombre e icono
    const name = cleanName(meta(html, 'og:title') ?? '');
    const icon = playBase(meta(html, 'og:image') ?? '');
    if (!icon) return reply(502, { error: 'No se encontró el icono en la ficha.' });
    const publicUrl = await copyImage(db, `${icon}=s256`, 'iconos', pkg, MAX_ICON_BYTES);
    const changes: Record<string, string> = { icon_url: publicUrl };
    if (body.updateName === true && name) changes.name = name;
    const upd = await db.from('games').update(changes).eq('package', pkg);
    if (upd.error) return reply(500, { error: 'No se pudo actualizar el juego.' });
    return reply(200, { package: pkg, name, iconUrl: publicUrl, nameUpdated: !!changes.name });
  } catch (e) {
    return reply(502, { error: e instanceof Error ? e.message : 'Error al importar.' });
  }
});
