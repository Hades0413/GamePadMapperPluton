import { Fragment, type ReactNode } from 'react';
import type { RichVars } from './I18nContext';

const TOKEN = /<b>(.*?)<\/b>|<c>(.*?)<\/c>|\{(\w+)\}/g;

/** Convierte un texto ya traducido en nodos: <b> -> strong, <c> -> code, {x} -> vars.x. */
export function richNodes(text: string, vars: RichVars = {}): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = n++;
    if (m[1] !== undefined) out.push(<strong key={key}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<code key={key}>{m[2]}</code>);
    else out.push(<Fragment key={key}>{vars[m[3] ?? ''] ?? m[0]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
