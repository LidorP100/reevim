import { useRef, useState } from 'react'
import { useStore } from '../store'
import { compressImage } from '../files'
import type { Photo } from '../types'
import { Icon } from './ui'

const src = (p: Photo) => `/_blob/${p.asset}`

export function usePhotoUpload() {
  const { upload, savePhoto, toast } = useStore()
  const [busy, setBusy] = useState(false)
  const add = async (file: File, meta: Omit<Photo, 'asset' | 'created'>) => {
    if (!upload) return
    setBusy(true)
    try {
      const blob = await compressImage(file)
      const up = await upload(blob, 'image/jpeg')
      if (!up) throw new Error()
      savePhoto('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), { ...meta, asset: up.id, created: Date.now() })
      toast({ kind: 'ok', text: 'התמונה נשמרה' })
    } catch {
      toast({ kind: 'error', text: 'העלאת התמונה נכשלה' })
    } finally {
      setBusy(false)
    }
  }
  return { add, busy, can: !!upload }
}

/** כפתור צילום/בחירת תמונה (בטלפון פותח את המצלמה) */
export function PhotoButton({ meta, label = 'צלם / הוסף תמונה', small }: { meta: Omit<Photo, 'asset' | 'created'>; label?: string; small?: boolean }) {
  const { add, busy, can } = usePhotoUpload()
  const ref = useRef<HTMLInputElement>(null)
  if (!can) return null
  return (
    <>
      <button type="button" className={`btn${small ? ' small' : ''}`} disabled={busy} onClick={() => ref.current?.click()} title={label}>
        <Icon name="camera" size={small ? 14 : 16} />
        {busy ? 'מעלה…' : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void add(f, meta)
        }}
      />
    </>
  )
}

export function PhotoGrid({ photos, size = 84 }: { photos: (Photo & { id: string })[]; size?: number }) {
  const [open, setOpen] = useState<number | null>(null)
  const { model, savePhoto, canWrite, ask, names } = useStore()
  if (!photos.length) return null
  const cur = open !== null ? photos[open] : null
  return (
    <>
      <div className="photo-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
        {photos.map((p, i) => (
          <button key={p.id} className="photo" onClick={() => setOpen(i)} aria-label="הגדל תמונה">
            <img src={src(p)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {cur && (
        <div className="lightbox" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <img src={src(cur)} alt="" onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <button className="btn" disabled={open === 0} onClick={() => setOpen((open ?? 0) - 1)}>
              → הקודמת
            </button>
            <span className="small">
              {new Date(cur.created).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
              {cur.by && names[cur.by] ? ` · ${names[cur.by]}` : ''}
              {cur.taskId ? ` · ${model.tradeById.get(model.taskById.get(cur.taskId)?.tradeId ?? '')?.name ?? ''}` : ''}
              {cur.defectId ? ' · ליקוי' : ''}
            </span>
            <button className="btn" disabled={open === photos.length - 1} onClick={() => setOpen((open ?? 0) + 1)}>
              הבאה ←
            </button>
            <a className="btn" href={src(cur)} target="_blank" rel="noopener noreferrer">
              מקור
            </a>
            {canWrite && (
              <button
                className="btn danger"
                onClick={() =>
                  ask('להסיר את התמונה?', () => {
                    savePhoto(cur.id, null)
                    setOpen(null)
                  })
                }
              >
                הסר
              </button>
            )}
            <button className="btn" onClick={() => setOpen(null)} aria-label="סגור">
              <Icon name="x" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
