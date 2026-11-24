import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store'
import { floorFinish, floorLabel } from '../engine'
import { ScopePicker } from '../components/ScopePicker'
import { fmt, fmtMonth, TODAY } from '../date'

export function Flowline() {
  const { model, done, date, sel, setSel } = useStore()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!sel.buildingId && model.buildings.length) {
      const b = model.buildings.find((x) => !sel.lotId || x.lotId === sel.lotId) ?? model.buildings[0]
      setSel({ buildingId: b.id, lotId: b.lotId })
    }
  }, [sel.buildingId, sel.lotId, model, setSel])
  const b = sel.buildingId ? model.buildingById.get(sel.buildingId) : undefined

  const { series, minX, maxX, gaps } = useMemo(() => {
    if (!b) return { series: [], minX: 0, maxX: 1, gaps: [] as { a: string; b: string; days: number }[] }
    let minX = Infinity
    let maxX = -Infinity
    const series = model.trades.map((t) => {
      const pts: { day: number; floor: number }[] = []
      for (let f = 0; f < b.floors; f++) {
        const ff = floorFinish(model, done, b.id, t.id, f)
        if (ff.last !== undefined && ff.last <= date) {
          pts.push({ day: ff.last, floor: f })
          minX = Math.min(minX, ff.last)
          maxX = Math.max(maxX, ff.last)
        }
      }
      return { t, pts }
    })
    // פער ממוצע בין מלאכות עוקבות (באותה קומה)
    const gaps: { a: string; b: string; days: number }[] = []
    for (const s of series) {
      const prev = s.t.after ? series.find((x) => x.t.id === s.t.after) : undefined
      if (!prev) continue
      const diffs: number[] = []
      for (const p of s.pts) {
        const q = prev.pts.find((x) => x.floor === p.floor)
        if (q) diffs.push(p.day - q.day)
      }
      if (diffs.length) gaps.push({ a: prev.t.name, b: s.t.name, days: Math.round(diffs.reduce((x, y) => x + y, 0) / diffs.length) })
    }
    if (!isFinite(minX)) {
      minX = date - 30
      maxX = date
    }
    return { series, minX: minX - 10, maxX: Math.max(maxX, date) + 10, gaps }
  }, [b, model, done, date])

  if (!b) return null
  const visible = series.filter((s) => !hidden.has(s.t.id) && s.pts.length > 0)

  return (
    <>
      <div className="toolbar">
        <ScopePicker requireBuilding />
        <span className="muted small">כל נקודה = יום שבו מלאכה הושלמה בכל הקומה. קווים מקבילים במרווח קבוע = זרימה תקינה.</span>
      </div>
      <section className="card">
        <div className="card-head">
          <h3>
            קו זרימה — בניין {b.name}
            {b.type ? ` (${b.type})` : ''}
          </h3>
          <div className="chips">
            {series.map((s) => (
              <button
                key={s.t.id}
                className="chip"
                style={{ opacity: hidden.has(s.t.id) ? 0.4 : 1 }}
                onClick={() =>
                  setHidden((h) => {
                    const n = new Set(h)
                    if (n.has(s.t.id)) n.delete(s.t.id)
                    else n.add(s.t.id)
                    return n
                  })
                }
              >
                <span className="dot" style={{ background: s.t.color }} />
                {s.t.name}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <div className="empty">עדיין אין קומות שהושלמו בבניין הזה עד {fmt(date)}.</div>
        ) : (
          <div className="chart" dir="ltr">
            <ResponsiveContainer width="100%" height={Math.max(360, b.floors * 34 + 80)}>
              <LineChart margin={{ top: 16, right: 20, left: 6, bottom: 4 }}>
                <CartesianGrid stroke="var(--grid)" />
                <XAxis dataKey="day" type="number" domain={[minX, maxX]} tickFormatter={fmtMonth} tick={{ fontSize: 12 }} allowDuplicatedCategory={false} />
                <YAxis
                  dataKey="floor"
                  type="number"
                  domain={[-0.5, b.floors - 0.5]}
                  ticks={Array.from({ length: b.floors }, (_, i) => i)}
                  tickFormatter={(f) => (f === 0 ? 'קרקע' : String(f))}
                  tick={{ fontSize: 12 }}
                  width={46}
                />
                <Tooltip
                  labelFormatter={(d) => fmt(+d)}
                  formatter={(v, n) => [floorLabel(+v), n]}
                  contentStyle={{ direction: 'rtl' }}
                />
                <Legend wrapperStyle={{ display: 'none' }} />
                <ReferenceLine x={date} stroke="var(--accent)" strokeDasharray="4 3" />
                {date !== TODAY && <ReferenceLine x={TODAY} stroke="var(--amber)" strokeOpacity={0.6} />}
                {visible.map((s) => (
                  <Line
                    key={s.t.id}
                    data={s.pts}
                    dataKey="floor"
                    name={s.t.name}
                    stroke={s.t.color}
                    strokeWidth={2.4}
                    dot={{ r: 3.5, fill: s.t.color, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive
                    animationDuration={700}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
      {gaps.length > 0 && (
        <section className="card">
          <h3>מרווח ממוצע בין מלאכות עוקבות (ימים)</h3>
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>מלאכה קודמת</th>
                  <th>מלאכה הבאה</th>
                  <th>מרווח ממוצע</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gaps.map((g, i) => (
                  <tr key={i}>
                    <td>{g.a}</td>
                    <td>{g.b}</td>
                    <td className="num">{g.days} ימים</td>
                    <td>
                      {g.days < 0 ? (
                        <span className="badge danger">חפיפה — המלאכה הבאה הסתיימה לפני הקודמת</span>
                      ) : g.days > 30 ? (
                        <span className="badge warn">המתנה ארוכה</span>
                      ) : (
                        <span className="badge ok">תקין</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
