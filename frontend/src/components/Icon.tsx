/** Inline line icons (24px grid, currentColor). One consistent stroke so emoji never stand in for UI. */
const PATHS = {
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.6" /><path d="M10.5 18.5h3" /></>,
  send: <path d="M4.5 12 19.5 5l-5 15-3.2-6.3L4.5 12Zm6.8 1.7L19.5 5" />,
  handsfree: <><path d="M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3Z" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5" /><path d="M3 8.5c-.8 1.6-.8 3.4 0 5M21 8.5c.8 1.6.8 3.4 0 5" /></>,
  trash: <><path d="M4.5 6.5h15M9.5 6.5V4.5h5v2" /><path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" /><path d="M10 10.5v6M14 10.5v6" /></>,
  list: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  warning: <><path d="M12 4 21 19.5H3L12 4Z" /><path d="M12 10v4.5M12 17v.01" /></>,
  sparkle: <path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2L12 3.5Z" />,
  left: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  right: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  camera: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="13" r="3.5" /></>,
  scissors: <><circle cx="6.5" cy="6.5" r="2.8" /><circle cx="6.5" cy="17.5" r="2.8" /><path d="M8.8 8.2 20 18M8.8 15.8 20 6" /></>,
  star: <path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8L12 3.8Z" />,
  face: <><path d="M12 3.5c4 0 6.5 3 6.5 7.3 0 5.2-3 9.7-6.5 9.7s-6.5-4.5-6.5-9.7C5.5 6.5 8 3.5 12 3.5Z" /><path d="M9.5 10.5v.01M14.5 10.5v.01M10 15.5q2 1.4 4 0" /></>,
  hair: <path d="M4.5 13c0-5 3.4-8.5 7.5-8.5s7.5 3.5 7.5 8.5M7 13c0-3.4 2.2-6 5-6s5 2.6 5 6M9.5 13c0-1.8 1.1-3.5 2.5-3.5s2.5 1.7 2.5 3.5" />,
  volume: <><path d="M4.5 9.5h3.5l4.5-4v13l-4.5-4H4.5Z" /><path d="M16 9a4.2 4.2 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  mute: <><path d="M4.5 9.5h3.5l4.5-4v13l-4.5-4H4.5Z" /><path d="m16 9.5 5 5m0-5-5 5" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></>,
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {PATHS[name]}
    </svg>
  )
}
