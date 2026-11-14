/** Icono del juego, o sus iniciales con un color estable si no tiene. */
export function GameIcon({ name, iconUrl, size = 48 }: { name: string; iconUrl: string | null; size?: number }) {
  if (iconUrl) {
    return (
      <img src={iconUrl} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer"
        className="shrink-0 rounded-xl bg-surface-2 object-cover" style={{ width: size, height: size }} />
    );
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hash % 360} 45% 32%)` }}>
      {initials}
    </span>
  );
}
