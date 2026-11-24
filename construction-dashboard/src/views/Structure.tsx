import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { Building, Lot, ProjectData } from '../types'
import { TODAY } from '../date'

const EXAMPLE = `מגרש,בניין,קומות,דירות בקומה
מגרש 1,1א,9,2
מגרש 1,1ב,10,2
מגרש 2,2א,7,3`

export function Structure() {
  const { data, update, model, resetAll, ask } = useStore()
  const [backup, setBackup] = useState<string | null>(null)
  const [csv, setCsv] = useState('')
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const patchB = (id: string, p: Partial<Building>) =>
    update((d) => ({ ...d, buildings: d.buildings.map((b) => (b.id === id ? { ...b, ...p } : b)) }))
  const patchL = (id: string, p: Partial<Lot>) => update((d) => ({ ...d, lots: d.lots.map((l) => (l.id === id ? { ...l, ...p } : l)) }))

  const addLot = () => update((d) => ({ ...d, lots: [...d.lots, { id: 'L' + Date.now().toString(36), name: `מגרש ${d.lots.length + 1}` }] }))
  const addBuilding = (lotId: string) =>
    update((d) => ({
      ...d,
      buildings: [
        ...d.buildings,
        { id: 'B' + Date.now().toString(36), lotId, name: `חדש ${d.buildings.length + 1}`, floors: 8, aptsPerFloor: 2, start: TODAY },
      ],
    }))
  const removeB = (id: string) => ask('למחוק את הבניין?', () => update((d) => ({ ...d, buildings: d.buildings.filter((b) => b.id !== id) })))
  const removeL = (id: string) => update((d) => ({ ...d, lots: d.lots.filter((l) => l.id !== id) }))

  const importCsv = () => {
    const rows = csv
      .split('\n')
      .map((r) => r.split(/[,\t;]/).map((c) => c.trim()))
      .filter((r) => r.length >= 4 && !isNaN(+r[2]) && +r[2] > 0)
    if (!rows.length) {
      setMsg('לא נמצאו שורות תקינות. פורמט: מגרש, בניין, קומות, דירות בקומה')
      return
    }
    ask(`להחליף את מבנה הפרויקט ב־${rows.length} בניינים? סימוני הביצוע של בניינים קיימים עם אותו שם יישמרו.`, () => {
    update((d) => {
      const lots: Lot[] = []
      const buildings: Building[] = []
      rows.forEach(([lotName, bName, floors, apf], i) => {
        let lot = lots.find((l) => l.name === lotName)
        if (!lot) lots.push((lot = { id: d.lots.find((l) => l.name === lotName)?.id ?? 'L' + i + Date.now().toString(36), name: lotName }))
        const existing = d.buildings.find((b) => b.name === bName)
        buildings.push({
          id: existing?.id ?? 'B' + i + Date.now().toString(36),
          lotId: lot.id,
          name: bName,
          floors: Math.round(+floors),
          aptsPerFloor: Math.max(1, Math.round(+apf || 1)),
          start: existing?.start ?? TODAY,
        })
      })
      return { ...d, lots, buildings }
    })
    setMsg(`יובאו ${rows.length} בניינים.`)
    setCsv('')
    })
  }

  const exportJson = () => {
    setBackup(JSON.stringify(data))
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `גיבוי-פרויקט-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as ProjectData
      if (!Array.isArray(d.buildings) || !Array.isArray(d.trades)) throw new Error()
      update(() => d)
      setMsg('הגיבוי נטען.')
    } catch {
      setMsg('קובץ גיבוי לא תקין.')
    }
  }

  const totalApts = data.buildings.reduce((s, b) => s + b.floors * b.aptsPerFloor, 0)

  return (
    <div className="view">
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">מגרשים</span>
          <span className="kpi-value">{data.lots.length}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">בניינים</span>
          <span className="kpi-value">{data.buildings.length}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">דירות</span>
          <span className="kpi-value">{totalApts}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">משימות במעקב</span>
          <span className="kpi-value">{model.tasks.length.toLocaleString()}</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h3>מגרשים ובניינים</h3>
            <button className="btn" onClick={addLot}>
              + מגרש
            </button>
          </div>
          {data.lots.map((l) => {
            const bs = data.buildings.filter((b) => b.lotId === l.id)
            return (
              <div key={l.id} className="lot-edit">
                <div className="lot-edit-head">
                  <input className="plain bold" value={l.name} onChange={(e) => patchL(l.id, { name: e.target.value })} />
                  <span className="muted">{bs.reduce((s, b) => s + b.floors * b.aptsPerFloor, 0)} דירות</span>
                  <button className="btn small" onClick={() => addBuilding(l.id)}>
                    + בניין
                  </button>
                  {bs.length === 0 && (
                    <button className="btn small danger" onClick={() => removeL(l.id)}>
                      מחק מגרש
                    </button>
                  )}
                </div>
                <table className="list compact">
                  <thead>
                    <tr>
                      <th>בניין</th>
                      <th>קומות</th>
                      <th>דירות בקומה</th>
                      <th>סה״כ דירות</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bs.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <input className="plain" value={b.name} onChange={(e) => patchB(b.id, { name: e.target.value })} />
                        </td>
                        <td>
                          <input type="number" min={1} max={60} value={b.floors} onChange={(e) => patchB(b.id, { floors: Math.max(1, +e.target.value) })} />
                        </td>
                        <td>
                          <input type="number" min={1} max={12} value={b.aptsPerFloor} onChange={(e) => patchB(b.id, { aptsPerFloor: Math.max(1, +e.target.value) })} />
                        </td>
                        <td className="num">{b.floors * b.aptsPerFloor}</td>
                        <td>
                          <button className="btn small danger" onClick={() => removeB(b.id)}>
                            מחק
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </section>

        <div className="stack">
          <section className="card">
            <h3>ייבוא התפלגות מ־Excel</h3>
            <p className="muted small">
              העתק מ־Excel ארבע עמודות: מגרש, בניין, קומות, דירות בקומה — והדבק כאן. זה יחליף את המבנה הנוכחי.
            </p>
            <textarea rows={8} placeholder={EXAMPLE} value={csv} onChange={(e) => setCsv(e.target.value)} dir="rtl" />
            <button className="btn primary" onClick={importCsv} disabled={!csv.trim()}>
              ייבא
            </button>
            {msg && <p className="note">{msg}</p>}
          </section>

          <section className="card">
            <h3>נתונים</h3>
            <label className="check">
              <input type="checkbox" checked={data.sampleOn} onChange={(e) => update((d) => ({ ...d, sampleOn: e.target.checked }))} />
              הצג נתוני דוגמה (ביצוע מדומה). כבה כשמתחילים להזין נתונים אמיתיים.
            </label>
            <div className="form-row">
              <button className="btn" onClick={exportJson}>
                ⬇ ייצוא גיבוי
              </button>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                ⬆ טעינת גיבוי
              </button>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              <button className="btn danger" onClick={() => ask('לאפס הכל לנתוני הדוגמה? כל הסימונים שהזנת יימחקו.', resetAll)}>
                איפוס
              </button>
            </div>
            <p className="muted small">הנתונים נשמרים בדפדפן הזה. מומלץ לייצא גיבוי מדי פעם.</p>
            {backup && (
              <div className="backup">
                <p className="small">
                  אם הקובץ לא ירד אוטומטית, העתק את הטקסט ושמור אותו כקובץ ‎.json. לשחזור: "טעינת גיבוי" או הדבקה כאן.
                </p>
                <textarea id="backup-text" rows={4} readOnly value={backup} onFocus={(e) => e.target.select()} dir="ltr" />
                <div className="form-row">
                  <button
                    className="btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(backup).then(
                        () => setMsg('הגיבוי הועתק.'),
                        () => (document.getElementById('backup-text') as HTMLTextAreaElement | null)?.select(),
                      )
                    }}
                  >
                    העתק
                  </button>
                  <button className="btn" onClick={() => setBackup(null)}>
                    סגור
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
