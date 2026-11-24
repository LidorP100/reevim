import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { aptDone, countDone, forecast, readyTasks, STUCK_DAYS } from '../engine'
import { fmt } from '../date'
import { Icon } from '../components/ui'

const PERIODS = [
  { days: 7, label: 'שבוע' },
  { days: 14, label: 'שבועיים' },
  { days: 30, label: 'חודש' },
]

export function Report() {
  const { model, done, date, data, toast, defects } = useStore()
  const [days, setDays] = useState(7)
  const from = date - days

  const r = useMemo(() => {
    const byTrade = new Map<string, number>()
    const byBuilding = new Map<string, Map<string, number>>()
    let n = 0
    for (const t of model.tasks) {
      const d = done.get(t.id)
      if (d === undefined || d <= from || d > date) continue
      n++
      byTrade.set(t.tradeId, (byTrade.get(t.tradeId) ?? 0) + 1)
      const m = byBuilding.get(t.buildingId) ?? new Map<string, number>()
      m.set(t.tradeId, (m.get(t.tradeId) ?? 0) + 1)
      byBuilding.set(t.buildingId, m)
    }
    const now = countDone(done, model.tasks, date)
    const before = countDone(done, model.tasks, from)
    const delivered = model.apts.filter((a) => aptDone(model, done, a.id, date) && !aptDone(model, done, a.id, from)).length
    const fc = forecast(done, model.tasks, date)
    let stuck = 0
    for (const s of readyTasks(model, done, date).values()) if (date - s > STUCK_DAYS) stuck++
    const newDefects = defects.filter((d) => d.created >= from * 86400000 && d.created <= (date + 1) * 86400000).length
    return { byTrade, byBuilding, n, now, before, delivered, fc, stuck, newDefects }
  }, [model, done, date, from, defects])

  const text = useMemo(() => {
    const L: string[] = []
    L.push(`*${data.projectName} — דוח ביצוע*`)
    L.push(`${fmt(from + 1)} עד ${fmt(date)}`)
    L.push('')
    L.push(`התקדמות כוללת: ${r.now.pct.toFixed(1)}% (${r.now.pct - r.before.pct >= 0 ? '+' : ''}${(r.now.pct - r.before.pct).toFixed(1)}% בתקופה)`)
    L.push(`משימות שבוצעו בתקופה: ${r.n}`)
    if (r.delivered) L.push(`דירות שהושלמו בתקופה: ${r.delivered}`)
    if (r.fc.finish) L.push(`תחזית סיום לפי הקצב: ${fmt(r.fc.finish)}`)
    if (r.stuck) L.push(`⚠️ ${r.stuck} משימות מוכנות שממתינות מעל 3 שבועות`)
    if (r.newDefects) L.push(`ליקויים חדשים: ${r.newDefects}`)
    L.push('')
    L.push('*לפי בניין:*')
    for (const b of model.buildings) {
      const m = r.byBuilding.get(b.id)
      if (!m) continue
      const parts = [...m.entries()].map(([tid, c]) => {
        const t = model.tradeById.get(tid)!
        return `${t.name} ${c}${t.level === 'floor' ? ' קומות' : ''}`
      })
      L.push(`• בניין ${b.name}: ${parts.join(', ')}`)
    }
    if (!r.byBuilding.size) L.push('לא בוצעו משימות בתקופה.')
    return L.join('\n')
  }, [r, model, data.projectName, from, date])

  const copy = () =>
    navigator.clipboard?.writeText(text).then(
      () => toast({ kind: 'ok', text: 'הדוח הועתק — אפשר להדביק בוואטסאפ או במייל' }),
      () => toast({ kind: 'warn', text: 'ההעתקה נחסמה — סמן את הטקסט והעתק ידנית' }),
    )

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.days} className={days === p.days ? 'on' : ''} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="muted small">
          {fmt(from + 1)} – {fmt(date)} · התאריך נקבע בציר הזמן למעלה
        </span>
        <div className="spacer" />
        <button className="btn primary" onClick={copy}>
          <Icon name="copy" size={16} /> העתק דוח לוואטסאפ
        </button>
      </div>

      <div className="kpis stagger">
        <div className="kpi" style={{ ['--i' as string]: 0 }}>
          <span className="kpi-label">משימות שבוצעו</span>
          <span className="kpi-value">{r.n}</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 1 }}>
          <span className="kpi-label">שינוי בהתקדמות</span>
          <span className="kpi-value">+{(r.now.pct - r.before.pct).toFixed(1)}%</span>
          <span className="kpi-sub">מ־{r.before.pct.toFixed(1)}% ל־{r.now.pct.toFixed(1)}%</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 2 }}>
          <span className="kpi-label">דירות שהושלמו</span>
          <span className="kpi-value">{r.delivered}</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 3 }}>
          <span className="kpi-label">עבודה תקועה</span>
          <span className={`kpi-value${r.stuck ? ' danger-text' : ''}`}>{r.stuck}</span>
          <span className="kpi-sub">מוכנה ולא בוצעה מעל 3 שבועות</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>בוצע לפי בניין ומלאכה</h3>
          {r.byBuilding.size === 0 ? (
            <div className="empty">לא בוצעו משימות בתקופה הזו.</div>
          ) : (
            <div className="table-wrap">
              <table className="list">
                <thead>
                  <tr>
                    <th>בניין</th>
                    <th>מלאכות שבוצעו</th>
                    <th className="num">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {model.buildings
                    .filter((b) => r.byBuilding.has(b.id))
                    .map((b) => {
                      const m = r.byBuilding.get(b.id)!
                      return (
                        <tr key={b.id}>
                          <td className="nowrap">
                            <b>בניין {b.name}</b>
                          </td>
                          <td>
                            <div className="chips">
                              {[...m.entries()].map(([tid, c]) => {
                                const t = model.tradeById.get(tid)!
                                return (
                                  <span key={tid} className="badge" style={{ borderColor: t.color }}>
                                    <span className="dot" style={{ background: t.color, width: 8, height: 8 }} />
                                    {t.name} {c}
                                  </span>
                                )
                              })}
                            </div>
                          </td>
                          <td className="num">{[...m.values()].reduce((a, b) => a + b, 0)}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h3>טקסט הדוח</h3>
            <button className="btn small" onClick={copy}>
              <Icon name="copy" size={14} /> העתק
            </button>
          </div>
          <pre className="report-text">{text}</pre>
        </section>
      </div>
    </>
  )
}
