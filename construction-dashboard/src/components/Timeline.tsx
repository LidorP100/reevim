import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { countDone } from '../engine'
import { fmt, fromDay, toDay, TODAY } from '../date'
import { CountUp, Icon } from './ui'

export function useRange() {
  const { model, done } = useStore()
  return useMemo(() => {
    let maxDone = 0
    let minDone = Infinity
    for (const d of done.values()) {
      if (d > maxDone) maxDone = d
      if (d < minDone) minDone = d
    }
    const start = Math.min(model.minDay, minDone) - 7
    const end = Math.max(model.maxDay + 30, maxDone, TODAY + 30)
    return { start, end }
  }, [model, done])
}

const STEPS = [
  { label: 'יום', days: 1 },
  { label: 'שבוע', days: 7 },
  { label: 'חודש', days: 30 },
]

export function Timeline() {
  const { date, setDate, model, done } = useStore()
  const { start, end } = useRange()
  const [playing, setPlaying] = useState(false)
  const [step, setStep] = useState(7)

  useEffect(() => {
    if (!playing) return
    const h = setInterval(() => {
      setDate(Math.min(end, date + step))
      if (date + step >= end) setPlaying(false)
    }, 140)
    return () => clearInterval(h)
  }, [playing, date, step, end, setDate])

  // מקשי קיצור: רווח = נגן, חצים = צעד
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'ArrowLeft') setDate(Math.max(start, date - step))
      else if (e.key === 'ArrowRight') setDate(Math.min(end, date + step))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [date, step, start, end, setDate])

  const total = useMemo(() => countDone(done, model.tasks, date), [done, model, date])
  const pos = (d: number) => ((d - start) / (end - start)) * 100
  const ticks = useMemo(() => {
    const out: { d: number; label: string }[] = []
    const s = new Date(fromDay(start) + 'T00:00:00Z')
    s.setUTCDate(1)
    s.setUTCMonth(Math.ceil((s.getUTCMonth() + 1) / 6) * 6)
    while (true) {
      const d = Math.floor(s.getTime() / 86400000)
      if (d > end) break
      if (d >= start) out.push({ d, label: s.getUTCMonth() === 0 ? String(s.getUTCFullYear()) : `${s.getUTCMonth() + 1}/${String(s.getUTCFullYear()).slice(2)}` })
      s.setUTCMonth(s.getUTCMonth() + 6)
    }
    return out
  }, [start, end])

  return (
    <div className="timeline">
      <button
        className={`play${playing ? ' on' : ''}`}
        onClick={() => {
          if (!playing && date >= end) setDate(start)
          setPlaying(!playing)
        }}
        title={playing ? 'עצור (רווח)' : 'נגן את התקדמות הבנייה (רווח)'}
        aria-label={playing ? 'עצור' : 'נגן'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={16} />
      </button>
      <div className="seg" role="group" aria-label="גודל צעד">
        {STEPS.map((s) => (
          <button key={s.days} className={step === s.days ? 'on' : ''} onClick={() => setStep(s.days)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="slider-wrap" dir="ltr">
        <div className="slider-bubble" style={{ left: `${pos(date)}%` }}>
          {fmt(date)}
        </div>
        <div className="slider-track">
          <div className="slider-fill" style={{ width: `${pos(date)}%` }} />
          <div className="today-mark" style={{ left: `${pos(TODAY)}%` }} title="היום" />
          <div className="slider-thumb" style={{ left: `${pos(date)}%` }} />
        </div>
        <div className="slider-ticks">
          {ticks.map((t) => (
            <span key={t.d} style={{ left: `${pos(t.d)}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        <input
          id="timeline-range"
          type="range"
          min={start}
          max={end}
          value={date}
          aria-label="תאריך"
          onChange={(e) => {
            setPlaying(false)
            setDate(+e.target.value)
          }}
        />
      </div>
      <input id="timeline-date" type="date" value={fromDay(date)} onChange={(e) => e.target.value && setDate(toDay(e.target.value))} aria-label="בחירת תאריך" />
      <button
        className="btn"
        onClick={() => {
          setPlaying(false)
          setDate(TODAY)
        }}
        disabled={date === TODAY}
      >
        היום
      </button>
      <div className="timeline-stat">
        <b>
          <CountUp value={total.pct} decimals={1} suffix="%" />
        </b>
        <span>
          {total.done.toLocaleString()} / {total.total.toLocaleString()} משימות
        </span>
      </div>
    </div>
  )
}
