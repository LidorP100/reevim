import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { floorLabel } from '../engine'
import { PAGES } from '../App'
import { Icon } from './ui'

interface Item {
  key: string
  icon: string
  label: string
  hint: string
  run: () => void
}

export function Palette({ onClose }: { onClose: () => void }) {
  const { model, setSel, setTab, openApt, aptInfo } = useStore()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const items = useMemo<Item[]>(() => {
    const s = q.trim()
    const out: Item[] = []
    const words = s.split(/\s+/).filter(Boolean)
    const pages = PAGES.filter((p) => !s || p.label.includes(s)).map((p) => ({
      key: 'p' + p.id,
      icon: p.icon,
      label: p.label,
      hint: 'מסך',
      run: () => setTab(p.id),
    }))
    if (!s) return pages
    // "12 5" = בניין 12 דירה 5
    const [w1, w2] = words
    for (const b of model.buildings) {
      const lot = model.lots.find((l) => l.id === b.lotId)
      if (b.name === w1 || (!w2 && (`בניין ${b.name}`.includes(s) || b.type?.toLowerCase() === s.toLowerCase()))) {
        if (!w2)
          out.push({
            key: 'b' + b.id,
            icon: 'building',
            label: `בניין ${b.name}${b.type ? ` · ${b.type}` : ''}`,
            hint: lot?.name ?? '',
            run: () => {
              setSel({ lotId: b.lotId, buildingId: b.id, aptId: null })
              setTab('matrix')
            },
          })
        for (const a of model.aptsByBuilding.get(b.id) ?? []) {
          if (w2 ? String(a.number) === w2 : b.name === w1 && out.length < 40)
            out.push({
              key: 'a' + a.id,
              icon: 'door',
              label: `דירה ${a.number} · בניין ${b.name}`,
              hint: `${floorLabel(a.floor)}${aptInfo[a.id]?.buyer ? ` · ${aptInfo[a.id].buyer}` : ''}`,
              run: () => {
                setSel({ lotId: b.lotId, buildingId: b.id, aptId: a.id })
                openApt(a.id)
              },
            })
        }
      }
    }
    for (const l of model.lots)
      if (l.name.includes(s))
        out.push({
          key: 'l' + l.id,
          icon: 'layers',
          label: l.name,
          hint: 'מגרש',
          run: () => {
            setSel({ lotId: l.id, buildingId: null, aptId: null })
            setTab('site3d')
          },
        })
    for (const [aid, inf] of Object.entries(aptInfo))
      if (inf.buyer && inf.buyer.includes(s)) {
        const a = model.aptById.get(aid)
        if (a)
          out.push({
            key: 'r' + aid,
            icon: 'users',
            label: inf.buyer,
            hint: `דירה ${a.number} · בניין ${model.buildingById.get(a.buildingId)?.name}`,
            run: () => openApt(aid),
          })
      }
    for (const t of model.trades)
      if (t.name.includes(s) || t.contractor?.includes(s))
        out.push({ key: 't' + t.id, icon: 'tools', label: t.name, hint: t.contractor ?? 'מלאכה', run: () => setTab('board') })
    return [...out.slice(0, 60), ...pages]
  }, [q, model, setSel, setTab, openApt, aptInfo])

  const run = (it: Item) => {
    it.run()
    onClose()
  }

  return (
    <div className="palette" onClick={onClose}>
      <div className="palette-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="חיפוש מהיר">
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={ref}
            id="palette-q"
            value={q}
            placeholder="מספר בניין, ״12 5״ לבניין 12 דירה 5, שם רוכש, מלאכה…"
            onChange={(e) => {
              setQ(e.target.value)
              setI(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setI((x) => Math.min(items.length - 1, x + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setI((x) => Math.max(0, x - 1))
              } else if (e.key === 'Enter' && items[i]) run(items[i])
              else if (e.key === 'Escape') onClose()
            }}
          />
        </div>
        <div className="palette-list">
          {items.length === 0 && <div className="empty">לא נמצא. נסה מספר בניין או ״12 5״.</div>}
          {items.map((it, k) => (
            <button key={it.key} className={`palette-item${k === i ? ' on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => run(it)}>
              <Icon name={it.icon} size={16} />
              {it.label}
              <small>{it.hint}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
