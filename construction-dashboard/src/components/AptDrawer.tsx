import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { countDone, floorLabel, isDone, tasksForApt } from '../engine'
import { fmt, TODAY } from '../date'
import { Icon, Ring } from './ui'
import { PhotoButton, PhotoGrid } from './Photos'
import { HandoverModal } from './Handover'
import type { AptInfo } from '../types'

const ROOMS = ['', '2', '3', '4', '5', '6', 'דירת גן', 'פנטהאוז', 'מיני פנטהאוז', 'דופלקס']

export function AptDrawer() {
  const { model, done, marks, date, aptOpen, openApt, setDone, aptInfo, saveAptInfo, defects, saveDefect, setSel, setTab, names, canWrite, photos, handovers } = useStore()
  const [handoverOpen, setHandoverOpen] = useState(false)
  const apt = aptOpen ? model.aptById.get(aptOpen) : undefined
  const b = apt ? model.buildingById.get(apt.buildingId) : undefined
  const lot = b ? model.lots.find((l) => l.id === b.lotId) : undefined
  const tasks = useMemo(() => (apt ? tasksForApt(model, apt.id) : []), [apt, model])
  const info = (apt && aptInfo[apt.id]) || {}
  const [draft, setDraft] = useState<AptInfo>(info)
  const [defText, setDefText] = useState('')
  const [defTrade, setDefTrade] = useState('')

  useEffect(() => {
    setDraft(apt ? aptInfo[apt.id] ?? {} : {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptOpen])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && openApt(null)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [openApt])

  if (!apt || !b) return null
  const siblings = model.aptsByBuilding.get(b.id) ?? []
  const i = siblings.findIndex((a) => a.id === apt.id)
  const c = countDone(done, tasks, date)
  const myDefects = defects.filter((d) => d.aptId === apt.id)
  const saveInfo = (p: Partial<AptInfo>) => {
    const next = { ...draft, ...p }
    setDraft(next)
    if (JSON.stringify(next) !== JSON.stringify(info)) saveAptInfo(apt.id, next)
  }
  const markDay = Math.min(date, TODAY)

  return (
    <>
      <div className="drawer-back" onClick={() => openApt(null)} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`דירה ${apt.number}`}>
        <div className="drawer-head">
          <Ring pct={c.pct} size={68} label={`${Math.round(c.pct)}%`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>דירה {apt.number}</h2>
            <div className="muted small">
              בניין {b.name}
              {b.type ? ` (${b.type})` : ''} · {floorLabel(apt.floor)} · {lot?.name}
            </div>
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <button className="btn small" disabled={i <= 0} onClick={() => openApt(siblings[i - 1].id)} aria-label="דירה קודמת">
                → הקודמת
              </button>
              <button className="btn small" disabled={i >= siblings.length - 1} onClick={() => openApt(siblings[i + 1].id)} aria-label="דירה הבאה">
                הבאה ←
              </button>
            </div>
          </div>
          <button className="btn icon ghost" onClick={() => openApt(null)} aria-label="סגור">
            <Icon name="x" />
          </button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <h4>
              מלאכות · {c.done}/{c.total} בוצעו
              <span className="muted" style={{ fontWeight: 400 }}>
                {canWrite ? `לחיצה מסמנת לתאריך ${fmt(markDay)}` : ''}
              </span>
            </h4>
            <div className="checklist">
              {tasks.map((t) => {
                const tr = model.tradeById.get(t.tradeId)!
                const ok = isDone(done, t.id, date)
                const d = done.get(t.id)
                const by = marks[t.id]?.by
                return (
                  <button
                    key={t.id}
                    className={`check-item${ok ? ' on' : ''}`}
                    onClick={() => setDone([t.id], ok ? null : markDay)}
                    title={tr.level === 'floor' ? 'מלאכת קומה — מסמנת את כל הקומה' : undefined}
                  >
                    <span className="check-box">{ok && <Icon name="check" size={14} stroke={3} />}</span>
                    <span className="dot" style={{ background: tr.color }} />
                    <span className="check-name">
                      {tr.name}
                      {tr.level === 'floor' && <span className="muted small"> · קומה</span>}
                    </span>
                    <span className="check-meta">
                      {ok && d !== undefined ? fmt(d) : ''}
                      {ok && by && names[by] ? ` · ${names[by]}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="drawer-section">
            <h4>
              תמונות מהשטח · {photos.filter((p) => p.aptId === apt.id).length}
            </h4>
            <PhotoGrid photos={photos.filter((p) => p.aptId === apt.id)} />
            <div style={{ marginTop: 8 }}>
              <PhotoButton meta={{ aptId: apt.id }} />
            </div>
          </section>

          <section className="drawer-section">
            <h4>מסירה</h4>
            {handovers[apt.id] ? (
              <div className="row">
                <span className="badge ok">נמסרה ב־{fmt(handovers[apt.id].day)} · {handovers[apt.id].buyer}</span>
                <button className="btn small" onClick={() => setHandoverOpen(true)}>
                  פרוטוקול המסירה
                </button>
              </div>
            ) : (
              <button className="btn primary" onClick={() => setHandoverOpen(true)} disabled={!canWrite}>
                <Icon name="door" size={16} /> פרוטוקול מסירה
              </button>
            )}
          </section>

          <section className="drawer-section">
            <h4>פרטי דירה</h4>
            <div className="info-grid">
              <label className="field">
                סוג / חדרים
                <select id="apt-rooms" value={draft.rooms ?? ''} onChange={(e) => saveInfo({ rooms: e.target.value })} disabled={!canWrite}>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>
                      {r === '' ? '—' : /^\d$/.test(r) ? `${r} חדרים` : r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                שם הרוכש
                <input id="apt-buyer" type="text" value={draft.buyer ?? ''} onChange={(e) => setDraft({ ...draft, buyer: e.target.value })} onBlur={() => saveInfo({})} disabled={!canWrite} />
              </label>
            </div>
            <label className="field">
              הערות
              <textarea id="apt-notes" rows={2} value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} onBlur={() => saveInfo({})} disabled={!canWrite} />
            </label>
          </section>

          <section className="drawer-section">
            <h4>
              ליקויים · {myDefects.filter((d) => d.status === 'open').length} פתוחים
            </h4>
            {canWrite && (
              <form
                className="form-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!defText.trim()) return
                  saveDefect({
                    id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                    aptId: apt.id,
                    buildingId: b.id,
                    tradeId: defTrade || undefined,
                    text: defText.trim(),
                    status: 'open',
                    created: Date.now(),
                  })
                  setDefText('')
                }}
              >
                <input id="defect-text" type="text" placeholder="תיאור הליקוי, למשל: סדק באריח במטבח" value={defText} onChange={(e) => setDefText(e.target.value)} />
                <select id="defect-trade" value={defTrade} onChange={(e) => setDefTrade(e.target.value)} aria-label="מלאכה">
                  <option value="">מלאכה…</option>
                  {model.trades.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button className="btn primary" type="submit" disabled={!defText.trim()}>
                  הוסף
                </button>
              </form>
            )}
            <div>
              {myDefects.length === 0 && <p className="muted small">אין ליקויים רשומים לדירה.</p>}
              {myDefects.map((d) => (
                <div key={d.id} className={`defect${d.status === 'fixed' ? ' fixed' : ''}`}>
                  <button
                    className={`check-item${d.status === 'fixed' ? ' on' : ''}`}
                    style={{ padding: 0, width: 24 }}
                    onClick={() => saveDefect({ ...d, status: d.status === 'open' ? 'fixed' : 'open', fixedAt: d.status === 'open' ? Date.now() : undefined })}
                    aria-label={d.status === 'open' ? 'סמן כתוקן' : 'פתח מחדש'}
                  >
                    <span className="check-box">{d.status === 'fixed' && <Icon name="check" size={14} stroke={3} />}</span>
                  </button>
                  <div>
                    <div className="defect-text">{d.text}</div>
                    <div className="muted small">
                      {d.tradeId ? model.tradeById.get(d.tradeId)?.name + ' · ' : ''}
                      {new Date(d.created).toLocaleDateString('he-IL')}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <PhotoGrid photos={photos.filter((p) => p.defectId === d.id)} size={56} />
                    </div>
                    {d.status === 'open' && (
                      <div style={{ marginTop: 4 }}>
                        <PhotoButton meta={{ aptId: apt.id, defectId: d.id }} label="תמונה" small />
                      </div>
                    )}
                  </div>
                  <span className={`badge ${d.status === 'open' ? 'danger' : 'ok'}`}>{d.status === 'open' ? 'פתוח' : 'תוקן'}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="row">
            <button
              className="btn"
              onClick={() => {
                setSel({ lotId: b.lotId, buildingId: b.id, aptId: apt.id })
                setTab('site3d')
                openApt(null)
              }}
            >
              <Icon name="cube" size={16} /> הצג בתלת מימד
            </button>
            <button
              className="btn"
              onClick={() => {
                setSel({ lotId: b.lotId, buildingId: b.id, aptId: apt.id })
                setTab('matrix')
                openApt(null)
              }}
            >
              <Icon name="grid" size={16} /> פתח במטריצה
            </button>
            <button
              className="btn"
              onClick={() => {
                setSel({ lotId: b.lotId, buildingId: null, aptId: null })
                setTab('drawings')
                openApt(null)
              }}
            >
              <Icon name="layers" size={16} /> תוכניות המגרש
            </button>
          </div>
        </div>
      </aside>
      {handoverOpen && <HandoverModal aptId={apt.id} onClose={() => setHandoverOpen(false)} />}
    </>
  )
}
