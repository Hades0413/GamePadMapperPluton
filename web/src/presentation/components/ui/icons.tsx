import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;
const base = (p: Props) => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, className: 'size-4', ...p,
});

export const GitHubIcon = (p: Props) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
  </svg>
);
export const HeartIcon = ({ filled, ...p }: Props & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
);
export const DownloadIcon = (p: Props) => (
  <svg {...base(p)}><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" /></svg>
);
export const CopyIcon = (p: Props) => (
  <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const ShareIcon = (p: Props) => (
  <svg {...base(p)}><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" /></svg>
);
export const FlagIcon = (p: Props) => (
  <svg {...base(p)}><path d="M4 22V4m0 0h13l-2 4 2 4H4" /></svg>
);
export const UploadIcon = (p: Props) => (
  <svg {...base(p)}><path d="M12 21V9m0 0-4 4m4-4 4 4M4 3h16" /></svg>
);
export const SearchIcon = (p: Props) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
export const GamepadIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 11h4M8 9v4M15 12h.01M18 10h.01" />
    <path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59l-.9 7.6A2.6 2.6 0 0 0 4.4 19c.94 0 1.8-.52 2.22-1.36L7.5 16h9l.88 1.64A2.5 2.5 0 0 0 19.6 19a2.6 2.6 0 0 0 2.6-2.81l-.9-7.6A4 4 0 0 0 17.32 5Z" />
  </svg>
);
export const PlayStoreIcon = (p: Props) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <path d="M3.6 1.8 13.8 12 3.6 22.2a1.5 1.5 0 0 1-.6-1.2V3c0-.5.2-.9.6-1.2Zm11.3 11.3 2.4 2.4-11.2 6.4 8.8-8.8Zm3.6-3.6L21 11c.7.4.7 1.6 0 2l-2.6 1.5-2.6-2.5 2.7-2.5ZM6.1 2.1l11.2 6.4-2.4 2.4-8.8-8.8Z" />
  </svg>
);
export const ExpandIcon = (p: Props) => (
  <svg {...base(p)}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
);
export const ChevronLeftIcon = (p: Props) => (
  <svg {...base(p)}><path d="m15 18-6-6 6-6" /></svg>
);
export const ChevronRightIcon = (p: Props) => (
  <svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>
);
export const CloseIcon = (p: Props) => (
  <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
