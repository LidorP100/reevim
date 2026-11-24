import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { Building, Lot, ProjectData } from '../types'
import { aptsPerFloor, buildingPlan } from '../engine'
import { elevOf } from '../sample'
import { fmt, fromDay, toDay, TODAY } from '../date'
import { Icon } from '../components/ui'

const EXAMPLE = `מגרש	מספר בניין	טיפוס	מספר דירות	קומות מגורים
282	1	C15-1	15	6
	2	C15-1M	15	6
288	4	CM	15	6`

/** קורא טבלה מודבקת מ־Excel: מגרש, מספר בניין, טיפוס, דירות, קומות. מגרש ריק = ממשיך את הקודם; שורות ״סה״כ״ מדולגות */
function parseTable(text: string) {
  const rows: { lot: string; name: string; type: string; apts: number; floors: number }[] = []
  let lot = ''
  for (const line of text.split(/\r?\n/)) {
    const c = line.split(/\t|,|;/).map((x) => x.trim())
    if (c.length < 4) continue
    if (/סה"?כ|סה״כ|סך/.test(c[0])) continue
    if (c[0]) lot = c[0].replace(/^מגרש\s*/, '')
    // שני פורמטים: [מגרש, בניין, טיפוס, דירות, קומות] או [מגרש, בניין, דירות, קומות]
    const hasType = c.length >= 5 && isNaN(+c[2])
    const name = c[1]
    const type = hasType ? c[2] : ''
    const apts = +(hasType ? c[3] : c[2])
    const floors = +(hasType ? c[4] : c[3])
    if (!name || !lot || !(apts > 0) || !(floors > 0)) continue
    rows.push({ lot, name, type, apts: Math.round(apts), floors: Math.round(floors) })
  }
  return rows
}

export function Structure() {
  const { data, update, model, resetAll, ask, canWrite, toast, shared } = useStore()
  const [csv, setCsv] = useState('')
  const [backup, setBackup] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const patchB = (id: string, p: Partial<Building>) => update((d) => ({ ...d, buildings: d.buildings.map((b) => (b.id === id ? { ...b, ...p } : b)) }))
  const patchL = (id: string, p: Partial<Lot>) => update((d) => ({ ...d, lots: d.lots.map((l) => (l.id === id ? { ...l, ...p } : l)) }))
  const addLot = () => update((d) => ({ ...d, lots: [...d.lots, { id: 'L' + Date.now().toString(36), name: `מגרש חדש` }] }))
  const addBuilding = (lotId: string) =>
    update((d) => ({
      ...d,
      buildings: [
        ...d.buildings,
        { id: 'B' + Date.now().toString(36), lotId, name: String(d.buildings.length + 1), type: '', floors: 6, apts: 15, start: TODAY },
      ],
    }))
  const removeB = (b: Building) => ask(`למחוק את בניין ${b.name}?`, () => update((d) => ({ ...d, buildings: d.buildings.filter((x) => x.id !== b.id) })))
  const removeL = (id: string) => update((d) => ({ ...d, lots: d.lots.filter((l) => l.id !== id) }))

  const preview = parseTable(csv)
  const importCsv = () => {
    if (!preview.length) return
    ask(`להחליף את מבנה הפרויקט ב־${preview.length} בניינים (${preview.reduce((a, r) => a + r.apts, 0)} דירות)? סימונים של בניינים עם אותו מספר יישמרו.`, () => {
      update((d) => {
        const lots: Lot[] = []
        const buildings: Building[] = []
        preview.forEach((r, i) => {
          const lotName = `מגרש ${r.lot}`
          let lot = lots.find((l) => l.name === lotName)
          if (!lot) lots.push((lot = { id: d.lots.find((l) => l.name === lotName)?.id ?? `L${r.lot}`, name: lotName }))
          const existing = d.buildings.find((b) => b.name === r.name)
          buildings.push({
            id: existing?.id ?? `B${r.name.replace(/[^\w-]/g, '') || i}`,
            lotId: lot.id,
            name: r.name,
            type: r.type,
            floors: r.floors,
            apts: r.apts,
            start: existing?.start ?? TODAY,
          })
        })
        return { ...d, lots, buildings }
      })
      toast({ kind: 'ok', text: `יובאו ${preview.length} בניינים` })
      setCsv('')
    })
  }

  const exportJson = () => setBackup(JSON.stringify(data))
  const importJson = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as ProjectData
      if (!Array.isArray(d.buildings) || !Array.isArray(d.trades)) throw new Error()
      update(() => d)
      toast({ kind: 'ok', text: 'הגיבוי נטען' })
    } catch {
      toast({ kind: 'error', text: 'קובץ גיבוי לא תקין' })
    }
  }

  const totalApts = data.buildings.reduce((s, b) => s + b.apts, 0)
  const totalFloors = data.buildings.reduce((s, b) => s + b.floors, 0)

  return (
    <>
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
          <span className="kpi-sub">{totalFloors} קומות מגורים</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">משימות במעקב</span>
          <span className="kpi-value">{model.tasks.length.toLocaleString()}</span>
          <span className="kpi-sub">{model.trades.length} מלאכות</span>
        </div>
      </div>

      <div className="grid-2 split">
        <section className="card">
          <div className="card-head">
            <h3>מגרשים ובניינים</h3>
            {canWrite && (
              <button className="btn" onClick={addLot}>
                <Icon name="plus" size={16} /> מגרש
              </button>
            )}
          </div>
          <p className="muted small" style={{ marginTop: -6 }}>
            קומות מגורים כולל קרקע (6 = קרקע + 5). הדירות מתחלקות לקומות אוטומטית; אפשר לכתוב חלוקה מדויקת, מהקרקע ומעלה, למשל 2,3,3,3,2,2.
          </p>
          {data.lots.map((l) => {
            const bs = data.buildings.filter((b) => b.lotId === l.id)
            return (
              <div key={l.id} className="lot-edit">
                <div className="lot-edit-head">
                  <input className="plain bold" value={l.name} onChange={(e) => patchL(l.id, { name: e.target.value })} disabled={!canWrite} aria-label="שם מגרש" />
                  <span className="muted small">
                    {bs.length} בניינים · {bs.reduce((s, b) => s + b.apts, 0)} דירות
                  </span>
                  {canWrite && (
                    <button className="btn small" onClick={() => addBuilding(l.id)}>
                      <Icon name="plus" size={14} /> בניין
                    </button>
                  )}
                  {canWrite && bs.length === 0 && (
                    <button className="btn small danger" onClick={() => removeL(l.id)}>
                      מחק מגרש
                    </button>
                  )}
                </div>
                {bs.length > 0 && (
                  <div className="table-wrap">
                    <table className="list compact">
                      <thead>
                        <tr>
                          <th>בניין</th>
                          <th>טיפוס</th>
                          <th>קומות</th>
                          <th>דירות</th>
                          <th title="מפלס ±0.00 מוחלט">±0.00</th>
                          <th>חלוקה לקומות (קרקע ←)</th>
                          {data.planOn && <th>התחלה מתוכננת</th>}
                          {data.planOn && <th>סיום מתוכנן</th>}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {bs.map((b) => {
                          const split = aptsPerFloor(b)
                          const manual = !!b.floorApts && b.floorApts.length === b.floors
                          const max = Math.max(...split, 1)
                          return (
                            <tr key={b.id}>
                              <td style={{ width: 70 }}>
                                <input className="plain" value={b.name} onChange={(e) => patchB(b.id, { name: e.target.value })} disabled={!canWrite} aria-label="מספר בניין" />
                              </td>
                              <td style={{ width: 90 }}>
                                <input className="plain" dir="ltr" value={b.type ?? ''} onChange={(e) => patchB(b.id, { type: e.target.value })} disabled={!canWrite} aria-label="טיפוס" />
                              </td>
                              <td>
                                <input type="number" min={1} max={60} value={b.floors} onChange={(e) => patchB(b.id, { floors: Math.max(1, +e.target.value), floorApts: undefined })} disabled={!canWrite} aria-label="קומות" />
                              </td>
                              <td>
                                <input type="number" min={1} max={500} value={b.apts} onChange={(e) => patchB(b.id, { apts: Math.max(1, +e.target.value), floorApts: undefined })} disabled={!canWrite} aria-label="דירות" />
                              </td>
                              <td>
                                <input type="number" step={0.05} min={-50} max={500} value={elevOf(b) ?? ''} onChange={(e) => patchB(b.id, { elev: e.target.value === '' ? undefined : +e.target.value })} disabled={!canWrite} aria-label="מפלס ±0.00" style={{ width: 80 }} />
                              </td>
                              <td style={{ minWidth: 190 }}>
                                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                  <span className="floors-mini" aria-hidden="true">
                                    {split.map((n, i) => (
                                      <i key={i} style={{ height: `${(n / max) * 100}%` }} />
                                    ))}
                                  </span>
                                  <input
                                    className="plain"
                                    dir="ltr"
                                    style={{ fontSize: 12.5, color: manual ? 'var(--ink)' : 'var(--muted)' }}
                                    defaultValue={split.join(',')}
                                    key={split.join(',')}
                                    disabled={!canWrite}
                                    aria-label="חלוקת דירות לקומות"
                                    onBlur={(e) => {
                                      const arr = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number)
                                      if (arr.length === b.floors && arr.every((n) => n >= 0)) {
                                        patchB(b.id, { floorApts: arr, apts: arr.reduce((a, x) => a + x, 0) })
                                      } else if (e.target.value.trim()) {
                                        toast({ kind: 'warn', text: `צריך ${b.floors} מספרים — אחד לכל קומה` })
                                        e.target.value = split.join(',')
                                      }
                                    }}
                                  />
                                </div>
                              </td>
                              {data.planOn && (
                                <td>
                                  <input type="date" value={fromDay(b.start)} onChange={(e) => e.target.value && patchB(b.id, { start: toDay(e.target.value) })} disabled={!canWrite} aria-label="התחלה מתוכננת" />
                                </td>
                              )}
                              {data.planOn && <td className="num small">{fmt(buildingPlan(model, b.id).end)}</td>}
                              <td>
                                {canWrite && (
                                  <button className="btn small danger" onClick={() => removeB(b)}>
                                    מחק
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <div className="stack">
          {canWrite && (
            <section className="card">
              <h3>ייבוא פריסה מ־Excel</h3>
              <p className="muted small" style={{ marginTop: -6 }}>
                מסמנים ב־Excel את הטבלה (מגרש, מספר בניין, טיפוס, מספר דירות, קומות מגורים), מעתיקים ומדביקים כאן. שורות ״סה״כ״ מדולגות אוטומטית.
              </p>
              <textarea id="import-text" rows={7} placeholder={EXAMPLE} value={csv} onChange={(e) => setCsv(e.target.value)} />
              {csv.trim() && (
                <p className={preview.length ? 'note' : 'danger-text small'}>
                  {preview.length
                    ? `זוהו ${preview.length} בניינים, ${preview.reduce((a, r) => a + r.apts, 0)} דירות, ${new Set(preview.map((r) => r.lot)).size} מגרשים`
                    : 'לא זוהו שורות. ודא שיש לפחות 4 עמודות.'}
                </p>
              )}
              <button className="btn primary" onClick={importCsv} disabled={!preview.length} style={{ marginTop: 8 }}>
                ייבא
              </button>
            </section>
          )}

          <section className="card">
            <h3>לוח זמנים מתוכנן</h3>
            <label className="check">
              <input type="checkbox" checked={!!data.planOn} onChange={(e) => update((d) => ({ ...d, planOn: e.target.checked }))} disabled={!canWrite} />
              הפעל השוואה ללוח זמנים מתוכנן
            </label>
            <p className="muted small">
              כשמופעל: לכל בניין נקבע תאריך התחלה, והתוכנית מחושבת מהמשכים של כל מלאכה (במסך מלאכות) — מחזור של 14 יום לקומה בשלד, והגמרים בעקבותיו.
              המערכת מסמנת משימות שהיו צריכות להסתיים לפני יותר משבוע ועדיין לא בוצעו, ומשווה ״מתוכנן״ מול ״בפועל״ בגרפים ובסקירה.
            </p>
          </section>

          <section className="card">
            <h3>נתונים</h3>
            <label className="check">
              <input type="checkbox" checked={data.sampleOn} onChange={(e) => update((d) => ({ ...d, sampleOn: e.target.checked }))} disabled={!canWrite} />
              הצג נתוני ביצוע לדוגמה
            </label>
            <p className="muted small">נתוני הדוגמה מדמים ביצוע כדי לראות את המערכת עובדת. מכבים כשמתחילים לסמן ביצוע אמיתי — הסימונים שלך נשמרים בכל מקרה.</p>
            <p className="muted small">
              {shared ? 'הנתונים נשמרים במסד משותף: כל מי שיש לו גישה לקישור רואה אותם, ומי שיש לו הרשאת עריכה יכול לעדכן.' : 'הנתונים נשמרים בדפדפן הזה בלבד.'}
            </p>
            <div className="form-row">
              <button className="btn" onClick={exportJson}>
                <Icon name="copy" size={15} /> גיבוי הגדרות
              </button>
              {canWrite && (
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  טעינת גיבוי
                </button>
              )}
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              {canWrite && (
                <button className="btn danger" onClick={() => ask('לאפס את מבנה הפרויקט לפריסת עכו 590?', resetAll)}>
                  איפוס מבנה
                </button>
              )}
            </div>
            {backup && (
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                <textarea id="backup-text" rows={4} readOnly value={backup} onFocus={(e) => e.target.select()} dir="ltr" />
                <div className="form-row">
                  <button
                    className="btn small"
                    onClick={() =>
                      navigator.clipboard?.writeText(backup).then(
                        () => toast({ kind: 'ok', text: 'הגיבוי הועתק' }),
                        () => (document.getElementById('backup-text') as HTMLTextAreaElement | null)?.select(),
                      )
                    }
                  >
                    העתק
                  </button>
                  <button className="btn small" onClick={() => setBackup(null)}>
                    סגור
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
