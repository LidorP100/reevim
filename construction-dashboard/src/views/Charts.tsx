import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStore } from '../store'
import { countDone, isDone, scopeTasks } from '../engine'
import { ScopePicker } from '../components/ScopePicker'
import { useRange } from '../components/Timeline'
import { fmt, fmtMonth, fromDay, TODAY } from '../date'

const AXIS = { fontSize: 12, fill: 'var(--muted)' }

export function Charts() {
  const { model, done, date, sel } = useStore()
  const { start, end } = useRange()
  const tasks = useMemo(() => scopeTasks(model, sel.lotId, sel.buildingId, sel.aptId), [model, sel])

  // עקומת התקדמות מצטברת + קצב חודשי
  const { curve, monthly } = useMemo(() => {
    const days = tasks.map((t) => done.get(t.id)).filter((d): d is number => d !== undefined).sort((a, b) => a - b)
    const curve: { day: number; pct: number }[] = []
    let i = 0
    for (let d = start; d <= end; d += 7) {
      while (i < days.length && days[i] <= d) i++
      curve.push({ day: d, pct: tasks.length ? +((i / tasks.length) * 100).toFixed(1) : 0 })
    }
    const byMonth = new Map<string, number>()
    for (const d of days) {
      const k = fromDay(d).slice(0, 7)
      byMonth.set(k, (byMonth.get(k) ?? 0) + 1)
    }
    const monthly: { month: string; n: number }[] = []
    const cur = new Date(fromDay(start).slice(0, 7) + '-01T00:00:00Z')
    const last = fromDay(Math.min(end, TODAY)).slice(0, 7)
    while (cur.toISOString().slice(0, 7) <= last) {
      const k = cur.toISOString().slice(0, 7)
      monthly.push({ month: `${k.slice(5, 7)}/${k.slice(2, 4)}`, n: byMonth.get(k) ?? 0 })
      cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
    return { curve, monthly }
  }, [tasks, done, start, end])

  const byTrade = useMemo(
    () =>
      model.trades
        .map((t) => {
          const ts = tasks.filter((x) => x.tradeId === t.id)
          return { name: t.name, color: t.color, pct: +countDone(done, ts, date).pct.toFixed(1), n: ts.length }
        })
        .filter((x) => x.n > 0),
    [model, tasks, done, date],
  )

  const breakdown = useMemo(() => {
    if (sel.aptId) return null
    if (sel.buildingId) {
      const b = model.buildingById.get(sel.buildingId)!
      return {
        title: `התקדמות לפי קומה — בניין ${b.name}`,
        rows: Array.from({ length: b.floors }, (_, i) => b.floors - 1 - i).map((f) => ({
          name: `קומה ${f}`,
          pct: +countDone(done, tasks.filter((t) => t.floor === f), date).pct.toFixed(1),
        })),
      }
    }
    const bs = model.buildings.filter((b) => !sel.lotId || b.lotId === sel.lotId)
    return {
      title: 'התקדמות לפי בניין',
      rows: bs.map((b) => ({
        name: b.name,
        pct: +countDone(done, model.tasksByBuilding.get(b.id) ?? [], date).pct.toFixed(1),
      })),
    }
  }, [model, sel, tasks, done, date])

  const apt = sel.aptId ? model.aptById.get(sel.aptId) : undefined
  const now = countDone(done, tasks, date)
  const scopeName = apt
    ? `דירה ${apt.number}, בניין ${model.buildingById.get(apt.buildingId)?.name}`
    : sel.buildingId
      ? `בניין ${model.buildingById.get(sel.buildingId)?.name}`
      : sel.lotId
        ? model.lots.find((l) => l.id === sel.lotId)?.name
        : 'כל הפרויקט'

  return (
    <div className="view">
      <div className="toolbar">
        <ScopePicker withApt />
        <div className="muted">
          {scopeName}: <b>{now.pct.toFixed(1)}%</b> ({now.done}/{now.total} משימות) נכון ל־{fmt(date)}
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>התקדמות מצטברת לאורך זמן</h3>
          <div className="chart" dir="ltr">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={curve} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="day" type="number" domain={[start, end]} tickFormatter={fmtMonth} tick={AXIS} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} />
                <Tooltip labelFormatter={(d) => fmt(+d)} formatter={(v) => [`${v}%`, 'בוצע']} />
                <Area type="monotone" dataKey="pct" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
                <ReferenceLine x={date} stroke="var(--ink)" strokeDasharray="4 3" label={{ value: fmt(date), position: 'top', fontSize: 11 }} />
                <ReferenceLine x={TODAY} stroke="var(--danger)" strokeOpacity={0.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <h3>קצב ביצוע — משימות שהושלמו בכל חודש</h3>
          <div className="chart" dir="ltr">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="month" tick={AXIS} interval="preserveStartEnd" />
                <YAxis tick={AXIS} />
                <Tooltip formatter={(v) => [v, 'משימות']} />
                <Bar dataKey="n" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <h3>התקדמות לפי מלאכה</h3>
          <div className="chart" dir="ltr">
            <ResponsiveContainer width="100%" height={Math.max(260, byTrade.length * 24)}>
              <BarChart data={byTrade} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="var(--grid)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} />
                <YAxis type="category" dataKey="name" width={110} tick={AXIS} interval={0} />
                <Tooltip formatter={(v) => [`${v}%`, 'בוצע']} />
                <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                  {byTrade.map((r) => (
                    <Cell key={r.name} fill={r.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {breakdown ? (
          <section className="card">
            <h3>{breakdown.title}</h3>
            <div className="chart" dir="ltr">
              <ResponsiveContainer width="100%" height={Math.max(260, breakdown.rows.length * 22)}>
                <BarChart data={breakdown.rows} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={AXIS} />
                  <YAxis type="category" dataKey="name" width={70} tick={AXIS} interval={0} />
                  <Tooltip formatter={(v) => [`${v}%`, 'בוצע']} />
                  <Bar dataKey="pct" fill="var(--accent)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : (
          <section className="card">
            <h3>מלאכות בדירה</h3>
            <table className="list">
              <thead>
                <tr>
                  <th>מלאכה</th>
                  <th>סטטוס</th>
                  <th>תאריך ביצוע</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const tr = model.tradeById.get(t.tradeId)!
                  const ok = isDone(done, t.id, date)
                  const d = done.get(t.id)
                  return (
                    <tr key={t.id}>
                      <td>
                        <span className="dot" style={{ background: tr.color }} /> {tr.name}
                        {tr.level === 'floor' && <span className="muted"> (קומה)</span>}
                      </td>
                      <td className={ok ? 'ok' : 'muted'}>{ok ? '✓ בוצע' : 'לא בוצע'}</td>
                      <td>{ok && d !== undefined ? fmt(d) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  )
}
