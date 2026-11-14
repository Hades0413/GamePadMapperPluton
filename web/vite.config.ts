/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Seguridad en produccion (GitHub Pages no deja poner cabeceras HTTP, asi que va en <meta>):
 *  - Content-Security-Policy: solo scripts propios, conexiones solo a Supabase, sin iframes ni plugins.
 *  - 404.html = index.html, para que las rutas de la web funcionen al abrirlas directamente.
 *  - Las rutas fijas (privacidad, normas...) tienen su propia copia: responden 200 y no 404
 *    (Google Play exige que la URL de la politica de privacidad responda bien).
 *  - Cada perfil y cada juego publicados tienen tambien su pagina (perfil/<id>.html,
 *    juegos/<paquete>.html): responden 200 y llevan su titulo y descripcion para buscadores y
 *    al compartir el enlace. Los nuevos funcionan igualmente (por 404.html) hasta la proxima
 *    publicacion de la web (el flujo «web» la rehace cada hora).
 */
const STATIC_ROUTES = ['juegos', 'subir', 'cuenta', 'admin', 'privacidad', 'normas'];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,160}$/;

interface Pagina { readonly path: string; readonly title: string; readonly description: string; readonly image: string | null }

/** Perfiles y juegos publicados (lectura publica con la clave publica). */
async function publicPages(supabaseUrl: string, key: string): Promise<Pagina[]> {
  if (!supabaseUrl.startsWith('https://') || !key) return [];
  const get = async (q: string): Promise<unknown[]> => {
    const r = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/${q}`, { headers: { apikey: key } });
    if (!r.ok) throw new Error(`Supabase respondio ${r.status} a ${q.split('?')[0]}`);
    return (await r.json()) as unknown[];
  };
  const pages: Pagina[] = [];
  const games = (await get('games?select=package,name,icon_url,profile_count&profile_count=gt.0&limit=5000')) as
    { package: string; name: string; icon_url: string | null; profile_count: number }[];
  for (const g of games) {
    if (!SAFE_SEGMENT.test(g.package)) continue;
    pages.push({ path: `juegos/${g.package}`, title: `${g.name} — Gamepad Mapper Plutón`,
      description: `${g.profile_count} perfiles de mando para ${g.name}: juega con mando en Android.`, image: g.icon_url });
  }
  const profiles = (await get('game_profiles?select=id,title,description,game:games(name,icon_url)&status=eq.published&limit=10000')) as
    { id: string; title: string; description: string; game: { name: string; icon_url: string | null } | null }[];
  for (const p of profiles) {
    if (!SAFE_SEGMENT.test(p.id)) continue;
    const game = p.game?.name ?? '';
    pages.push({ path: `perfil/${p.id}`, title: `${p.title}${game ? ` — ${game}` : ''} · Gamepad Mapper Plutón`,
      description: (p.description || `Perfil de mando${game ? ` para ${game}` : ''}.`).slice(0, 200), image: p.game?.icon_url ?? null });
  }
  return pages;
}

/** Copia de index.html con el titulo, la descripcion y la imagen de esa pagina. */
function pageHtml(index: string, page: Pagina): string {
  const t = esc(page.title), d = esc(page.description.replace(/\s+/g, ' ').trim());
  let html = index
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${t}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`);
  if (page.image) html = html.replace('</head>', `    <meta property="og:image" content="${esc(page.image)}" />\n  </head>`);
  return html;
}

function securityAndSpa(supabaseUrl: string, anonKey: string): Plugin {
  const supabase = supabaseUrl.replace(/\/+$/, '');
  const local = supabase.startsWith('http://');
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self' ${supabase} ${supabase.replace(/^http/, 'ws')}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(local ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
  let outDir = 'dist';
  return {
    name: 'gpm-security-spa',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
    ],
    async closeBundle() {
      const index = join(outDir, 'index.html');
      copyFileSync(index, join(outDir, '404.html'));
      for (const route of STATIC_ROUTES) {
        mkdirSync(join(outDir, route), { recursive: true });
        copyFileSync(index, join(outDir, route, 'index.html'));
      }
      // Paginas de perfiles y juegos (si no hay red, la web funciona igual por 404.html).
      try {
        const html = readFileSync(index, 'utf8');
        const pages = await publicPages(supabaseUrl, anonKey);
        for (const page of pages) {
          const file = join(outDir, `${page.path}.html`);
          mkdirSync(join(file, '..'), { recursive: true });
          writeFileSync(file, pageHtml(html, page));
        }
        this.info(`paginas de perfiles y juegos: ${pages.length}`);
      } catch (e) {
        this.warn(`sin paginas de perfiles y juegos: ${(e as Error).message}`);
      }
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && mode === 'production' && !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(env.VITE_SUPABASE_URL ?? '')) {
    throw new Error('Falta VITE_SUPABASE_URL (https://...) para compilar la web. Ver web/.env.example');
  }
  return {
    // Ruta base donde se publica la web (GitHub Pages de proyecto: /GamePadMapperPluton/).
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), securityAndSpa(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_ANON_KEY ?? '')],
    resolve: {
      alias: {
        '@domain': dir('./src/domain'),
        '@application': dir('./src/application'),
        '@infrastructure': dir('./src/infrastructure'),
        '@presentation': dir('./src/presentation'),
        '@shared': dir('./src/shared'),
        '@app': dir('./src/app'),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          // Librerias en archivos aparte: cambian poco y el navegador las mantiene en cache.
          manualChunks: (id: string) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('@tanstack')) return 'query';
            if (id.includes('react-router')) return 'router';
            if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
            return 'vendor';
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
