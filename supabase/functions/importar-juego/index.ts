// Supabase Edge Function "importar-juego" (Deno).
//
// Solo para administradores: dado el paquete de un juego, lee su ficha PUBLICA de Google Play,
// obtiene el nombre oficial y el icono, guarda una COPIA del icono en Storage (cubo "juegos",
// carpeta iconos/) y actualiza el juego. Asi la web y la app nunca enlazan a sitios externos.
//
// Seguridad:
//  - Requiere sesion (JWT) y que el usuario sea administrador (authors.is_admin).
//  - El paquete se valida con la misma regla que la base de datos y no admite apps del sistema.
//  - Solo se descarga de play.google.com y play-lh.googleusercontent.com, con tamano maximo.
//  - Usa la clave de servicio que Supabase inyecta en la funcion (nunca sale del servidor).
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const SENSITIVE =
  /^(android|com\.android|com\.google\.android|com\.miui|com\.xiaomi|com\.samsung\.android|com\.sec\.android|com\.oplus|com\.coloros|com\.huawei|com\.hihonor|com\.oneplus|com\.motorola|com\.lineageos|org\.lineageos|com\.topjohnwu|io\.github\.huskydg|me\.weishu|moe\.shizuku|rikka\.shizuku|com\.gamepadmapper)(\.|$)/i;
const MAX_ICON_BYTES = 512 * 1024;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, service, { auth: { persistSession: false } });

  // 1. Solo administradores
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: user } = await db.auth.getUser(jwt);
  if (!user?.user) return reply(401, { error: 'Inicia sesión.' });
  const { data: author } = await db.from('authors').select('is_admin,is_banned').eq('id', user.user.id).maybeSingle();
  if (!author?.is_admin || author.is_banned) return reply(403, { error: 'Solo para administradores.' });

  // 2. Paquete valido
  let body: { package?: unknown; updateName?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Petición no válida.' });
  }
  const pkg = typeof body.package === 'string' ? body.package.trim() : '';
  if (pkg.length > 150 || !PACKAGE.test(pkg) || SENSITIVE.test(pkg)) return reply(400, { error: 'Paquete no válido.' });
  const { data: game } = await db.from('games').select('package').eq('package', pkg).maybeSingle();
  if (!game) return reply(404, { error: 'Ese juego no existe en la comunidad.' });

  // 3. Ficha publica de Google Play
  const page = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}&hl=es&gl=US`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (GamepadMapperPluton; importar-juego)', 'Accept-Language': 'es' },
    redirect: 'manual',
  });
  if (page.status === 404) return reply(404, { error: 'El juego no está en Google Play.' });
  if (!page.ok) return reply(502, { error: `Google Play respondió ${page.status}.` });
  const html = (await page.text()).slice(0, 2_000_000);
  const name = cleanName(meta(html, 'og:title') ?? '');
  const image = meta(html, 'og:image') ?? '';
  let iconUrl: URL;
  try {
    iconUrl = new URL(image);
  } catch {
    return reply(502, { error: 'No se encontró el icono en la ficha.' });
  }
  if (iconUrl.protocol !== 'https:' || iconUrl.hostname !== 'play-lh.googleusercontent.com') {
    return reply(502, { error: 'Icono con una dirección inesperada.' });
  }
  // Tamano 256 px (los iconos de Play aceptan el sufijo =sNNN)
  const sized = `${iconUrl.origin}${iconUrl.pathname.replace(/=[^/]*$/, '')}=s256`;

  // 4. Copia del icono en Storage
  const img = await fetch(sized, { redirect: 'error' });
  const type = img.headers.get('content-type') ?? '';
  if (!img.ok || !/^image\/(png|jpeg|webp)$/.test(type)) return reply(502, { error: 'No se pudo descargar el icono.' });
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) return reply(502, { error: 'Icono demasiado grande.' });
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `iconos/${pkg}.${ext}`;
  const up = await db.storage.from('juegos').upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) return reply(500, { error: 'No se pudo guardar el icono.' });
  const publicUrl = `${db.storage.from('juegos').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;

  // 5. Actualizar el juego
  const changes: Record<string, string> = { icon_url: publicUrl };
  if (body.updateName === true && name) changes.name = name;
  const upd = await db.from('games').update(changes).eq('package', pkg);
  if (upd.error) return reply(500, { error: 'No se pudo actualizar el juego.' });

  return reply(200, { package: pkg, name, iconUrl: publicUrl, nameUpdated: !!changes.name });
});
