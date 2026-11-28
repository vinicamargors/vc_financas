// Ícones de traço do mockup (docs/design/2026-11-28-redesign.html).
const PATHS = {
  home: <path d="M4 10.5 12 4l8 6.5V20H4z" strokeLinejoin="round" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  pie: (
    <>
      <path d="M12 3v9h9" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  jar: (
    <>
      <rect x="5" y="7" width="14" height="14" rx="3" />
      <path d="M8 3h8v4H8z" />
    </>
  ),
  check: <path d="M4 12.5 9 17 20 6" />,
  bank: <path d="M3 9 12 4l9 5M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18" strokeLinejoin="round" />,
  chev: <path d="m9 6 6 6-6 6" strokeWidth="2" />,
  plus: <path d="M12 5v14M5 12h14" />,
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
