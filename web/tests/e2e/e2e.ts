/**
 * Pruebas en un navegador real (Chrome sin ventana) contra la web compilada y la base de datos
 * publica de Supabase (solo paginas de lectura: no inicia sesion ni escribe nada).
 *
 *   pnpm e2e        (compila en node_modules/.cache/e2e-dist con la ruta base de GitHub Pages)
 *
 * Comprueba:
 *  a) Sin desplazamiento horizontal en las paginas principales a 320/360/390/412/768/1024 px, en
 *     espanol y en ingles (si lo hay, dice que elementos se salen).
 *  b) Cada enlace interno de la portada, juegos, un juego, un perfil y mandos abre una pagina
 *     que se muestra bien (ni la pagina de error ni la de «no encontrada»).
 *  c) Ningun error en la consola del navegador ni peticiones propias fallidas.
 *  d) Web instalable: manifiesto con la ruta base, service worker activo y, en su cache, solo
 *     archivos estaticos propios (ningun HTML ni nada de Supabase).
 *
 * Variables: CHROME_PATH (por defecto /usr/bin/google-chrome), E2E_BASE_PATH (por defecto
 * /GamePadMapperPluton/), E2E_SKIP_BUILD=1 para reutilizar la compilacion, E2E_MAX_LINKS.
 * Necesita VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (variables o web/.env.local).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = process.env.E2E_BASE_PATH ?? '/GamePadMapperPluton/';
const PORT = Number(process.env.E2E_PORT ?? 4319);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const OUT = join(WEB, 'node_modules', '.cache', 'e2e-dist');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
const WIDTHS = [320, 360, 390, 412, 768, 1024];
const LANGS = ['es', 'en'] as const;
const MAX_LINKS = Number(process.env.E2E_MAX_LINKS ?? 150);
const VITE = join(WEB, 'node_modules', 'vite', 'bin', 'vite.js');

const failures: string[] = [];
const fail = (msg: string) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};
const log = (msg: string) => console.log(msg);

// ------------------------------------------------------------------ compilar y servir
function build(): void {
  if (process.env.E2E_SKIP_BUILD === '1' && existsSync(join(OUT, 'index.html'))) return;
  log(`Compilando (base ${BASE})…`);
  const r = spawnSync(process.execPath, [VITE, 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: WEB, stdio: 'inherit', env: { ...process.env, VITE_BASE_PATH: BASE },
  });
  if (r.status !== 0) throw new Error('La compilacion ha fallado');
}

async function serve(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [VITE, 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: WEB, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, VITE_BASE_PATH: BASE },
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${ORIGIN}${BASE}`)).ok) return child;
    } catch {
      // aun arrancando
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('vite preview no ha arrancado');
}

// ------------------------------------------------------------------ navegador
/** Errores de consola, de la pagina y peticiones propias fallidas (para la comprobacion c). */
function watch(page: Page, label: () => string): void {
  page.on('console', (msg) => {
    if (msg.type() === 'error') fail(`consola (${label()}): ${msg.text().slice(0, 300)}`);
  });
  page.on('pageerror', (err) => fail(`error JS (${label()}): ${String(err).slice(0, 300)}`));
  page.on('requestfailed', (req) => {
    const error = req.failure()?.errorText ?? '';
    // Las peticiones canceladas al cambiar de pagina no son errores.
    if (req.url().startsWith(ORIGIN) && !error.includes('ERR_ABORTED')) fail(`peticion fallida (${label()}): ${req.url()} ${error}`);
  });
  page.on('response', (res) => {
    if (res.url().startsWith(ORIGIN) && res.status() >= 400 && res.request().resourceType() !== 'document') {
      fail(`respuesta ${res.status()} (${label()}): ${res.url()}`);
    }
  });
}

/** Abre una ruta y espera a que la pagina termine de cargar (red tranquila y sin indicador de carga). */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${ORIGIN}${BASE}${path.replace(/^\//, '')}`, { waitUntil: 'networkidle0', timeout: 45_000 });
  await page.waitForFunction(
    () => !document.querySelector('main [role="status"]') && (document.querySelector('main')?.textContent ?? '').trim().length > 0,
    { timeout: 20_000 },
  ).catch(() => fail(`la pagina no termino de cargar: ${path}`));
}

async function newPage(browser: Browser, lang: string, label: () => string): Promise<Page> {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((l: string) => {
    try {
      localStorage.setItem('gpm.lang', l);
    } catch {
      // sin almacenamiento: idioma del navegador
    }
  }, lang);
  watch(page, label);
  return page;
}

/** Primer enlace interno que empieza por ese prefijo (para encontrar un juego y un perfil reales). */
async function firstLink(page: Page, prefix: string): Promise<string | null> {
  return page.evaluate((p: string) => {
    const a = [...document.querySelectorAll('a[href]')].find((el) => (el.getAttribute('href') ?? '').startsWith(p));
    return a?.getAttribute('href') ?? null;
  }, `${BASE}${prefix}`);
}

// ------------------------------------------------------------------ a) desplazamiento horizontal
interface Overflow { scrollWidth: number; clientWidth: number; offenders: string[] }

/** Si la pagina se desplaza en horizontal, los elementos mas profundos que se salen. */
function measureOverflow(): Overflow | null {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  if (doc.scrollWidth <= vw) return null;
  const describe = (el: Element) => {
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}> ${Math.round(r.left)}..${Math.round(r.right)}px «${text}»`;
  };
  const outside: Element[] = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if ((r.width === 0 && r.height === 0) || (r.right <= vw + 1 && r.left >= -1)) continue;
    // Dentro de un contenedor con su propio desplazamiento o recorte: no mueve la pagina.
    let parent = el.parentElement;
    let clipped = false;
    while (parent && parent !== document.body) {
      if (getComputedStyle(parent).overflowX !== 'visible') {
        clipped = true;
        break;
      }
      parent = parent.parentElement;
    }
    if (!clipped) outside.push(el);
  }
  const deepest = outside.filter((el) => !outside.some((o) => o !== el && el.contains(o)));
  return { scrollWidth: doc.scrollWidth, clientWidth: vw, offenders: deepest.slice(0, 6).map(describe) };
}

async function checkOverflow(browser: Browser, routes: readonly string[]): Promise<void> {
  log('\na) Desplazamiento horizontal');
  for (const lang of LANGS) {
    let current = '';
    const page = await newPage(browser, lang, () => `${lang} ${current}`);
    if (lang === LANGS[0]) {
      // Control: un elemento demasiado ancho tiene que detectarse (si no, la prueba no sirve).
      await page.setViewport({ width: 320, height: 800 });
      await open(page, '');
      await page.evaluate(() => {
        const div = document.createElement('div');
        div.id = 'e2e-control';
        div.style.width = '2000px';
        div.style.height = '1px';
        document.querySelector('main')?.append(div);
      });
      const canary = await page.evaluate(measureOverflow);
      await page.evaluate(() => document.getElementById('e2e-control')?.remove());
      if (!canary?.offenders.some((o) => o.includes('#e2e-control'))) fail('la deteccion de desplazamiento horizontal no funciona');
    }
    for (const route of routes) {
      current = route;
      await page.setViewport({ width: 1024, height: 800 });
      await open(page, route);
      const bad: string[] = [];
      for (const width of WIDTHS) {
        await page.setViewport({ width, height: 800 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const overflow = await page.evaluate(measureOverflow);
        if (overflow) {
          bad.push(`${width}px`);
          fail(`desplazamiento horizontal en ${route} (${lang}, ${width}px): ${overflow.scrollWidth} > ${overflow.clientWidth}\n      ${overflow.offenders.join('\n      ')}`);
        }
      }
      log(`  ${bad.length ? '✗' : '✓'} ${lang} ${route}${bad.length ? ` (${bad.join(', ')})` : ''}`);
    }
    await page.close();
  }
}

// ------------------------------------------------------------------ b) enlaces internos
async function collectLinks(page: Page): Promise<string[]> {
  return page.evaluate((origin: string, base: string) => [...document.querySelectorAll('a[href]')]
    .map((a) => new URL(a.getAttribute('href') ?? '', location.href))
    .filter((u) => u.origin === origin && u.pathname.startsWith(base) && !/\.[a-z0-9]{2,5}$/i.test(u.pathname))
    .map((u) => `${u.pathname}${u.search}`), ORIGIN, BASE);
}

async function checkLinks(browser: Browser, sources: readonly string[]): Promise<void> {
  log('\nb) Enlaces internos');
  let current = '';
  const page = await newPage(browser, 'es', () => current);
  const links = new Set<string>();
  for (const source of sources) {
    current = source;
    await open(page, source);
    for (const link of await collectLinks(page)) links.add(link);
  }
  const list = [...links].sort().slice(0, MAX_LINKS);
  log(`  ${links.size} enlaces distintos (se prueban ${list.length})`);
  for (const link of list) {
    current = link;
    await open(page, link.slice(BASE.length));
    const state = await page.evaluate(() => {
      if (document.querySelector('[data-pagina="error"]')) return 'pagina de error';
      if (document.querySelector('[data-pagina="no-encontrada"]')) return 'pagina no encontrada';
      return (document.querySelector('main')?.textContent ?? '').trim() ? 'ok' : 'pagina vacia';
    });
    if (state !== 'ok') fail(`${link}: ${state}`);
  }
  log(`  ${list.length} enlaces comprobados`);
  await page.close();
}

// ------------------------------------------------------------------ d) web instalable
/** Manifiesto con la ruta base, service worker activo y en su cache solo estaticos propios. */
async function checkPwa(browser: Browser, routes: readonly string[]): Promise<void> {
  log('\nd) Web instalable');
  let current = '';
  const page = await newPage(browser, 'es', () => `pwa ${current}`);
  for (const route of routes) {
    current = route;
    await open(page, route);
  }
  const result = await page.evaluate(async (base: string) => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? '';
    const manifest = (await (await fetch(href)).json()) as { start_url?: string; scope?: string; icons?: unknown[] };
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((r) => setTimeout(() => r(null), 15_000)),
    ]);
    const cached: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) cached.push(new URL(req.url).pathname + new URL(req.url).search);
    }
    return {
      manifestOk: manifest.start_url === base && manifest.scope === base && (manifest.icons?.length ?? 0) >= 3,
      scope: registration ? new URL(registration.scope).pathname : null,
      cached,
      foreign: cached.length === 0 ? [] : cached.filter((p) => !p.startsWith(base)),
    };
  }, BASE);
  if (!result.manifestOk) fail('el manifiesto no tiene start_url/scope con la ruta base o le faltan iconos');
  if (result.scope !== BASE) fail(`el service worker no esta activo en ${BASE} (scope: ${result.scope ?? 'ninguno'})`);
  const html = result.cached.filter((p) => p.endsWith('/') || p.endsWith('.html') || !/\.[a-z0-9]{2,12}$/i.test(p));
  if (html.length) fail(`el service worker ha guardado HTML: ${html.join(', ')}`);
  if (result.foreign.length) fail(`el service worker ha guardado algo fuera de la web: ${result.foreign.join(', ')}`);
  if (result.cached.length === 0) fail('el service worker no ha guardado los archivos estaticos');
  log(`  manifiesto ${result.manifestOk ? '✓' : '✗'} · service worker ${result.scope === BASE ? '✓' : '✗'} · ${result.cached.length} estaticos en cache, ${html.length} HTML`);
  await page.close();
}

// ------------------------------------------------------------------ principal
async function main(): Promise<void> {
  if (!existsSync(CHROME)) throw new Error(`No encuentro Chrome en ${CHROME} (usa CHROME_PATH)`);
  build();
  const server = await serve();
  const args = process.env.CI || process.env.E2E_NO_SANDBOX ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args });
  try {
    // Un juego y un perfil reales (de la base de datos publica).
    let current = 'descubrir';
    const page = await newPage(browser, 'es', () => current);
    await open(page, 'juegos');
    const game = (await firstLink(page, 'juegos/'))?.slice(BASE.length) ?? null;
    let profile: string | null = null;
    if (game) {
      current = game;
      await open(page, game);
      profile = (await firstLink(page, 'perfil/'))?.slice(BASE.length) ?? null;
    }
    await page.close();
    if (!game) fail('no hay ningun juego en la lista (¿base de datos vacia?)');
    if (!profile) fail('no hay ningun perfil en el primer juego');
    log(`Juego: ${game ?? '-'} · Perfil: ${profile ?? '-'}`);

    const pages = ['', 'juegos', game, profile, 'mandos'].filter((p): p is string => p !== null);
    await checkOverflow(browser, [...pages, 'buscar', 'subir', 'editor', 'cuenta', 'avisos', 'normas', 'privacidad', 'no-existe']);
    await checkLinks(browser, pages);
    await checkPwa(browser, pages);
  } finally {
    await browser.close();
    server.kill();
  }
  log('\nc) Consola: ' + (failures.some((f) => /^(consola|error JS|peticion|respuesta)/.test(f)) ? 'con errores' : 'sin errores'));
  if (failures.length) {
    console.error(`\nE2E: ${failures.length} fallo(s)`);
    process.exit(1);
  }
  log('\nE2E: TODO CORRECTO');
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
