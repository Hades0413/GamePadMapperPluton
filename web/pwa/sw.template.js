/*
 * Service worker de Gamepad Mapper Pluton. Se genera al compilar (vite.config.ts) con la version y
 * la lista de archivos estaticos; no se usa en desarrollo.
 *
 *  - Guarda SOLO archivos estaticos de la propia web (JS, CSS, iconos, manifiesto), con una cache
 *    por version: al activarse una version nueva, se borran las anteriores.
 *  - NUNCA toca peticiones a otros dominios (Supabase: datos, inicio de sesion, imagenes...), ni
 *    peticiones que no sean GET o que lleven cabecera Authorization.
 *  - NUNCA guarda HTML: las paginas siempre se piden a la red. Sin conexion se muestra un aviso
 *    generado aqui mismo (no una copia de ninguna pagina).
 */
const VERSION = '__VERSION__';
const BASE = '__BASE__';
const PRECACHE = __PRECACHE__;
const CACHE = `gpm-${VERSION}`;

const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sin conexión · Offline</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#110a17;color:#f4effa;
font:16px system-ui,sans-serif;text-align:center;padding:16px}p{color:#b3a5c4}</style></head>
<body><main><h1>Sin conexión</h1><p>Revisa tu internet y vuelve a intentarlo.</p>
<h1 lang="en">You are offline</h1><p lang="en">Check your connection and try again.</p></main></body></html>`;

const isStatic = (path) => path.startsWith(`${BASE}assets/`) || PRECACHE.includes(path);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('gpm-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('authorization')) return;
  const url = new URL(request.url);
  // Supabase y cualquier otro dominio: el navegador lo pide como siempre, sin pasar por la cache.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() =>
      new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
    return;
  }
  if (!isStatic(url.pathname) || url.search) return;

  // Archivos con huella en el nombre (no cambian): primero la cache; si no esta, la red y se guarda.
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok && response.type === 'basic' && url.pathname.startsWith(`${BASE}assets/`)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    })),
  );
});
