/** Descarga un texto como archivo (sin servidor). */
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName, rel: 'noopener' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Lee un archivo de texto pequeno elegido por el usuario. */
export async function readSmallTextFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new Error(`El archivo es demasiado grande (máximo ${Math.round(maxBytes / 1024)} KB).`);
  return file.text();
}

/** Texto en base64url (UTF-8) -> texto. Para recibir un perfil desde la app en el enlace. */
export function decodeBase64Url(value: string, maxBytes: number): string | null {
  try {
    if (value.length > (maxBytes * 4) / 3 + 8 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export const isAndroid = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
