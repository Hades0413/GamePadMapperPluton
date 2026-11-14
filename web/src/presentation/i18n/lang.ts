import { detectLang, isLang, LANG_STORAGE_KEY, type Lang } from './translate';

/** Idioma de la web: un valor global pequeno al que se suscribe React (useSyncExternalStore). */

function readSaved(): string | null {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readBrowserLanguage(): string | null {
  try {
    return navigator.language;
  } catch {
    return null;
  }
}

function applyToDocument(lang: Lang) {
  try {
    document.documentElement.lang = lang;
  } catch {
    // sin documento (tests): nada que hacer
  }
}

let current: Lang = detectLang(readSaved(), readBrowserLanguage());
applyToDocument(current);
const listeners = new Set<() => void>();

export const getLang = (): Lang => current;

export function setLang(lang: Lang) {
  if (!isLang(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // almacenamiento bloqueado: el idioma vale solo en esta visita
  }
  applyToDocument(lang);
  listeners.forEach((listener) => listener());
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
