import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { floorLabel } from '../engine'
import { Bar, Icon } from '../components/ui'

export function Defects() {
  const { model, defects, saveDefect, openApt, canWrite, ask } = useStore()
  const [status, setStatus] = useState<'open' | 'fixed' | 'all'>('open')
  const [bId, setBId] = useState('')
  const [tId, setTId] = useState('')
  const [q, setQ] = useState('')

  const list = useMemo(
    () =>
      defects.filter(
        (d) =>
          (status === 'all' || d.status === status) &&
          (!bId || d.buildingId === bId) &&
          (!tId || d.tradeId === tId) &&
          (!q || d.text.includes(q)),
      ),
    [defects, status, bId, tId, q],
  )
  const open = defects.filter((d) => d.status === 'open')
  const byTrade = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of open) m.set(d.tradeId ?? '', (m.get(d.tradeId ?? '') ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [open])
  const max = Math.max(1, ...byTrade.map((x) => x[1]))

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">פתוחים</span>
          <span className={`kpi-value${open.length ? ' danger-text' : ''}`}>{open.length}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">תוקנו</span>
          <span className="kpi-value">{defects.length - open.length}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">דירות עם ליקוי פתוח</span>
          <span className="kpi-value">{new Set(open.map((d) => d.aptId)).size}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">אחוז תיקון</span>
          <span className="kpi-value">{defects.length ? Math.round(((defects.length - open.length) / defects.length) * 100) : 0}%</span>
        </div>
      </div>

      <div className="grid-2 split">
        <section className="card">
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <div className="seg">
              {(
                [
                  ['open', 'פתוחים'],
                  ['fixed', 'תוקנו'],
                  ['all', 'הכל'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
                  {l}
                </button>
              ))}
            </div>
            <select id="def-b" value={bId} onChange={(e) => setBId(e.target.value)} aria-label="בניין">
              <option value="">כל הבניינים</option>
              {model.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  בניין {b.name}
                </option>
              ))}
            </select>
            <select id="def-t" value={tId} onChange={(e) => setTId(e.target.value)} aria-label="מלאכה">
              <option value="">כל המלאכות</option>
              {model.trades.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input id="def-q" type="search" placeholder="חיפוש בתיאור" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.length === 0 ? (
            <div className="empty">
              <Icon name="check" size={32} />
              {defects.length === 0 ? (
                <>
                  <b>עדיין לא נרשמו ליקויים</b>
                  <span className="small">פותחים כרטיס דירה (מהמטריצה, מהתלת מימד או מהחיפוש) ומוסיפים ליקוי בתחתית הכרטיס.</span>
                </>
              ) : (
                'אין ליקויים שמתאימים לסינון'
              )}
            </div>
          ) : (
            <div>
              {list.map((d) => {
                const a = model.aptById.get(d.aptId)
                const b = model.buildingById.get(d.buildingId)
                return (
                  <div key={d.id} className={`defect${d.status === 'fixed' ? ' fixed' : ''}`}>
                    <button
                      className={`check-item${d.status === 'fixed' ? ' on' : ''}`}
                      style={{ padding: 0, width: 24 }}
                      disabled={!canWrite}
                      onClick={() => saveDefect({ ...d, status: d.status === 'open' ? 'fixed' : 'open', fixedAt: d.status === 'open' ? Date.now() : undefined })}
                      aria-label={d.status === 'open' ? 'סמן כתוקן' : 'פתח מחדש'}
                    >
                      <span className="check-box">{d.status === 'fixed' && <Icon name="check" size={14} stroke={3} />}</span>
                    </button>
                    <div>
                      <div className="defect-text">{d.text}</div>
                      <div className="muted small">
                        <button className="btn ghost small" style={{ padding: '0 2px', minHeight: 0 }} onClick={() => openApt(d.aptId)}>
                          בניין {b?.name} · דירה {a?.number} ({a ? floorLabel(a.floor) : ''})
                        </button>
                        {d.tradeId ? ` · ${model.tradeById.get(d.tradeId)?.name}` : ''} · {new Date(d.created).toLocaleDateString('he-IL')}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <span className={`badge ${d.status === 'open' ? 'danger' : 'ok'}`}>{d.status === 'open' ? 'פתוח' : 'תוקן'}</span>
                      {canWrite && (
                        <button className="btn ghost small icon" aria-label="מחק" onClick={() => ask('למחוק את הליקוי?', () => saveDefect(d, true))}>
                          <Icon name="x" size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
        <section className="card">
          <h3>ליקויים פתוחים לפי מלאכה</h3>
          {byTrade.length === 0 ? (
            <p className="muted small">אין ליקויים פתוחים.</p>
          ) : (
            <div className="trade-list">
              {byTrade.map(([tid, n]) => {
                const t = model.tradeById.get(tid)
                return (
                  <div key={tid} className="trade-row" style={{ gridTemplateColumns: '12px 110px minmax(0,1fr) 30px' }}>
                    <span className="dot" style={{ background: t?.color ?? 'var(--muted)' }} />
                    <span>{t?.name ?? 'ללא מלאכה'}</span>
                    <Bar pct={(n / max) * 100} color="var(--danger)" />
                    <span className="num">{n}</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
