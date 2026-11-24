/** שמירת קובץ לצופה: ביכולת ההורדות של הפלטפורמה, אחרת קישור הורדה רגיל */
export async function saveFile(filename: string, data: Blob | string | Uint8Array, mime = 'application/octet-stream'): Promise<'saved' | 'declined' | 'failed'> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const c = (window as any).claude
  if (c?.use) {
    try {
      const dl = await c.use('downloads')
      if (dl) {
        await dl.save({ filename, data })
        return 'saved'
      }
    } catch (e: any) {
      if (e?.code === 'declined') return 'declined'
      if (e?.code && e.code !== 'unavailable' && e.code !== 'not_granted') return 'failed'
    }
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(a.href)
    }, 4000)
    return 'saved'
  } catch {
    return 'failed'
  }
}

export const blobUrl = (id: string) => `/_blob/${id}`

/** הקטנת תמונה לפני העלאה (צד ארוך עד max פיקסלים, JPEG) */
export async function compressImage(file: File, max = 1800, quality = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * k)
  const h = Math.round(bmp.height * k)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', quality))
}

const loaded = new Map<string, Promise<void>>()
/** טעינת ספרייה מ־CDN רק כשצריך */
export function loadScript(src: string): Promise<void> {
  if (!loaded.has(src))
    loaded.set(
      src,
      new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = src
        s.async = true
        s.onload = () => res()
        s.onerror = () => {
          loaded.delete(src)
          rej(new Error('load ' + src))
        }
        document.head.appendChild(s)
      }),
    )
  return loaded.get(src)!
}
