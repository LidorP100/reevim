import { useState } from 'react'
import { useStore } from '../store'
import { fmt, fromDay, toDay, TODAY } from '../date'

export interface DoneTarget {
  title: string
  taskIds: string[]
}

export function DoneModal({ target, onClose }: { target: DoneTarget; onClose: () => void }) {
  const { done, date, setDone } = useStore()
  const [day, setDay] = useState(Math.min(date, TODAY))
  const doneCount = target.taskIds.filter((id) => done.has(id)).length
  const single = target.taskIds.length === 1
  const doneDay = single ? done.get(target.taskIds[0]) : undefined

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{target.title}</h3>
        <p className="muted">
          {single
            ? doneDay !== undefined
              ? `בוצע בתאריך ${fmt(doneDay)}`
              : 'טרם בוצע'
            : `${doneCount} מתוך ${target.taskIds.length} בוצעו`}
        </p>
        <label className="field">
          תאריך ביצוע
          <input type="date" value={fromDay(day)} onChange={(e) => e.target.value && setDay(toDay(e.target.value))} />
        </label>
        <div className="modal-actions">
          <button
            className="btn primary"
            onClick={() => {
              setDone(target.taskIds, day)
              onClose()
            }}
          >
            ✓ סמן כבוצע{single ? '' : ` (${target.taskIds.length})`}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              setDone(target.taskIds, null)
              onClose()
            }}
          >
            סמן כלא בוצע
          </button>
          <button className="btn" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
