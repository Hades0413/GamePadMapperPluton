import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../config/env';

export function createSupabase(env: Env): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      // PKCE: el codigo que vuelve de GitHub no sirve sin el secreto guardado en este navegador.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { headers: { 'x-client-info': 'gamepad-mapper-pluton-web' } },
  });
}
