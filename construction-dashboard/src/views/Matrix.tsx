import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { countDone, floorUnit, isDone, taskIdOf } from '../engine'
import { ScopePicker } from '../components/ScopePicker'
import { DoneModal, type DoneTarget } from '../components/DoneModal'
import { fmt } from '../date'

export function Matrix() {
  const { model, done, date, sel, setSel } = useStore()
  const [target, setTarget] = useState<DoneTarget | null>(null)
  const [bulk, setBulk] = useState({ tradeId: '', from: 0, to: 0 })

  useEffect(() => {
    if (!sel.buildingId && model.buildings.length) {
      const b = model.buildings.find((x) => !sel.lotId || x.lotId === sel.lotId) ?? model.buildings[0]
      setSel({ buildingId: b.id, lotId: b.lotId })
    }
  }, [sel.buildingId, sel.lotId, model, setSel])

  const b = sel.buildingId ? model.buildingById.get(sel.buildingId) : undefined
  const apts = useMemo(() => (b ? model.aptsByBuilding.get(b.id) ?? [] : []), [b, model])
  const trades = model.trades

  if (!b) return <div className="view">אין בניינים. הוסף בניינים במסך "מבנה הפרויקט".</div>

  const floors = Array.from({ length: b.floors }, (_, i) => b.floors - 1 - i)
  const buildingStats = countDone(done, model.tasksByBuilding.get(b.id) ?? [], date)

  const cell = (taskIds: string[], title: string, key: string) => {
    const n = taskIds.filter((id) => isDone(done, id, date)).length
    const all = n === taskIds.length
    const some = n > 0 && !all
    const d = taskIds.length === 1 ? done.get(taskIds[0]) : undefined
    return (
      <td
        key={key}
        className={`cell ${all ? 'is-done' : some ? 'is-some' : ''}`}
        title={`${title}${d !== undefined && d <= date ? ` — בוצע ${fmt(d)}` : ''}`}
        onClick={() => setTarget({ title, taskIds })}
      >
        {all ? '✓' : some ? `${n}/${taskIds.length}` : ''}
      </td>
    )
  }

  const bulkFloors = floors.filter((f) => f >= Math.min(bulk.from, bulk.to) && f <= Math.max(bulk.from, bulk.to))
  const bulkTrade = model.tradeById.get(bulk.tradeId)
  const bulkIds = bulkTrade
    ? bulkFloors.flatMap((f) =>
        bulkTrade.level === 'floor'
          ? [taskIdOf(bulkTrade.id, floorUnit(b.id, f))]
          : apts.filter((a) => a.floor === f).map((a) => taskIdOf(bulkTrade.id, a.id)),
      )
    : []

  return (
    <div className="view">
      <div className="toolbar">
        <ScopePicker requireBuilding />
        <div className="muted">
          בניין {b.name}: {b.floors} קומות · {apts.length} דירות · <b>{buildingStats.pct.toFixed(1)}%</b> בוצע
        </div>
      </div>

      <div className="card bulk">
        <b>עדכון מרוכז</b>
        <select value={bulk.tradeId} onChange={(e) => setBulk({ ...bulk, tradeId: e.target.value })}>
          <option value="">בחר מלאכה…</option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        מקומה
        <select value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: +e.target.value })}>
          {floors.slice().reverse().map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        עד קומה
        <select value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: +e.target.value })}>
          {floors.slice().reverse().map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          className="btn primary"
          disabled={!bulkTrade}
          onClick={() =>
            bulkTrade &&
            setTarget({
              title: `${bulkTrade.name} — בניין ${b.name}, קומות ${Math.min(bulk.from, bulk.to)}–${Math.max(bulk.from, bulk.to)}`,
              taskIds: bulkIds,
            })
          }
        >
          עדכן {bulkIds.length ? `(${bulkIds.length})` : ''}
        </button>
      </div>

      <div className="matrix-wrap card">
        <table className="matrix">
          <thead>
            <tr>
              <th className="sticky-col">קומה / דירה</th>
              {trades.map((t) => (
                <th key={t.id} className="vert" style={{ borderBottomColor: t.color }}>
                  <span>{t.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {floors.map((f) => {
              const fa = apts.filter((a) => a.floor === f)
              return [
                <tr key={`f${f}`} className="floor-row">
                  <th className="sticky-col">קומה {f}</th>
                  {trades.map((t) =>
                    t.level === 'floor'
                      ? cell([taskIdOf(t.id, floorUnit(b.id, f))], `${t.name} — בניין ${b.name}, קומה ${f}`, t.id)
                      : cell(
                          fa.map((a) => taskIdOf(t.id, a.id)),
                          `${t.name} — כל הדירות בקומה ${f}`,
                          t.id,
                        ),
                  )}
                </tr>,
                ...fa.map((a) => (
                  <tr key={a.id} className={sel.aptId === a.id ? 'apt-row selected' : 'apt-row'}>
                    <th className="sticky-col apt-name" onClick={() => setSel({ aptId: a.id })}>
                      דירה {a.number}
                    </th>
                    {trades.map((t) =>
                      t.level === 'floor' ? (
                        <td key={t.id} className="cell na" />
                      ) : (
                        cell([taskIdOf(t.id, a.id)], `${t.name} — דירה ${a.number}, בניין ${b.name}`, t.id)
                      ),
                    )}
                  </tr>
                )),
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        לחיצה על תא מסמנת בוצע / לא בוצע. בשורת קומה, לחיצה על מלאכת דירה מעדכנת את כל הדירות בקומה. התצוגה לפי התאריך
        שנבחר בציר הזמן.
      </p>
      {target && <DoneModal target={target} onClose={() => setTarget(null)} />}
    </div>
  )
}
