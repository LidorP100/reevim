import { useStore } from '../store'

export function ScopePicker({ withApt = false, requireBuilding = false }: { withApt?: boolean; requireBuilding?: boolean }) {
  const { model, sel, setSel } = useStore()
  const buildings = model.buildings.filter((b) => !sel.lotId || b.lotId === sel.lotId)
  const apts = sel.buildingId ? model.aptsByBuilding.get(sel.buildingId) ?? [] : []
  return (
    <div className="scope">
      <label>
        מגרש
        <select
          value={sel.lotId ?? ''}
          onChange={(e) => setSel({ lotId: e.target.value || null, buildingId: null, aptId: null })}
        >
          <option value="">כל המגרשים</option>
          {model.lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        בניין
        <select
          value={sel.buildingId ?? ''}
          onChange={(e) => {
            const b = model.buildingById.get(e.target.value)
            setSel({ buildingId: e.target.value || null, aptId: null, lotId: b ? b.lotId : sel.lotId })
          }}
        >
          {!requireBuilding && <option value="">כל הבניינים</option>}
          {requireBuilding && !sel.buildingId && <option value="">בחר בניין…</option>}
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              בניין {b.name}
            </option>
          ))}
        </select>
      </label>
      {withApt && sel.buildingId && (
        <label>
          דירה
          <select value={sel.aptId ?? ''} onChange={(e) => setSel({ aptId: e.target.value || null })}>
            <option value="">כל הדירות</option>
            {apts.map((a) => (
              <option key={a.id} value={a.id}>
                דירה {a.number} (קומה {a.floor})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
