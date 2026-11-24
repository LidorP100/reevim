import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { CheckState, Handover } from '../types'
import { floorLabel, taskIdOf } from '../engine'
import { fmt, fromDay, toDay, TODAY } from '../date'
import { saveFile } from '../files'
import { Icon } from './ui'

export const HANDOVER_ITEMS = [
  'דלת כניסה ומנעול',
  'חלונות ותריסים',
  'ריצוף וחיפוי',
  'קירות, תקרות וצבע',
  'מטבח ומשטח עבודה',
  'כלים סניטריים וברזים',
  'נקודות חשמל ותאורה',
  'לוח חשמל',
  'הכנה למיזוג',
  'מרפסות ואיטום',
  'ממ״ד',
  'דלתות פנים',
  'ניקיון כללי',
]
const STATES: [CheckState, string][] = [
  ['ok', 'תקין'],
  ['defect', 'ליקוי'],
  ['na', 'לא רלוונטי'],
]

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function SignaturePad({ value, onChange, label, disabled }: { value?: string; onChange: (v: string | undefined) => void; label: string; disabled?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  useEffect(() => {
    const c = ref.current!
    const r = c.getBoundingClientRect()
    c.width = r.width * 2
    c.height = r.height * 2
    const g = c.getContext('2d')!
    g.scale(2, 2)
    g.lineWidth = 2.2
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = '#14202b'
    if (value) {
      const img = new Image()
      img.onload = () => g.drawImage(img, 0, 0, r.width, r.height)
      img.src = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  return (
    <div className="sig">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted small">{label}</span>
        {!disabled && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              const c = ref.current!
              c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
              dirty.current = false
              onChange(undefined)
            }}
          >
            נקה
          </button>
        )}
      </div>
      <canvas
        ref={ref}
        className="sig-pad"
        style={{ pointerEvents: disabled ? 'none' : 'auto' }}
        onPointerDown={(e) => {
          drawing.current = true
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          const g = ref.current!.getContext('2d')!
          const [x, y] = pos(e)
          g.beginPath()
          g.moveTo(x, y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const g = ref.current!.getContext('2d')!
          const [x, y] = pos(e)
          g.lineTo(x, y)
          g.stroke()
          dirty.current = true
        }}
        onPointerUp={() => {
          drawing.current = false
          if (dirty.current) onChange(ref.current!.toDataURL('image/png'))
        }}
      />
    </div>
  )
}

export function HandoverModal({ aptId, onClose }: { aptId: string; onClose: () => void }) {
  const { model, handovers, saveHandover, aptInfo, saveAptInfo, setDone, saveDefect, defects, canWrite, data, toast, date } = useStore()
  const apt = model.aptById.get(aptId)!
  const b = model.buildingById.get(apt.buildingId)!
  const existing = handovers[aptId]
  const [h, setH] = useState<Handover>(
    () =>
      existing ?? {
        aptId,
        day: Math.min(date, TODAY),
        buyer: aptInfo[aptId]?.buyer ?? '',
        items: Object.fromEntries(HANDOVER_ITEMS.map((n) => [n, { state: 'ok' as CheckState }])),
        created: Date.now(),
      },
  )
  const [openDefects, setOpenDefects] = useState(true)
  const ro = !canWrite
  const defectsCount = Object.values(h.items).filter((i) => i.state === 'defect').length

  const save = () => {
    if (!h.buyer.trim()) return toast({ kind: 'warn', text: 'צריך את שם הרוכש' })
    if (!h.buyerSig) return toast({ kind: 'warn', text: 'חסרה חתימת הרוכש' })
    saveHandover(h)
    if (aptInfo[aptId]?.buyer !== h.buyer) saveAptInfo(aptId, { ...aptInfo[aptId], buyer: h.buyer })
    if (model.tradeById.has('handover')) setDone([taskIdOf('handover', aptId)], h.day, { silent: true })
    if (openDefects) {
      for (const [name, it] of Object.entries(h.items)) {
        if (it.state !== 'defect') continue
        const text = `מסירה — ${name}${it.note ? `: ${it.note}` : ''}`
        if (defects.some((d) => d.aptId === aptId && d.text === text)) continue
        saveDefect({ id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), aptId, buildingId: b.id, text, status: 'open', created: Date.now() })
      }
    }
    toast({ kind: 'ok', text: `הדירה נמסרה${defectsCount ? ` · ${defectsCount} ליקויים נפתחו` : ''}` })
  }

  const download = async () => {
    const rows = Object.entries(h.items)
      .map(([n, i]) => `<tr><td>${esc(n)}</td><td class="${i.state}">${i.state === 'ok' ? 'תקין' : i.state === 'defect' ? 'ליקוי' : 'לא רלוונטי'}</td><td>${esc(i.note)}</td></tr>`)
      .join('')
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>פרוטוקול מסירה — בניין ${esc(b.name)} דירה ${apt.number}</title>
<style>body{font-family:Arial,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#152029}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:14px 0}td,th{border:1px solid #cfd6de;padding:7px;text-align:right}th{background:#f1f4f7}.defect{color:#c0392b;font-weight:bold}.ok{color:#1d7a4c}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:12px 0}.sig{display:flex;gap:24px}.sig div{flex:1;border-top:1px solid #999;padding-top:6px}.sig img{max-width:100%;height:90px;object-fit:contain}@media print{body{margin:0}}</style></head><body>
<h1>פרוטוקול מסירת דירה</h1><p>${esc(data.projectName)}</p>
<div class="grid"><div><b>בניין:</b> ${esc(b.name)}${b.type ? ` (${esc(b.type)})` : ''}</div><div><b>דירה:</b> ${apt.number} · ${esc(floorLabel(apt.floor))}</div>
<div><b>תאריך מסירה:</b> ${fmt(h.day)}</div><div><b>רוכש/ת:</b> ${esc(h.buyer)}</div>
<div><b>נציג החברה:</b> ${esc(h.rep)}</div><div><b>מפתחות שנמסרו:</b> ${esc(h.keys)}</div>
<div><b>מונה מים:</b> ${esc(h.meters?.water)}</div><div><b>מונה חשמל:</b> ${esc(h.meters?.power)}</div><div><b>מונה גז:</b> ${esc(h.meters?.gas)}</div></div>
<table><thead><tr><th>פריט</th><th>מצב</th><th>הערה</th></tr></thead><tbody>${rows}</tbody></table>
${h.notes ? `<p><b>הערות:</b> ${esc(h.notes)}</p>` : ''}
<div class="sig"><div>חתימת הרוכש/ת<br>${h.buyerSig ? `<img src="${h.buyerSig}" alt="">` : ''}</div><div>חתימת נציג החברה<br>${h.repSig ? `<img src="${h.repSig}" alt="">` : ''}</div></div>
</body></html>`
    const r = await saveFile(`פרוטוקול מסירה - בניין ${b.name} דירה ${apt.number}.html`, html, 'text/html')
    if (r === 'failed') toast({ kind: 'error', text: 'לא ניתן לשמור קובץ בתצוגה הזו' })
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal handover" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3>פרוטוקול מסירה</h3>
            <div className="muted small">
              בניין {b.name} · דירה {apt.number} · {floorLabel(apt.floor)}
            </div>
          </div>
          <button className="btn icon ghost" onClick={onClose} aria-label="סגור">
            <Icon name="x" />
          </button>
        </div>
        {existing && <div className="badge ok" style={{ marginTop: 8 }}>נחתם ב־{fmt(existing.day)}</div>}

        <div className="info-grid" style={{ marginTop: 12 }}>
          <label className="field">
            שם הרוכש/ת
            <input type="text" value={h.buyer} onChange={(e) => setH({ ...h, buyer: e.target.value })} disabled={ro} />
          </label>
          <label className="field">
            תאריך מסירה
            <input type="date" value={fromDay(h.day)} onChange={(e) => e.target.value && setH({ ...h, day: toDay(e.target.value) })} disabled={ro} />
          </label>
          <label className="field">
            נציג החברה
            <input type="text" value={h.rep ?? ''} onChange={(e) => setH({ ...h, rep: e.target.value })} disabled={ro} />
          </label>
          <label className="field">
            מפתחות שנמסרו
            <input type="text" value={h.keys ?? ''} onChange={(e) => setH({ ...h, keys: e.target.value })} disabled={ro} placeholder="למשל: 3 + שלט חניה" />
          </label>
          <label className="field">
            מונה מים
            <input type="text" dir="ltr" value={h.meters?.water ?? ''} onChange={(e) => setH({ ...h, meters: { ...h.meters, water: e.target.value } })} disabled={ro} />
          </label>
          <label className="field">
            מונה חשמל
            <input type="text" dir="ltr" value={h.meters?.power ?? ''} onChange={(e) => setH({ ...h, meters: { ...h.meters, power: e.target.value } })} disabled={ro} />
          </label>
        </div>

        <div className="handover-list">
          {Object.entries(h.items).map(([name, it]) => (
            <div key={name} className={`handover-item ${it.state}`}>
              <span>{name}</span>
              <div className="seg">
                {STATES.map(([k, l]) => (
                  <button key={k} type="button" className={it.state === k ? 'on' : ''} disabled={ro} onClick={() => setH({ ...h, items: { ...h.items, [name]: { ...it, state: k } } })}>
                    {l}
                  </button>
                ))}
              </div>
              {it.state === 'defect' && (
                <input type="text" placeholder="מה הליקוי?" value={it.note ?? ''} onChange={(e) => setH({ ...h, items: { ...h.items, [name]: { ...it, note: e.target.value } } })} disabled={ro} />
              )}
            </div>
          ))}
        </div>

        <label className="field">
          הערות כלליות
          <textarea rows={2} value={h.notes ?? ''} onChange={(e) => setH({ ...h, notes: e.target.value })} disabled={ro} />
        </label>

        <div className="grid-2" style={{ gap: 12 }}>
          <SignaturePad label="חתימת הרוכש/ת" value={h.buyerSig} onChange={(v) => setH({ ...h, buyerSig: v })} disabled={ro} />
          <SignaturePad label="חתימת נציג החברה" value={h.repSig} onChange={(v) => setH({ ...h, repSig: v })} disabled={ro} />
        </div>

        {!ro && defectsCount > 0 && (
          <label className="check small" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={openDefects} onChange={(e) => setOpenDefects(e.target.checked)} />
            לפתוח {defectsCount} ליקויים ברשימת הליקויים
          </label>
        )}
        <div className="modal-actions">
          {!ro && (
            <button className="btn primary" onClick={save}>
              <Icon name="check" size={16} /> {existing ? 'עדכן פרוטוקול' : 'חתום ומסור'}
            </button>
          )}
          <button className="btn" onClick={download} disabled={!h.buyerSig}>
            <Icon name="report" size={16} /> הורד סיכום
          </button>
          <button className="btn" onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}
