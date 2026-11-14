import { useSyncExternalStore } from 'react';

/** Evento de Chrome/Edge/Android para ofrecer instalar la web (no esta en los tipos del DOM). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Web instalable: guarda el aviso de instalacion del navegador (para el boton «Instalar la web») y
 * registra el service worker (solo en produccion: guarda archivos estaticos, nunca datos ni HTML).
 */
export function setupPwa(basePath: string): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = () => {
      navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath }).catch((e: unknown) => {
        console.warn('No se pudo registrar el service worker', e);
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Funcion para mostrar el dialogo de instalacion, o null si el navegador no lo ofrece. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const event = useSyncExternalStore(subscribe, () => deferred, () => null);
  if (!event) return null;
  return async () => {
    await event.prompt();
    await event.userChoice.catch(() => undefined);
    // El evento solo sirve una vez.
    deferred = null;
    notify();
  };
}
