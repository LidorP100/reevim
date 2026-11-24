/**
 * שכבת אחסון: מסד נתונים משותף (כשהאתר רץ כ־Artifact עם יכולת db),
 * ואחרת שמירה מקומית בדפדפן. אותו מבנה נתונים בשני המקרים.
 *
 * מבנה במסד המשותף:
 *   project/main            — הגדרות הפרויקט (מגרשים, בניינים, מלאכות)
 *   marks/<buildingId>      — { m: { [taskId]: Mark | null } }
 *   apts/<buildingId>       — { info: { [aptId]: AptInfo } }
 *   defects/<buildingId>    — { items: { [defectId]: Defect | null } }
 */
import type { AptInfo, BudgetLine, BuildingModel, Contractor, Defect, Drawing, Handover, Marks, Photo, ProjectData } from './types'
import { defaultData } from './sample'

export interface RemoteState {
  loaded: boolean
  project: ProjectData | null
  marks: Record<string, Marks>
  aptInfo: Record<string, Record<string, AptInfo>>
  defects: Record<string, Record<string, Defect | null>>
  drawings: Drawing[]
  contractors: Contractor[]
  photos: Record<string, Record<string, Photo | null>>
  handover: Record<string, Record<string, Handover | null>>
  budget: BudgetLine[]
  models: BuildingModel[]
}
export interface Uploaded {
  id: string
  url: string
}
export type MapCol = 'photos' | 'handover'
export type DocCol = 'budget' | 'models'

export type SyncStatus = 'local' | 'connecting' | 'live' | 'saving' | 'offline' | 'readonly'

export interface Backend {
  kind: 'local' | 'shared'
  userId: string | null
  canWrite: boolean
  subscribe(cb: (s: RemoteState) => void, status: (s: SyncStatus) => void): () => void
  saveProject(p: ProjectData): void
  mark(buildingId: string, entries: Marks): void
  saveAptInfo(buildingId: string, aptId: string, info: AptInfo): void
  saveDefect(buildingId: string, id: string, d: Defect | null): void
  names(ids: string[]): Promise<Record<string, string>>
  reset(): void
  saveDrawing(d: Drawing, remove?: boolean): void
  clearMarks(buildingIds: string[]): void
  saveContractor(c: Contractor, remove?: boolean): void
  /** העלאת קובץ (רק לעורכים במצב משותף) */
  upload: ((file: Blob, type?: string) => Promise<Uploaded | null>) | null
  saveItem(col: MapCol, buildingId: string, id: string, v: Photo | Handover | null): void
  saveDoc(col: DocCol, id: string, v: BudgetLine | BuildingModel | null): void
}

const emptyState = (): RemoteState => ({ loaded: false, project: null, marks: {}, aptInfo: {}, defects: {}, drawings: [], contractors: [], photos: {}, handover: {}, budget: [], models: [] })

// ---------------- מקומי ----------------

const LKEY = 'construction-dashboard.v3'

function localBackend(): Backend {
  let state: RemoteState = emptyState()
  const listeners = new Set<(s: RemoteState) => void>()
  try {
    const raw = localStorage.getItem(LKEY)
    if (raw) state = { ...emptyState(), ...JSON.parse(raw), loaded: true }
  } catch {
    /* אחסון חסום */
  }
  if (!state.project) state = { ...emptyState(), loaded: true, project: defaultData() }
  state.loaded = true

  const commit = (next: RemoteState) => {
    state = next
    try {
      localStorage.setItem(LKEY, JSON.stringify({ ...state, loaded: undefined }))
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l(state))
  }
  return {
    kind: 'local',
    userId: null,
    canWrite: true,
    subscribe(cb, status) {
      listeners.add(cb)
      status('local')
      cb(state)
      return () => listeners.delete(cb)
    },
    saveProject: (p) => commit({ ...state, project: p }),
    mark: (b, entries) => commit({ ...state, marks: { ...state.marks, [b]: { ...state.marks[b], ...entries } } }),
    saveAptInfo: (b, a, info) =>
      commit({ ...state, aptInfo: { ...state.aptInfo, [b]: { ...state.aptInfo[b], [a]: info } } }),
    saveDefect: (b, id, d) => commit({ ...state, defects: { ...state.defects, [b]: { ...state.defects[b], [id]: d } } }),
    names: async () => ({}),
    reset: () => commit({ ...emptyState(), loaded: true, project: defaultData() }),
    saveDrawing: (d, remove) =>
      commit({ ...state, drawings: remove ? state.drawings.filter((x) => x.id !== d.id) : [...state.drawings.filter((x) => x.id !== d.id), d] }),
    upload: null,
    clearMarks: () => commit({ ...state, marks: {} }),
    saveItem: (col, b, id, v) => commit({ ...state, [col]: { ...state[col], [b]: { ...state[col][b], [id]: v } } }),
    saveDoc: (col, id, v) =>
      commit({ ...state, [col]: v ? [...(state[col] as { id: string }[]).filter((x) => x.id !== id), v] : (state[col] as { id: string }[]).filter((x) => x.id !== id) }),
    saveContractor: (c, remove) =>
      commit({ ...state, contractors: remove ? state.contractors.filter((x) => x.id !== c.id) : [...state.contractors.filter((x) => x.id !== c.id), c] }),
  }
}

// ---------------- משותף ----------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any
type AnyUser = any

function sharedBackend(db: AnyDb, user: AnyUser | null, userId: string | null, canWrite: boolean, assets: any | null): Backend {
  let state: RemoteState = emptyState()
  const listeners = new Set<(s: RemoteState) => void>()
  let statusCb: (s: SyncStatus) => void = () => {}
  let inflight = 0
  const emit = () => listeners.forEach((l) => l(state))
  const setStatus = () => statusCb(!canWrite ? 'readonly' : inflight > 0 ? 'saving' : 'live')

  // תור כתיבה לכל מסמך: כתיבה אחת בכל פעם, עדכונים שמצטברים בזמן ההמתנה מתמזגים
  const pending = new Map<string, Record<string, any>>()
  const running = new Set<string>()
  const merge = (a: any, b: any): any => {
    const out = { ...a }
    for (const [k, v] of Object.entries(b)) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v
    }
    return out
  }
  const flush = async (path: string, whole: boolean) => {
    if (running.has(path)) return
    running.add(path)
    inflight++
    setStatus()
    try {
      while (pending.has(path)) {
        const patch = pending.get(path)!
        pending.delete(path)
        const ref = db.doc(path)
        try {
          if (whole) await ref.set(patch)
          else {
            try {
              await ref.update(patch)
            } catch (e: any) {
              if (e?.code === 'invalid_argument') await ref.set(patch)
              else throw e
            }
          }
        } catch (e: any) {
          if (e?.code === 'unavailable') {
            await new Promise((r) => setTimeout(r, 400 + Math.random() * 600))
            pending.set(path, pending.has(path) ? merge(patch, pending.get(path)) : patch)
          } else {
            console.warn('db write failed', path, e)
            if (e?.code === 'invalid_argument') {
              canWrite = false
            }
            window.dispatchEvent(new CustomEvent('cd-write-error', { detail: e?.code ?? 'error' }))
          }
        }
      }
    } finally {
      running.delete(path)
      inflight--
      setStatus()
    }
  }
  const queue = (path: string, patch: Record<string, any>, whole = false) => {
    pending.set(path, whole ? patch : merge(pending.get(path) ?? {}, patch))
    void flush(path, whole)
  }

  return {
    kind: 'shared',
    userId,
    get canWrite() {
      return canWrite
    },
    subscribe(cb, status) {
      listeners.add(cb)
      statusCb = status
      status('connecting')
      let got = 0
      const need = 10
      const timer = setTimeout(() => {
        if (!state.loaded) status('offline')
      }, 10000)
      const ready = (meta?: { fromCache: boolean }) => {
        if (meta && !meta.fromCache) got++
        if (!state.loaded && got >= need) {
          state = { ...state, loaded: true }
          clearTimeout(timer)
          setStatus()
        }
      }
      const fail = () => status('offline')
      const unsubs = [
        db.doc('project/main').onSnapshot((s: any) => {
          state = { ...state, project: s.exists ? (s.data() as ProjectData) : null }
          ready(s.metadata)
          emit()
        }, fail),
        db.collection('marks').onSnapshot((q: any) => {
          const marks: Record<string, Marks> = {}
          for (const d of q.docs) marks[d.id] = (d.data()?.m ?? {}) as Marks
          state = { ...state, marks }
          ready(q.metadata)
          emit()
        }, fail),
        db.collection('apts').onSnapshot((q: any) => {
          const aptInfo: Record<string, Record<string, AptInfo>> = {}
          for (const d of q.docs) aptInfo[d.id] = (d.data()?.info ?? {}) as Record<string, AptInfo>
          state = { ...state, aptInfo }
          ready(q.metadata)
          emit()
        }, fail),
        db.collection('defects').onSnapshot((q: any) => {
          const defects: Record<string, Record<string, Defect | null>> = {}
          for (const d of q.docs) defects[d.id] = (d.data()?.items ?? {}) as Record<string, Defect | null>
          state = { ...state, defects }
          ready(q.metadata)
          emit()
        }, fail),
        db.collection('drawings').onSnapshot((q: any) => {
          const drawings = q.docs.map((d: any) => ({ ...(d.data() as Drawing), id: d.id }))
          state = { ...state, drawings }
          ready(q.metadata)
          emit()
        }, fail),
        db.collection('contractors').onSnapshot((q: any) => {
          const contractors = q.docs.map((d: any) => ({ ...(d.data() as Contractor), id: d.id }))
          state = { ...state, contractors }
          ready(q.metadata)
          emit()
        }, fail),
        ...(['photos', 'handover'] as MapCol[]).map((col) =>
          db.collection(col).onSnapshot((q: any) => {
            const m: Record<string, Record<string, any>> = {}
            for (const d of q.docs) m[d.id] = d.data()?.items ?? {}
            state = { ...state, [col]: m }
            ready(q.metadata)
            emit()
          }, fail),
        ),
        ...(['budget', 'models'] as DocCol[]).map((col) =>
          db.collection(col).onSnapshot((q: any) => {
            state = { ...state, [col]: q.docs.map((d: any) => ({ ...d.data(), id: d.id })) }
            ready(q.metadata)
            emit()
          }, fail),
        ),
      ]
      cb(state)
      return () => {
        clearTimeout(timer)
        listeners.delete(cb)
        unsubs.forEach((u: () => void) => u())
      }
    },
    saveProject(p) {
      state = { ...state, project: p }
      emit()
      queue('project/main', JSON.parse(JSON.stringify(p)), true)
    },
    mark(b, entries) {
      state = { ...state, marks: { ...state.marks, [b]: { ...state.marks[b], ...entries } } }
      emit()
      queue(`marks/${b}`, { m: entries })
    },
    saveAptInfo(b, a, info) {
      state = { ...state, aptInfo: { ...state.aptInfo, [b]: { ...state.aptInfo[b], [a]: info } } }
      emit()
      queue(`apts/${b}`, { info: { [a]: info } })
    },
    saveDefect(b, id, d) {
      state = { ...state, defects: { ...state.defects, [b]: { ...state.defects[b], [id]: d } } }
      emit()
      queue(`defects/${b}`, { items: { [id]: d } })
    },
    async names(ids) {
      if (!user || !ids.length) return {}
      try {
        const ps = await user.profiles(ids)
        const out: Record<string, string> = {}
        for (const id of ids) out[id] = ps?.[id]?.name || ''
        return out
      } catch {
        return {}
      }
    },
    reset() {
      this.saveProject(defaultData())
    },
    saveDrawing(d, remove) {
      state = { ...state, drawings: remove ? state.drawings.filter((x) => x.id !== d.id) : [...state.drawings.filter((x) => x.id !== d.id), d] }
      emit()
      if (remove) void db.doc(`drawings/${d.id}`).delete().catch(() => window.dispatchEvent(new CustomEvent('cd-write-error', { detail: 'error' })))
      else queue(`drawings/${d.id}`, JSON.parse(JSON.stringify(d)), true)
    },
    saveContractor(c, remove) {
      state = { ...state, contractors: remove ? state.contractors.filter((x) => x.id !== c.id) : [...state.contractors.filter((x) => x.id !== c.id), c] }
      emit()
      if (remove) void db.doc(`contractors/${c.id}`).delete().catch(() => window.dispatchEvent(new CustomEvent('cd-write-error', { detail: 'error' })))
      else queue(`contractors/${c.id}`, JSON.parse(JSON.stringify(c)), true)
    },
    clearMarks(ids) {
      state = { ...state, marks: {} }
      emit()
      for (const b of ids) queue(`marks/${b}`, { m: {} }, true)
    },
    saveItem(col, b, id, v) {
      state = { ...state, [col]: { ...state[col], [b]: { ...state[col][b], [id]: v } } }
      emit()
      queue(`${col}/${b}`, { items: { [id]: v === null ? null : JSON.parse(JSON.stringify(v)) } })
    },
    saveDoc(col, id, v) {
      const list = (state[col] as { id: string }[]).filter((x) => x.id !== id)
      state = { ...state, [col]: v ? [...list, v] : list }
      emit()
      if (!v) void db.doc(`${col}/${id}`).delete().catch(() => window.dispatchEvent(new CustomEvent('cd-write-error', { detail: 'error' })))
      else queue(`${col}/${id}`, JSON.parse(JSON.stringify(v)), true)
    },
    upload: assets
      ? async (file: Blob, type?: string) => {
          const r = await assets.upload(file, type ? { type } : undefined)
          return r?.id ? { id: r.id as string, url: (r.url as string) ?? `/_blob/${r.id}` } : null
        }
      : null,
  }
}

/** בוחר אחסון: משותף אם זמין, אחרת מקומי */
export async function connectBackend(): Promise<Backend> {
  const c = (window as any).claude
  if (!c?.use) return localBackend()
  try {
    const [db, user, assets] = await Promise.all([c.use('db'), c.use('user'), c.use('assets').catch(() => null)])
    if (!db) return localBackend()
    let userId: string | null = null
    let canWrite = true
    if (user) {
      try {
        userId = await user.id()
      } catch {
        /* ignore */
      }
      try {
        const can = await user.can('data.write')
        if (can === false) canWrite = false
      } catch {
        /* ignore */
      }
    }
    return sharedBackend(db, user, userId, canWrite, assets)
  } catch {
    return localBackend()
  }
}
