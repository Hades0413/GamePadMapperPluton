import { z } from 'zod';

/** Configuracion publica de la web, validada al arrancar (falla pronto si falta algo). */
const schema = z.object({
  // https siempre; http solo en local (supabase start / pruebas).
  VITE_SUPABASE_URL: z.url({ protocol: /^https?$/ }).refine(
    (u) => u.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u),
    'debe empezar por https://',
  ),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_SITE_URL: z.url({ protocol: /^https?$/ }),
  VITE_BASE_PATH: z.string().regex(/^\/([\w-]+\/)*$/).default('/'),
  VITE_PLAY_URL: z.url({ protocol: /^https$/ }).default('https://play.google.com/store/apps/details?id=com.gamepadmapper.app'),
  VITE_REPO_URL: z.url({ protocol: /^https$/ }).default('https://github.com/Hades0413/GamePadMapperPluton'),
});

export interface Env {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  /** Direccion publica de la web, sin barra final. */
  readonly siteUrl: string;
  readonly basePath: string;
  readonly playUrl: string;
  readonly repoUrl: string;
}

export function readEnv(source: Record<string, unknown> = import.meta.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuración incompleta (${fields}). Revisa web/.env.local (ver .env.example).`);
  }
  const e = parsed.data;
  return {
    supabaseUrl: e.VITE_SUPABASE_URL.replace(/\/+$/, ''),
    supabaseAnonKey: e.VITE_SUPABASE_ANON_KEY,
    siteUrl: e.VITE_SITE_URL.replace(/\/+$/, ''),
    basePath: e.VITE_BASE_PATH,
    playUrl: e.VITE_PLAY_URL,
    repoUrl: e.VITE_REPO_URL,
  };
}
