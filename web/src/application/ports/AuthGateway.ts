import type { Account } from '@domain/author/Author';

export type Unsubscribe = () => void;

/** Inicio de sesion. Solo hace falta para subir perfiles, dar "me gusta" o reportar. */
export interface AuthGateway {
  currentAccount(): Promise<Account | null>;
  /** Avisa cuando se inicia o se cierra la sesion. */
  onChange(listener: () => void): Unsubscribe;
  /** Redirige a GitHub; al volver, la web abre returnTo. */
  signInWithGitHub(returnTo: string): Promise<void>;
  /** Ruta guardada antes de ir a GitHub (se consume una sola vez). */
  takeReturnPath(): string | null;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}
