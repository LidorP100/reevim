import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { countDone } from '../engine'
import { fmt, fromDay, toDay, TODAY } from '../date'

export function useRange() {
  const { model, done } = useStore()
  return useMemo(() => {
    let maxDone = 0
    for (const d of done.values()) if (d > maxDone) maxDone = d
    const start = model.minDay - 7
    const end = Math.max(model.maxDay + 150, maxDone, TODAY + 30)
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
    }, 160)
    return () => clearInterval(h)
  }, [playing, date, step, end, setDate])

  const total = useMemo(() => countDone(done, model.tasks, date), [done, model, date])
  const todayPos = ((TODAY - start) / (end - start)) * 100

  return (
    <div className="timeline">
      <button
        className="btn primary play"
        onClick={() => {
          if (!playing && date >= end) setDate(start)
          setPlaying(!playing)
        }}
        title={playing ? 'עצור' : 'נגן את התקדמות הבנייה'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <select value={step} onChange={(e) => setStep(+e.target.value)} title="קפיצה בכל צעד">
        {STEPS.map((s) => (
          <option key={s.days} value={s.days}>
            צעד: {s.label}
          </option>
        ))}
      </select>
      <div className="slider-wrap" dir="ltr">
        <input
          type="range"
          min={start}
          max={end}
          value={date}
          onChange={(e) => {
            setPlaying(false)
            setDate(+e.target.value)
          }}
        />
        <div className="today-mark" style={{ left: `${todayPos}%` }} title="היום" />
        <div className="slider-labels">
          <span>{fmt(start)}</span>
          <span>{fmt(end)}</span>
        </div>
      </div>
      <input
        type="date"
        value={fromDay(date)}
        onChange={(e) => e.target.value && setDate(toDay(e.target.value))}
      />
      <button className="btn" onClick={() => { setPlaying(false); setDate(TODAY) }}>
        היום
      </button>
      <div className="timeline-stat">
        <b>{total.pct.toFixed(1)}%</b>
        <span>
          {total.done.toLocaleString()} / {total.total.toLocaleString()} משימות
        </span>
      </div>
    </div>
  )
}
