import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Drawing } from '../types'
import { Icon } from '../components/ui'

/** צפייה בתוכנית: גרירה להזזה, גלגלת/צביטה לזום */
function Viewer({ d, onClose }: { d: Drawing; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [t, setT] = useState({ s: 0, x: 0, y: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(d.w && d.h ? { w: d.w, h: d.h } : null)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const last = useRef<{ d: number; cx: number; cy: number } | null>(null)

  const fit = (n = natural) => {
    const el = box.current
    if (!el || !n) return
    const r = el.getBoundingClientRect()
    const s = Math.min(r.height / n.h, (r.width * 6) / n.w)
    // התחלה מצד ימין של הגיליון (כיוון קריאה עברי)
    setT({ s, x: r.width - n.w * s, y: (r.height - n.h * s) / 2 })
  }
  useEffect(() => {
    if (natural) fit(natural)
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural])

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setT((p) => {
      const s = Math.max(0.02, Math.min(4, p.s * factor))
      const k = s / p.s
      return { s, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }
    })
  const center = () => {
    const r = box.current!.getBoundingClientRect()
    return [r.width / 2, r.height / 2] as const
  }

  const tiles = d.tiles?.length ? d.tiles : d.img ? [d.img] : []
  const tileW = d.tiles?.length ? d.tileW ?? 3200 : natural?.w ?? 1

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={d.title}>
      <div className="viewer-bar">
        <b>{d.title}</b>
        <span className="muted small">{d.kind}</span>
        <div className="spacer" />
        <button className="btn icon" onClick={() => zoomAt(1 / 1.4, ...center())} aria-label="הקטן">−</button>
        <span className="num small" style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(t.s * 100)}%</span>
        <button className="btn icon" onClick={() => zoomAt(1.4, ...center())} aria-label="הגדל">+</button>
        <button className="btn" onClick={() => fit()}>התאם למסך</button>
        {d.pdf && (
          <a className="btn" href={d.pdf} target="_blank" rel="noopener noreferrer">
            PDF מקורי
          </a>
        )}
        <button className="btn icon" onClick={onClose} aria-label="סגור">
          <Icon name="x" />
        </button>
      </div>
      <div
        ref={box}
        className="viewer-stage"
        onWheel={(e) => {
          const r = box.current!.getBoundingClientRect()
          zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
        }}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          last.current = null
        }}
        onPointerMove={(e) => {
          const prev = pts.current.get(e.pointerId)
          if (!prev) return
          const cur = { x: e.clientX, y: e.clientY }
          pts.current.set(e.pointerId, cur)
          if (pts.current.size === 1) {
            setT((p) => ({ ...p, x: p.x + cur.x - prev.x, y: p.y + cur.y - prev.y }))
          } else if (pts.current.size === 2) {
            const [a, b] = [...pts.current.values()]
            const r = box.current!.getBoundingClientRect()
            const dist = Math.hypot(a.x - b.x, a.y - b.y)
            const cx = (a.x + b.x) / 2 - r.left
            const cy = (a.y + b.y) / 2 - r.top
            if (last.current) {
              zoomAt(dist / last.current.d, cx, cy)
              setT((p) => ({ ...p, x: p.x + cx - last.current!.cx, y: p.y + cy - last.current!.cy }))
            }
            last.current = { d: dist, cx, cy }
          }
        }}
        onPointerUp={(e) => {
          pts.current.delete(e.pointerId)
          last.current = null
        }}
        onPointerCancel={(e) => pts.current.delete(e.pointerId)}
        onDoubleClick={(e) => {
          const r = box.current!.getBoundingClientRect()
          zoomAt(2, e.clientX - r.left, e.clientY - r.top)
        }}
      >
        {!natural && tiles.length === 1 && (
          <img src={tiles[0]} alt="" style={{ display: 'none' }} onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        )}
        {natural && (
          <div className="viewer-sheet" dir="ltr" style={{ width: natural.w, height: natural.h, transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>
            {tiles.map((src, i) => (
              <img key={src} src={src} alt={i === 0 ? d.title : ''} draggable={false} style={{ left: i * tileW, width: Math.min(tileW, natural.w - i * tileW), height: natural.h }} />
            ))}
          </div>
        )}
        {!natural && <div className="viewer-loading">טוען את התוכנית…</div>}
      </div>
      <div className="viewer-hint small">גרירה להזזה · גלגלת או צביטה לזום · לחיצה כפולה להגדלה</div>
    </div>
  )
}

export function Drawings() {
  const { drawings, model, sel, setSel, canWrite, upload, saveDrawing, toast, ask, shared } = useStore()
  const [lotId, setLotId] = useState(sel.lotId ?? '')
  const [open, setOpen] = useState<Drawing | null>(null)
  const [form, setForm] = useState({ title: '', lotId: '', kind: '' })
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const list = useMemo(() => drawings.filter((d) => !lotId || d.lotId === lotId), [drawings, lotId])
  const lotName = (id: string) => model.lots.find((l) => l.id === id)?.name ?? ''

  const doUpload = async (file: File) => {
    if (!upload) return
    if (!form.lotId) return toast({ kind: 'warn', text: 'בחר מגרש לפני ההעלאה' })
    setBusy(true)
    try {
      const url = await upload(file)
      if (!url) throw new Error()
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      let w: number | undefined
      let h: number | undefined
      if (!isPdf) {
        const bmp = await createImageBitmap(file).catch(() => null)
        w = bmp?.width
        h = bmp?.height
      }
      saveDrawing({
        id: 'dr' + Date.now().toString(36),
        lotId: form.lotId,
        title: form.title.trim() || file.name.replace(/\.[^.]+$/, ''),
        kind: form.kind.trim() || undefined,
        ...(isPdf ? { pdf: url } : { img: url, thumb: url, w, h }),
        created: Date.now(),
      })
      toast({ kind: 'ok', text: 'התוכנית הועלתה' })
      setForm({ ...form, title: '' })
    } catch {
      toast({ kind: 'error', text: 'ההעלאה נכשלה. קבצים עד 20MB, תמונה או PDF.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <label className="inline muted small">
          מגרש
          <select id="drw-lot" value={lotId} onChange={(e) => { setLotId(e.target.value); setSel({ lotId: e.target.value || null, buildingId: null, aptId: null }) }}>
            <option value="">כל המגרשים</option>
            {model.lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">{list.length} תוכניות</span>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          <Icon name="report" size={36} />
          <b>אין עדיין תוכניות{lotId ? ' למגרש הזה' : ''}</b>
          <span className="small">{shared ? 'עורכים יכולים להעלות תוכניות (תמונה או PDF) בטופס למטה.' : 'תוכניות זמינות בגרסה המשותפת של האתר.'}</span>
        </div>
      ) : (
        <div className="drawings stagger">
          {list.map((d, i) => (
            <article key={d.id} className="card drawing" style={{ ['--i' as string]: i }}>
              <button className="drawing-thumb" onClick={() => (d.img || d.tiles ? setOpen(d) : d.pdf && window.open(d.pdf, '_blank'))} aria-label={`פתח ${d.title}`}>
                {d.thumb ? <img src={d.thumb} alt="" loading="lazy" /> : <Icon name="report" size={40} />}
              </button>
              <div className="drawing-meta">
                <div>
                  <b>{d.title}</b>
                  <div className="muted small">
                    {lotName(d.lotId)}
                    {d.kind ? ` · ${d.kind}` : ''}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {(d.img || d.tiles) && (
                    <button className="btn small primary" onClick={() => setOpen(d)}>
                      צפייה
                    </button>
                  )}
                  {d.pdf && (
                    <a className="btn small" href={d.pdf} target="_blank" rel="noopener noreferrer">
                      PDF
                    </a>
                  )}
                  {canWrite && (
                    <button className="btn small ghost" aria-label="מחק" onClick={() => ask(`להסיר את "${d.title}" מרשימת התוכניות?`, () => saveDrawing(d, true))}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {canWrite && upload && (
        <section className="card">
          <h3>העלאת תוכנית</h3>
          <div className="form-row">
            <select id="up-lot" value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })} aria-label="מגרש">
              <option value="">מגרש…</option>
              {model.lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <input id="up-title" type="text" placeholder="שם, למשל: תנוחת קומה טיפוסית בניין 7" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input id="up-kind" type="text" placeholder="סוג (חזיתות, תנוחה, חתך…)" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} style={{ maxWidth: 200 }} />
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'מעלה…' : 'בחר קובץ והעלה'}
            </button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void doUpload(f) }} />
          </div>
          <p className="muted small">תמונות נפתחות בצפייה עם זום; קובצי PDF נפתחים בלשונית חדשה. עד 20MB לקובץ.</p>
        </section>
      )}

      {open && <Viewer d={open} onClose={() => setOpen(null)} />}
    </>
  )
}
