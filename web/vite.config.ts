/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Seguridad en produccion (GitHub Pages no deja poner cabeceras HTTP, asi que va en <meta>):
 *  - Content-Security-Policy: solo scripts propios, conexiones solo a Supabase, sin iframes ni plugins.
 *  - 404.html = index.html, para que las rutas de la web funcionen al abrirlas directamente.
 *  - Las rutas fijas (privacidad, normas...) tienen su propia copia: responden 200 y no 404
 *    (Google Play exige que la URL de la politica de privacidad responda bien).
 */
const STATIC_ROUTES = ['juegos', 'subir', 'cuenta', 'admin', 'privacidad', 'normas'];

function securityAndSpa(supabaseUrl: string): Plugin {
  const supabase = supabaseUrl.replace(/\/+$/, '');
  const local = supabase.startsWith('http://');
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https:",
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
    closeBundle() {
      const index = join(outDir, 'index.html');
      copyFileSync(index, join(outDir, '404.html'));
      for (const route of STATIC_ROUTES) {
        mkdirSync(join(outDir, route), { recursive: true });
        copyFileSync(index, join(outDir, route, 'index.html'));
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
    plugins: [react(), tailwindcss(), securityAndSpa(env.VITE_SUPABASE_URL ?? '')],
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
