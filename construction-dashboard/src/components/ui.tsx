import { useEffect, useRef, useState, type ReactNode } from 'react'
import { pctColor } from '../engine'

const P: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9" />,
  cube: (
    <>
      <path d="m12 2.5 8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M3.5 7.25 12 12l8.5-4.75M12 12v9.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  board: (
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </>
  ),
  flow: <path d="M3 20 9 13l4 3 8-10M3 4v16h18" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  alert: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 10v4M12 17.5v.5" />
    </>
  ),
  report: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h7M9 16h7" />
    </>
  ),
  tools: <path d="M14.5 6.5a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.5-1.5a4 4 0 0 1-5-5L13 2zM3 21l6-6" />,
  building: (
    <>
      <path d="M4 21V5l8-2v18M12 8h8v13M2 21h20" />
      <path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" stroke="none" />,
  check: <path d="m4.5 12.5 5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  undo: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  sunset: <path d="M12 3v5M5 10l2 2M19 10l-2 2M3 17h18M6 17a6 6 0 0 1 12 0M7 21h10" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  trend: <path d="M3 17 9 11l4 4 8-8M15 7h6v6" />,
  flag: <path d="M5 21V4h11l-2 4 2 4H5" />,
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  door: <path d="M5 21V3h11v18M16 5h3v16M2 21h20M12 12h.5" />,
  crane: <path d="M6 21V5M3 21h6M6 5h15M6 5l4-3M18 5v6M17 11h2v2h-2zM6 9l4-4M6 13l4-4" />,
  camera: (
    <>
      <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
}

export function Icon({ name, size = 18, stroke = 1.8 }: { name: keyof typeof P | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  )
}

/** מספר שעולה בהנפשה עד לערך */
export function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || Math.abs(value - a) < 1e-9) {
      setShown(value)
      from.current = value
      return
    }
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 650)
      const e = 1 - Math.pow(1 - k, 3)
      const v = a + (value - a) * e
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = value
    }
  }, [value])
  return (
    <>
      {shown.toLocaleString('he-IL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </>
  )
}

export function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="bar" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color ?? pctColor(pct) }} />
    </div>
  )
}

export function Ring({ pct, size = 150, label, sub }: { pct: number; size?: number; label: ReactNode; sub?: string }) {
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={11} fill="none" />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={11}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)}
        />
      </svg>
      <div className="ring-label">
        <b style={{ fontSize: Math.round(size * 0.22) }}>{label}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

const AV = ['#1f5fd6', '#1d9a5f', '#c2410c', '#7c3aed', '#0e7490', '#b45309', '#be185d']
export function Avatar({ id, name }: { id?: string; name?: string }) {
  const n = name || 'משתמש'
  let h = 0
  for (const ch of id ?? n) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (
    <span className="avatar" style={{ background: AV[Math.abs(h) % AV.length] }} title={n}>
      {n.trim().slice(0, 1)}
    </span>
  )
}
