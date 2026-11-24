import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AptInfo, Contractor, Defect, Drawing, Mark, Marks, ProjectData, Selection } from './types'
import { defaultData } from './sample'
import { buildDone, buildModel, type DoneIndex, type Model } from './engine'
import { TODAY } from './date'
import { connectBackend, type Backend, type RemoteState, type SyncStatus } from './backend'

export type Tab = 'overview' | 'site3d' | 'matrix' | 'board' | 'flowline' | 'charts' | 'defects' | 'report' | 'drawings' | 'contractors' | 'trades' | 'structure'

const TABS: Tab[] = ['overview', 'site3d', 'matrix', 'board', 'flowline', 'charts', 'defects', 'report', 'drawings', 'contractors', 'trades', 'structure']

export interface Toast {
  id: number
  text: string
  kind?: 'ok' | 'warn' | 'error'
  undo?: () => void
}

interface Store {
  data: ProjectData
  update: (fn: (d: ProjectData) => ProjectData) => void
  model: Model
  done: DoneIndex
  marks: Marks
  aptInfo: Record<string, AptInfo>
  defects: Defect[]
  date: number
  setDate: (d: number) => void
  tab: Tab
  setTab: (t: Tab) => void
  sel: Selection
  setSel: (s: Partial<Selection>) => void
  setDone: (taskIds: string[], day: number | null, opts?: { silent?: boolean }) => void
  saveAptInfo: (aptId: string, info: AptInfo) => void
  saveDefect: (d: Defect, remove?: boolean) => void
  resetAll: () => void
  ask: (msg: string, onYes: () => void) => void
  pending: { msg: string; onYes: () => void } | null
  closeAsk: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  toasts: Toast[]
  dismissToast: (id: number) => void
  aptOpen: string | null
  openApt: (id: string | null) => void
  status: SyncStatus
  shared: boolean
  canWrite: boolean
  hasProject: boolean
  loaded: boolean
  createProject: () => void
  names: Record<string, string>
  userId: string | null
  drawings: Drawing[]
  saveDrawing: (d: Drawing, remove?: boolean) => void
  upload: ((file: Blob) => Promise<string | null>) | null
  contractors: Contractor[]
  saveContractor: (c: Contractor, remove?: boolean) => void
  contractorFor: (tradeId: string) => Contractor | undefined
}

const Ctx = createContext<Store | null>(null)

const EMPTY: RemoteState = { loaded: false, project: null, marks: {}, aptInfo: {}, defects: {}, drawings: [], contractors: [] }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null)
  const [remote, setRemote] = useState<RemoteState>(EMPTY)
  const [status, setStatus] = useState<SyncStatus>('connecting')
  const [date, setDate] = useState(TODAY)
  const [tab, setTabState] = useState<Tab>(() => {
    const h = location.hash.replace('#', '') as Tab
    return TABS.includes(h) ? h : 'overview'
  })
  const [pending, setPending] = useState<{ msg: string; onYes: () => void } | null>(null)
  const [sel, setSelState] = useState<Selection>({ lotId: null, buildingId: null, aptId: null })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [aptOpen, setAptOpen] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const toastId = useRef(0)

  useEffect(() => {
    let unsub = () => {}
    let alive = true
    connectBackend().then((b) => {
      if (!alive) return
      setBackend(b)
      unsub = b.subscribe(setRemote, setStatus)
    })
    return () => {
      alive = false
      unsub()
    }
  }, [])

  useEffect(() => {
    const h = () => {
      const t = location.hash.replace('#', '') as Tab
      if (TABS.includes(t)) setTabState(t)
    }
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])

  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    try {
      history.replaceState(null, '', '#' + t)
    } catch {
      /* ignore */
    }
  }, [])

  const dismissToast = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const toast = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++toastId.current
      setToasts((ts) => [...ts.slice(-3), { ...t, id }])
      setTimeout(() => dismissToast(id), t.undo ? 6500 : 3500)
    },
    [dismissToast],
  )

  useEffect(() => {
    const h = (e: Event) => {
      const code = (e as CustomEvent).detail
      toast({
        kind: 'error',
        text: code === 'quota_exceeded' ? 'המסד המשותף מלא — לא נשמר.' : 'השמירה נכשלה. ייתכן שאין לך הרשאת עריכה בקישור הזה.',
      })
    }
    window.addEventListener('cd-write-error', h)
    return () => window.removeEventListener('cd-write-error', h)
  }, [toast])

  const data = remote.project ?? defaultData()
  const hasProject = !!remote.project

  // איחוד כל הסימונים מכל הבניינים
  const marks = useMemo(() => {
    const all: Marks = {}
    for (const m of Object.values(remote.marks)) Object.assign(all, m)
    return all
  }, [remote.marks])
  const aptInfo = useMemo(() => {
    const all: Record<string, AptInfo> = {}
    for (const m of Object.values(remote.aptInfo)) Object.assign(all, m)
    return all
  }, [remote.aptInfo])
  const defects = useMemo(
    () =>
      Object.values(remote.defects)
        .flatMap((m) => Object.values(m))
        .filter((d): d is Defect => !!d)
        .sort((a, b) => b.created - a.created),
    [remote.defects],
  )

  // שמות של מי שסימן (במצב משותף)
  useEffect(() => {
    if (!backend || backend.kind !== 'shared') return
    const ids = new Set<string>()
    for (const m of Object.values(marks)) if (m?.by) ids.add(m.by)
    for (const d of defects) if (d.by) ids.add(d.by)
    const missing = [...ids].filter((i) => !(i in names))
    if (!missing.length) return
    backend.names(missing).then((n) => setNames((p) => ({ ...p, ...Object.fromEntries(missing.map((i) => [i, n[i] ?? ''])) })))
  }, [backend, marks, defects, names])

  const model = useMemo(() => buildModel(data.lots, data.buildings, data.trades), [data.lots, data.buildings, data.trades])
  const done = useMemo(() => buildDone(model, data.sampleOn, marks, TODAY), [model, data.sampleOn, marks])

  const canWrite = backend?.canWrite ?? false
  const denied = useCallback(() => toast({ kind: 'warn', text: 'צפייה בלבד — אין לך הרשאת עריכה.' }), [toast])

  const update = useCallback(
    (fn: (d: ProjectData) => ProjectData) => {
      if (!backend) return
      if (!backend.canWrite) return denied()
      backend.saveProject(fn(remote.project ?? defaultData()))
    },
    [backend, remote.project, denied],
  )

  const setSel = useCallback((s: Partial<Selection>) => setSelState((p) => ({ ...p, ...s })), [])

  const setDone = useCallback(
    (taskIds: string[], day: number | null, opts?: { silent?: boolean }) => {
      if (!backend) return
      if (!backend.canWrite) return denied()
      const byB = new Map<string, Marks>()
      const prev = new Map<string, Marks>()
      const now = Date.now()
      for (const id of taskIds) {
        const t = model.taskById.get(id)
        if (!t) continue
        if (!byB.has(t.buildingId)) {
          byB.set(t.buildingId, {})
          prev.set(t.buildingId, {})
        }
        const m: Mark | null = day === null ? null : { d: day, at: now, ...(backend.userId ? { by: backend.userId } : {}) }
        byB.get(t.buildingId)![id] = m
        // לשחזור: מה היה קודם (כולל ביצוע מנתוני דוגמה)
        const before = marks[id]
        prev.get(t.buildingId)![id] =
          before !== undefined ? before : done.has(id) ? { d: done.get(id)!, at: now } : null
      }
      byB.forEach((entries, b) => backend.mark(b, entries))
      if (!opts?.silent) {
        const n = taskIds.length
        toast({
          kind: 'ok',
          text: day === null ? `${n > 1 ? `${n} משימות סומנו` : 'סומן'} כלא בוצע` : `${n > 1 ? `${n} משימות סומנו` : 'סומן'} כבוצע ✓`,
          undo: () => prev.forEach((entries, b) => backend.mark(b, entries)),
        })
      }
    },
    [backend, model, marks, done, toast, denied],
  )

  const saveAptInfo = useCallback(
    (aptId: string, info: AptInfo) => {
      if (!backend) return
      if (!backend.canWrite) return denied()
      const a = model.aptById.get(aptId)
      if (a) backend.saveAptInfo(a.buildingId, aptId, info)
    },
    [backend, model, denied],
  )
  const saveDefect = useCallback(
    (d: Defect, remove?: boolean) => {
      if (!backend) return
      if (!backend.canWrite) return denied()
      backend.saveDefect(d.buildingId, d.id, remove ? null : { ...d, ...(backend.userId && !d.by ? { by: backend.userId } : {}) })
    },
    [backend, denied],
  )

  const saveDrawing = useCallback(
    (d: Drawing, remove?: boolean) => {
      if (!backend) return
      if (!backend.canWrite) return denied()
      backend.saveDrawing(d, remove)
    },
    [backend, denied],
  )
  const drawings = useMemo(() => [...remote.drawings].sort((a, b) => a.title.localeCompare(b.title, 'he')), [remote.drawings])
  const saveContractor = useCallback(
    (c: Contractor, remove?: boolean) => {
      if (!backend) return
      if (!backend.canWrite) return denied()
      backend.saveContractor(c, remove)
    },
    [backend, denied],
  )
  const contractors = useMemo(() => [...remote.contractors].sort((a, b) => a.name.localeCompare(b.name, 'he')), [remote.contractors])
  const contractorFor = useCallback((tradeId: string) => contractors.find((c) => c.trades.includes(tradeId)), [contractors])
  const resetAll = useCallback(() => backend?.reset(), [backend])
  const createProject = useCallback(() => backend?.saveProject(defaultData()), [backend])
  const ask = useCallback((msg: string, onYes: () => void) => setPending({ msg, onYes }), [])
  const closeAsk = useCallback(() => setPending(null), [])

  const value: Store = {
    data,
    update,
    model,
    done,
    marks,
    aptInfo,
    defects,
    date,
    setDate,
    tab,
    setTab,
    sel,
    setSel,
    setDone,
    saveAptInfo,
    saveDefect,
    resetAll,
    ask,
    pending,
    closeAsk,
    toast,
    toasts,
    dismissToast,
    aptOpen,
    openApt: setAptOpen,
    status,
    shared: backend?.kind === 'shared',
    canWrite,
    hasProject,
    loaded: remote.loaded,
    createProject,
    names,
    userId: backend?.userId ?? null,
    drawings,
    saveDrawing,
    upload: backend?.upload ?? null,
    contractors,
    saveContractor,
    contractorFor,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
