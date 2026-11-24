import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { floorLabel, readyTasks, STUCK_DAYS } from '../engine'
import { fmt } from '../date'
import { Icon } from '../components/ui'

export function Board() {
  const { model, done, date, setSel, setTab, toast } = useStore()
  const [lotId, setLotId] = useState<string>('')
  const [onlyStuck, setOnlyStuck] = useState(false)

  const cols = useMemo(() => {
    const ready = readyTasks(model, done, date)
    return model.trades
      .map((t) => {
        const byB = new Map<string, { items: { label: string; since: number; aptId: string | null }[]; oldest: number }>()
        let n = 0
        let stuck = 0
        for (const [id, since] of ready) {
          const task = model.taskById.get(id)!
          if (task.tradeId !== t.id) continue
          const b = model.buildingById.get(task.buildingId)!
          if (lotId && b.lotId !== lotId) continue
          const isStuck = date - since > STUCK_DAYS
          if (onlyStuck && !isStuck) continue
          n++
          if (isStuck) stuck++
          const g = byB.get(b.id) ?? { items: [], oldest: Infinity }
          g.items.push({
            label: task.aptId ? `דירה ${model.aptById.get(task.aptId)?.number}` : floorLabel(task.floor),
            since,
            aptId: task.aptId,
          })
          g.oldest = Math.min(g.oldest, since)
          byB.set(b.id, g)
        }
        const groups = [...byB.entries()].sort((a, b) => a[1].oldest - b[1].oldest)
        return { t, n, stuck, groups }
      })
      .filter((c) => c.n > 0)
  }, [model, done, date, lotId, onlyStuck])

  const copyFor = (c: (typeof cols)[number]) => {
    const lines = [`*${c.t.name}* — עבודה מוכנה לביצוע (${fmt(date)})`, '']
    for (const [bid, g] of c.groups) {
      const b = model.buildingById.get(bid)!
      lines.push(`בניין ${b.name}: ${g.items.map((i) => i.label).join(', ')}`)
    }
    lines.push('', `סה״כ ${c.n} ${c.t.level === 'floor' ? 'קומות' : 'דירות'}`)
    const text = lines.join('\n')
    navigator.clipboard?.writeText(text).then(
      () => toast({ kind: 'ok', text: `הרשימה ל${c.t.contractor ? c.t.contractor : c.t.name} הועתקה — אפשר להדביק בוואטסאפ` }),
      () => toast({ kind: 'warn', text: 'ההעתקה נחסמה בדפדפן הזה' }),
    )
  }

  return (
    <>
      <div className="toolbar">
        <label className="inline muted small">
          מגרש
          <select id="board-lot" value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">כל המגרשים</option>
            {model.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={onlyStuck} onChange={(e) => setOnlyStuck(e.target.checked)} />
          רק עבודה שממתינה מעל {STUCK_DAYS} יום
        </label>
        <div className="spacer" />
        <span className="muted small">משימה מוכנה = המלאכה שלפניה הסתיימה, והיא עצמה עוד לא בוצעה. נכון ל־{fmt(date)}.</span>
      </div>

      {cols.length === 0 ? (
        <div className="card empty">
          <Icon name="board" size={36} />
          אין כרגע עבודה שמחכה לביצוע{onlyStuck ? ' מעל 3 שבועות' : ''}.
        </div>
      ) : (
        <div className="board stagger">
          {cols.map((c, i) => (
            <section key={c.t.id} className="card board-col" style={{ ['--i' as string]: i, borderTop: `3px solid ${c.t.color}` }}>
              <div className="card-head" style={{ marginBottom: 0 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{c.t.name}</h3>
                  <span className="muted small">{c.t.contractor ? `קבלן: ${c.t.contractor}` : 'לא הוגדר קבלן'}</span>
                </div>
                <div style={{ textAlign: 'end' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{c.n}</div>
                  <span className="muted small">{c.t.level === 'floor' ? 'קומות' : 'דירות'} מוכנות</span>
                </div>
              </div>
              {c.stuck > 0 && <span className="badge danger">{c.stuck} ממתינות מעל 3 שבועות</span>}
              <div className="stack" style={{ gap: 10 }}>
                {c.groups.slice(0, 8).map(([bid, g]) => {
                  const b = model.buildingById.get(bid)!
                  return (
                    <div key={bid}>
                      <button
                        className="btn ghost small"
                        style={{ padding: '0 4px', fontWeight: 600 }}
                        onClick={() => {
                          setSel({ lotId: b.lotId, buildingId: b.id, aptId: null })
                          setTab('matrix')
                        }}
                      >
                        בניין {b.name} ←
                      </button>
                      <div className="chips" style={{ marginTop: 4 }}>
                        {g.items.slice(0, 14).map((it, k) => {
                          const wait = date - it.since
                          return (
                            <span key={k} className={`chip${wait > STUCK_DAYS ? ' stuck' : ''}`} title={`מוכן מאז ${fmt(it.since)} (${wait} ימים)`}>
                              {it.label}
                              <span className="muted small">{wait}י׳</span>
                            </span>
                          )
                        })}
                        {g.items.length > 14 && <span className="muted small">+{g.items.length - 14}</span>}
                      </div>
                    </div>
                  )
                })}
                {c.groups.length > 8 && <span className="muted small">ועוד {c.groups.length - 8} בניינים</span>}
              </div>
              <button className="btn small" onClick={() => copyFor(c)} style={{ alignSelf: 'flex-start' }}>
                <Icon name="copy" size={14} /> העתק רשימה לקבלן
              </button>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
