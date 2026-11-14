import type { AuthGateway, Unsubscribe } from '@application/ports/AuthGateway';
import type { Account } from '@domain/author/Author';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, toAppError, unwrap } from './errors';
import { toAuthor } from './mappers';
import { accountRow } from './rows';

const RETURN_KEY = 'gpm.returnTo';

/** Lee y escribe sessionStorage sin romper si el navegador lo bloquea (modo privado, etc.). */
const storage = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch {
      // sin almacenamiento: al volver se ira a la portada
    }
  },
};

export class SupabaseAuthGateway implements AuthGateway {
  readonly #db: SupabaseClient;
  readonly #redirectUrl: string;

  /** redirectUrl: direccion a la que vuelve GitHub (debe estar en Supabase > Auth > URL Configuration). */
  constructor(db: SupabaseClient, redirectUrl: string) {
    this.#db = db;
    this.#redirectUrl = redirectUrl;
  }

  async currentAccount(): Promise<Account | null> {
    const { data } = await this.#db.auth.getSession();
    if (!data.session) return null;
    const rows = parse(z.array(accountRow), unwrap(await this.#db.rpc('my_account')));
    const row = rows[0];
    return row ? { ...toAuthor(row), isAdmin: row.is_admin } : null;
  }

  onChange(listener: () => void): Unsubscribe {
    const { data } = this.#db.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Fuera del callback: llamar a Supabase dentro de el puede bloquear el cliente.
        setTimeout(listener, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithGitHub(returnTo: string): Promise<void> {
    storage.set(RETURN_KEY, returnTo);
    const { error } = await this.#db.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: this.#redirectUrl },
    });
    if (error) throw toAppError(error);
  }

  takeReturnPath(): string | null {
    const path = storage.get(RETURN_KEY);
    storage.set(RETURN_KEY, null);
    return path;
  }

  async signOut(): Promise<void> {
    const { error } = await this.#db.auth.signOut();
    if (error) throw toAppError(error);
  }

  async deleteAccount(): Promise<void> {
    unwrap(await this.#db.rpc('delete_my_account'));
    // La cuenta ya no existe: basta con borrar la sesion de este navegador.
    await this.#db.auth.signOut({ scope: 'local' });
  }
}
