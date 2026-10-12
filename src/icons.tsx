import type { ReactNode } from 'react';

// Icons are drawn on a 24×24 grid and rendered at 16px by default (≈1.33px stroke),
// with round caps/joins and no detail finer than ~2 grid units so they stay legible small.
type IconProps = { size?: number };
const icon = (paths: ReactNode, defaultSize = 16) =>
  ({ size = defaultSize }: IconProps = {}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      {paths}
    </svg>
  );

export const Ic = {
  lock:     icon(<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>),
  unlock:   icon(<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/></>),
  eyeOn:    icon(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>),
  eyeOff:   icon(<><path d="M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.4"/><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M3 3l18 18"/></>),
  upload:   icon(<><path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></>),
  download: icon(<><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/></>),
  drop:     icon(<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></>, 24),
  safe:     icon(<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 8h2M15 8h2M7 16h2M15 16h2M6 9v1M18 9v1M6 14v1M18 14v1"/></>),
  guides:   icon(<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></>),
  moon:     icon(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>),
  sun:      icon(<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>),
  trash:    icon(<><path d="M4 7h16"/><path d="M10 7V4h4v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></>),
  rotate:   icon(<><rect x="2" y="11" width="13" height="10" rx="2"/><path d="M10 4h3a5 5 0 0 1 5 5v4"/><path d="M15 10l3 3 3-3"/></>),
  refresh:  icon(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>),
  shuffle:  icon(<><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></>),
  bw:       icon(<><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></>),
  blur:     icon(<><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" strokeOpacity="0.55"/><circle cx="12" cy="12" r="9.5" strokeOpacity="0.25"/></>),
  crosshair:icon(<><circle cx="12" cy="12" r="4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></>, 18),
  chevron:  icon(<path d="M9 6l6 6-6 6"/>, 14),
  chevronDown: icon(<path d="M6 9l6 6 6-6"/>, 12),
  fitH:     icon(<><path d="M4 3h16M4 21h16"/><path d="M12 7v10"/><path d="M9 9.5l3-3 3 3M9 14.5l3 3 3-3"/></>),
  fitW:     icon(<><path d="M3 4v16M21 4v16"/><path d="M7 12h10"/><path d="M9.5 9l-3 3 3 3M14.5 9l3 3-3 3"/></>),
  copy:     icon(<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>),
  check:    icon(<path d="M5 12.5l4.5 4.5L19 7.5"/>),
  keyboard: icon(<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15h6"/></>),
  catAll:     icon(<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>),
  catDisplay: icon(<><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>),
  catVideo:   icon(<><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/></>),
  catSocial:  icon(<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z"/>),
  catMobile:  icon(<><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></>),
  catPrint:   icon(<><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></>),
  catMusic:   icon(<><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>),
};

export const CAT_ICONS: Record<string, (p?: IconProps) => JSX.Element> = {
  all: Ic.catAll, display: Ic.catDisplay, video: Ic.catVideo,
  social: Ic.catSocial, mobile: Ic.catMobile, print: Ic.catPrint,
  music: Ic.catMusic,
};
