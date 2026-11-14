import type { Account } from '@domain/author/Author';
import type { AuthGateway, Unsubscribe } from '../ports/AuthGateway';
import { safeReturnPath } from '../shared/guards';

export class GetCurrentAccount {
  readonly #auth: AuthGateway;

  constructor(auth: AuthGateway) {
    this.#auth = auth;
  }

  execute(): Promise<Account | null> {
    return this.#auth.currentAccount();
  }
}

export class ObserveSession {
  readonly #auth: AuthGateway;

  constructor(auth: AuthGateway) {
    this.#auth = auth;
  }

  execute(listener: () => void): Unsubscribe {
    return this.#auth.onChange(listener);
  }
}

export class SignInWithGitHub {
  readonly #auth: AuthGateway;

  constructor(auth: AuthGateway) {
    this.#auth = auth;
  }

  execute(returnTo: string): Promise<void> {
    return this.#auth.signInWithGitHub(safeReturnPath(returnTo));
  }
}

export class TakeReturnPath {
  readonly #auth: AuthGateway;

  constructor(auth: AuthGateway) {
    this.#auth = auth;
  }

  /** Ruta a la que volver tras el inicio de sesion, o null si no venimos de GitHub. */
  execute(): string | null {
    const path = this.#auth.takeReturnPath();
    return path === null ? null : safeReturnPath(path);
  }
}

export class SignOut {
  readonly #auth: AuthGateway;

  constructor(auth: AuthGateway) {
    this.#auth = auth;
  }

  execute(): Promise<void> {
    return this.#auth.signOut();
  }
}

export class DeleteAccount {
  readonly #auth: AuthGateway;

  constructor(auth: AuthGateway) {
    this.#auth = auth;
  }

  execute(): Promise<void> {
    return this.#auth.deleteAccount();
  }
}
