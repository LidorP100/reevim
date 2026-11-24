import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ProjectData, Selection } from './types'
import { defaultData } from './sample'
import { buildDone, buildModel, type DoneIndex, type Model } from './engine'
import { TODAY } from './date'

const KEY = 'construction-dashboard.v2'

function load(): ProjectData {
  try {
    const s = localStorage.getItem(KEY)
    if (s) return { ...defaultData(), ...JSON.parse(s) }
  } catch {
    /* אין גישה לאחסון — ממשיכים עם ברירת מחדל */
  }
  return defaultData()
}

export type Tab = 'overview' | 'site3d' | 'matrix' | 'charts' | 'trades' | 'structure'

interface Store {
  data: ProjectData
  update: (fn: (d: ProjectData) => ProjectData) => void
  model: Model
  done: DoneIndex
  date: number
  setDate: (d: number) => void
  tab: Tab
  setTab: (t: Tab) => void
  sel: Selection
  setSel: (s: Partial<Selection>) => void
  setDone: (taskIds: string[], day: number | null) => void
  resetAll: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProjectData>(load)
  const [date, setDate] = useState(TODAY)
  const [tab, setTab] = useState<Tab>('overview')
  const [sel, setSelState] = useState<Selection>({ lotId: null, buildingId: null, aptId: null })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }, [data])

  const model = useMemo(() => buildModel(data.lots, data.buildings, data.trades), [data.lots, data.buildings, data.trades])
  const done = useMemo(() => buildDone(model, data.sampleOn, data.userDone, TODAY), [model, data.sampleOn, data.userDone])

  const update = useCallback((fn: (d: ProjectData) => ProjectData) => setData(fn), [])
  const setSel = useCallback((s: Partial<Selection>) => setSelState((p) => ({ ...p, ...s })), [])
  const setDone = useCallback(
    (taskIds: string[], day: number | null) =>
      setData((d) => {
        const userDone = { ...d.userDone }
        for (const id of taskIds) userDone[id] = day
        return { ...d, userDone }
      }),
    [],
  )
  const resetAll = useCallback(() => setData(defaultData()), [])

  const value: Store = { data, update, model, done, date, setDate, tab, setTab, sel, setSel, setDone, resetAll }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
