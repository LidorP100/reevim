import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { countDone, floorLabel, floorUnit, isDone, readyTasks, taskIdOf } from '../engine'
import { ScopePicker } from '../components/ScopePicker'
import { Icon } from '../components/ui'
import { fmt, fromDay, toDay, TODAY } from '../date'

type Mode = 'select' | 'quick'

export function Matrix() {
  const { model, done, date, sel, setSel, setDone, openApt, canWrite } = useStore()
  const [mode, setMode] = useState<Mode>('select')
  const [picked, setPicked] = useState<Map<string, string[]>>(new Map())
  const [markDay, setMarkDay] = useState(Math.min(date, TODAY))
  const [onlyOpen, setOnlyOpen] = useState(false)
  const drag = useRef<{ on: boolean; moved: boolean }>({ on: false, moved: false })

  useEffect(() => setMarkDay(Math.min(date, TODAY)), [date])
  useEffect(() => {
    if (!sel.buildingId && model.buildings.length) {
      const b = model.buildings.find((x) => !sel.lotId || x.lotId === sel.lotId) ?? model.buildings[0]
      setSel({ buildingId: b.id, lotId: b.lotId })
    }
  }, [sel.buildingId, sel.lotId, model, setSel])
  useEffect(() => setPicked(new Map()), [sel.buildingId])
  useEffect(() => {
    const up = () => (drag.current.on = false)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const b = sel.buildingId ? model.buildingById.get(sel.buildingId) : undefined
  const apts = useMemo(() => (b ? model.aptsByBuilding.get(b.id) ?? [] : []), [b, model])
  const ready = useMemo(() => readyTasks(model, done, date), [model, done, date])
  const trades = model.trades

  if (!b) return <div className="card empty">אין בניינים. הוסף בניינים במסך מבנה הפרויקט.</div>

  const bIdx = model.buildings.indexOf(b)
  const floors = Array.from({ length: b.floors }, (_, i) => b.floors - 1 - i)
  const bStats = countDone(done, model.tasksByBuilding.get(b.id) ?? [], date)
  const aptComplete = (aid: string) => (model.tasksByApt.get(aid) ?? []).every((t) => isDone(done, t.id, date))

  const toggle = (key: string, ids: string[], force?: boolean) =>
    setPicked((p) => {
      const n = new Map(p)
      if (force === true || (force === undefined && !n.has(key))) n.set(key, ids)
      else n.delete(key)
      return n
    })
  const quickMark = (ids: string[]) => {
    const allDone = ids.every((id) => isDone(done, id, date))
    setDone(ids, allDone ? null : Math.min(date, TODAY))
  }
  const pickMany = (entries: [string, string[]][]) =>
    setPicked((p) => {
      const n = new Map(p)
      const allIn = entries.every(([k]) => n.has(k))
      for (const [k, v] of entries) {
        if (allIn) n.delete(k)
        else n.set(k, v)
      }
      return n
    })

  const cellKeyIds = (tId: string, f: number, aptId: string | null): [string, string[]] => {
    const t = model.tradeById.get(tId)!
    if (t.level === 'floor') return [`${tId}|F${f}`, [taskIdOf(tId, floorUnit(b.id, f))]]
    if (aptId) return [`${tId}|${aptId}`, [taskIdOf(tId, aptId)]]
    return [`${tId}|F${f}`, apts.filter((a) => a.floor === f).map((a) => taskIdOf(tId, a.id))]
  }

  const cell = (tId: string, f: number, aptId: string | null) => {
    const [key, ids] = cellKeyIds(tId, f, aptId)
    const n = ids.filter((id) => isDone(done, id, date)).length
    const all = ids.length > 0 && n === ids.length
    const some = n > 0 && !all
    const isReady = !all && ids.some((id) => ready.has(id))
    const d = ids.length === 1 ? done.get(ids[0]) : undefined
    const tr = model.tradeById.get(tId)!
    const title = `${tr.name} · ${aptId ? `דירה ${model.aptById.get(aptId)?.number}` : floorLabel(f)}${all && d !== undefined ? ` · בוצע ${fmt(d)}` : isReady ? ' · מוכן לביצוע' : ''}`
    return (
      <td
        key={tId}
        data-key={key}
        className={`cell${all ? ' is-done' : some ? ' is-some' : ''}${isReady ? ' ready' : ''}${picked.has(key) ? ' picked' : ''}`}
        title={title}
        onPointerDown={(e) => {
          if (!canWrite) return
          if (e.pointerType === 'mouse') {
            drag.current = { on: true, moved: false }
            if (mode === 'select') toggle(key, ids)
            else quickMark(ids)
          }
        }}
        onPointerEnter={() => {
          if (!drag.current.on) return
          drag.current.moved = true
          if (mode === 'select') toggle(key, ids, true)
          else if (!ids.every((id) => isDone(done, id, date))) setDone(ids, Math.min(date, TODAY), { silent: true })
        }}
        onClick={(e) => {
          if (!canWrite) return
          // מגע: הקשה בודדת
          if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse' && e.detail !== 0) {
            if (mode === 'select') toggle(key, ids)
            else quickMark(ids)
          }
        }}
      >
        {all ? <span className="tick">✓</span> : some ? `${n}/${ids.length}` : ''}
      </td>
    )
  }

  const pickedIds = [...picked.values()].flat()

  return (
    <>
      <div className="toolbar">
        <ScopePicker requireBuilding />
        <div className="row" style={{ gap: 4 }}>
          <button className="btn icon" disabled={bIdx <= 0} onClick={() => setSel({ buildingId: model.buildings[bIdx - 1].id, lotId: model.buildings[bIdx - 1].lotId })} aria-label="בניין קודם">
            →
          </button>
          <button className="btn icon" disabled={bIdx >= model.buildings.length - 1} onClick={() => setSel({ buildingId: model.buildings[bIdx + 1].id, lotId: model.buildings[bIdx + 1].lotId })} aria-label="בניין הבא">
            ←
          </button>
        </div>
        <span className="badge accent">
          בניין {b.name}
          {b.type ? ` · ${b.type}` : ''} · {b.floors} קומות · {apts.length} דירות · {bStats.pct.toFixed(1)}%
        </span>
        <div className="spacer" />
        <label className="check small">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          הסתר דירות שהושלמו
        </label>
        {canWrite && (
          <div className="seg">
            <button className={mode === 'select' ? 'on' : ''} onClick={() => setMode('select')} title="בוחרים תאים ואז מסמנים">
              <Icon name="target" size={15} /> בחירה
            </button>
            <button className={mode === 'quick' ? 'on' : ''} onClick={() => setMode('quick')} title="כל לחיצה מסמנת מיד">
              <Icon name="check" size={15} /> סימון מהיר
            </button>
          </div>
        )}
      </div>

      <div className="legend-inline">
        <span>
          <i style={{ background: 'var(--ok-soft)' }} />
          בוצע
        </span>
        <span>
          <i style={{ background: 'var(--some)' }} />
          חלקי
        </span>
        <span>
          <i style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--accent-soft) 4px 6px)' }} />
          מוכן לביצוע
        </span>
        <span className="muted">
          {mode === 'select' ? 'לחיצה או גרירה בוחרת תאים · לחיצה על כותרת בוחרת עמודה או קומה' : 'לחיצה מסמנת או מבטלת מיד · גרירה מסמנת טווח'}
        </span>
      </div>

      <div className="matrix-wrap card">
        <table className="matrix">
          <thead>
            <tr>
              <th className="sticky-col">קומה / דירה</th>
              {trades.map((t) => (
                <th
                  key={t.id}
                  className="vert"
                  style={{ borderBottomColor: t.color }}
                  title={`בחר את כל "${t.name}" בבניין`}
                  onClick={() => canWrite && pickMany(floors.map((f) => cellKeyIds(t.id, f, null)))}
                >
                  <span>{t.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => {
              const fa = apts.filter((a) => a.floor === f && (!onlyOpen || !aptComplete(a.id)))
              return [
                <tr key={`f${f}`} className="floor-row">
                  <th className="sticky-col" title="בחר את כל הקומה" onClick={() => canWrite && pickMany(trades.map((t) => cellKeyIds(t.id, f, null)))}>
                    {floorLabel(f)}
                  </th>
                  {trades.map((t) => cell(t.id, f, null))}
                </tr>,
                ...fa.map((a) => (
                  <tr key={a.id} className={sel.aptId === a.id ? 'apt-row selected' : 'apt-row'}>
                    <th className="sticky-col apt-name" onClick={() => openApt(a.id)}>
                      דירה {a.number}
                    </th>
                    {trades.map((t) => (t.level === 'floor' ? <td key={t.id} className="cell na" /> : cell(t.id, f, a.id)))}
                  </tr>
                )),
              ]
            })}
          </tbody>
        </table>
      </div>

      {picked.size > 0 && (
        <div className="selbar" role="toolbar">
          <b>{pickedIds.length} משימות נבחרו</b>
          <input id="mark-day" type="date" value={fromDay(markDay)} onChange={(e) => e.target.value && setMarkDay(toDay(e.target.value))} aria-label="תאריך ביצוע" />
          <button
            className="btn ok"
            onClick={() => {
              setDone(pickedIds, markDay)
              setPicked(new Map())
            }}
          >
            <Icon name="check" size={16} /> סמן כבוצע
          </button>
          <button
            className="btn"
            onClick={() => {
              setDone(pickedIds, null)
              setPicked(new Map())
            }}
          >
            לא בוצע
          </button>
          <button className="btn" onClick={() => setPicked(new Map())} aria-label="נקה בחירה">
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </>
  )
}
