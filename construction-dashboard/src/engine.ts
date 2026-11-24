import type { Apt, Building, DoneOverrides, Lot, Task, Trade } from './types'

export const CYCLE = 14 // ימים בין קומה לקומה בשלד

export const floorUnit = (buildingId: string, floor: number) => `${buildingId}:F${floor}`
export const aptIdOf = (buildingId: string, n: number) => `${buildingId}:A${n}`
export const taskIdOf = (tradeId: string, unit: string) => `${tradeId}|${unit}`

export interface Model {
  lots: Lot[]
  buildings: Building[]
  trades: Trade[] // לפי סדר תלויות
  tradeById: Map<string, Trade>
  buildingById: Map<string, Building>
  apts: Apt[]
  aptById: Map<string, Apt>
  aptsByBuilding: Map<string, Apt[]>
  tasks: Task[]
  taskById: Map<string, Task>
  tasksByBuilding: Map<string, Task[]>
  tasksByApt: Map<string, Task[]>
  minDay: number
  maxDay: number
}

function topo(trades: Trade[]): Trade[] {
  const by = new Map(trades.map((t) => [t.id, t]))
  const out: Trade[] = []
  const seen = new Set<string>()
  const visit = (t: Trade, stack: Set<string>) => {
    if (seen.has(t.id) || stack.has(t.id)) return
    stack.add(t.id)
    const p = t.after ? by.get(t.after) : undefined
    if (p) visit(p, stack)
    seen.add(t.id)
    out.push(t)
  }
  trades.forEach((t) => visit(t, new Set()))
  return out
}

export function buildModel(lots: Lot[], buildings: Building[], tradesIn: Trade[]): Model {
  const trades = topo(tradesIn)
  const tradeById = new Map(trades.map((t) => [t.id, t]))
  const apts: Apt[] = []
  const aptsByBuilding = new Map<string, Apt[]>()
  const tasks: Task[] = []
  const tasksByBuilding = new Map<string, Task[]>()
  const tasksByApt = new Map<string, Task[]>()
  let minDay = Infinity
  let maxDay = -Infinity

  for (const b of buildings) {
    const bApts: Apt[] = []
    let n = 1
    for (let f = 0; f < b.floors; f++) {
      for (let i = 0; i < b.aptsPerFloor; i++) {
        bApts.push({ id: aptIdOf(b.id, n), buildingId: b.id, floor: f, idx: i, number: n })
        n++
      }
    }
    aptsByBuilding.set(b.id, bApts)
    apts.push(...bApts)
    const aptsOnFloor = (f: number) => bApts.filter((a) => a.floor === f)

    const start = new Map<string, number>()
    const bTasks: Task[] = []
    for (const t of trades) {
      const p = t.after ? tradeById.get(t.after) : undefined
      for (let f = 0; f < b.floors; f++) {
        const base = b.start + f * CYCLE
        const predStart = (unit: string) => (p ? start.get(taskIdOf(p.id, unit)) : undefined)
        if (t.level === 'floor') {
          const fu = floorUnit(b.id, f)
          let s: number | undefined
          if (!p) s = base + t.lag
          else if (p.level === 'floor') s = (predStart(fu) ?? base) + t.lag
          else s = Math.max(...aptsOnFloor(f).map((a) => predStart(a.id) ?? base)) + t.lag
          const id = taskIdOf(t.id, fu)
          start.set(id, s)
          bTasks.push({ id, tradeId: t.id, buildingId: b.id, floor: f, aptId: null, ps: s, pe: s + t.duration })
        } else {
          for (const a of aptsOnFloor(f)) {
            let s: number
            if (!p) s = base + t.lag + a.idx * 2
            else if (p.level === 'floor') s = (predStart(floorUnit(b.id, f)) ?? base) + t.lag + a.idx * 2
            else s = (predStart(a.id) ?? base) + t.lag
            const id = taskIdOf(t.id, a.id)
            start.set(id, s)
            const task = { id, tradeId: t.id, buildingId: b.id, floor: f, aptId: a.id, ps: s, pe: s + t.duration }
            bTasks.push(task)
            if (!tasksByApt.has(a.id)) tasksByApt.set(a.id, [])
            tasksByApt.get(a.id)!.push(task)
          }
        }
      }
    }
    for (const t of bTasks) {
      if (t.ps < minDay) minDay = t.ps
      if (t.pe > maxDay) maxDay = t.pe
    }
    tasksByBuilding.set(b.id, bTasks)
    tasks.push(...bTasks)
  }
  if (!isFinite(minDay)) {
    minDay = 0
    maxDay = 1
  }
  return {
    lots,
    buildings,
    trades,
    tradeById,
    buildingById: new Map(buildings.map((b) => [b.id, b])),
    apts,
    aptById: new Map(apts.map((a) => [a.id, a])),
    aptsByBuilding,
    tasks,
    taskById: new Map(tasks.map((t) => [t.id, t])),
    tasksByBuilding,
    tasksByApt,
    minDay,
    maxDay,
  }
}

// ---------- ביצוע: בוצע / לא בוצע ----------

// מפה: משימה -> יום שבו בוצעה
export type DoneIndex = Map<string, number>

function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildDone(model: Model, sampleOn: boolean, overrides: DoneOverrides, today: number): DoneIndex {
  const idx: DoneIndex = new Map()
  if (sampleOn) {
    // נתוני דוגמה: קצב שונה לכל בניין, קבוע (לא משתנה בין טעינות)
    const pace = new Map(model.buildings.map((b) => [b.id, 0.03 + rng(b.id)() * 0.35]))
    for (const t of model.tasks) {
      if (!model.tradeById.get(t.tradeId)?.sample) continue
      const b = model.buildingById.get(t.buildingId)!
      const r = rng(t.id)
      const day = b.start + Math.round((t.pe - b.start) * (1 + pace.get(b.id)!) + r() * 6)
      if (day <= today) idx.set(t.id, day)
    }
  }
  for (const [id, day] of Object.entries(overrides)) {
    if (day === null) idx.delete(id)
    else idx.set(id, day)
  }
  return idx
}

export const isDone = (done: DoneIndex, taskId: string, day: number) => {
  const d = done.get(taskId)
  return d !== undefined && d <= day
}

export function countDone(done: DoneIndex, tasks: Task[], day: number) {
  let n = 0
  for (const t of tasks) if (isDone(done, t.id, day)) n++
  return { done: n, total: tasks.length, pct: tasks.length ? (n / tasks.length) * 100 : 0 }
}

// משימות שקשורות לדירה: המשימות שלה + משימות הקומה שלה
export function tasksForApt(model: Model, aptId: string): Task[] {
  const apt = model.aptById.get(aptId)
  if (!apt) return []
  const floorTasks = (model.tasksByBuilding.get(apt.buildingId) ?? []).filter((t) => t.aptId === null && t.floor === apt.floor)
  return [...floorTasks, ...(model.tasksByApt.get(aptId) ?? [])]
}

export function scopeTasks(model: Model, lotId: string | null, buildingId: string | null, aptId: string | null): Task[] {
  if (aptId) return tasksForApt(model, aptId)
  if (buildingId) return model.tasksByBuilding.get(buildingId) ?? []
  if (lotId) return model.buildings.filter((b) => b.lotId === lotId).flatMap((b) => model.tasksByBuilding.get(b.id) ?? [])
  return model.tasks
}

export function aptDone(model: Model, done: DoneIndex, aptId: string, day: number): boolean {
  const ts = model.tasksByApt.get(aptId) ?? []
  return ts.length > 0 && ts.every((t) => isDone(done, t.id, day))
}

// צבע לפי אחוז
function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function lerpColor(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  const m = x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, t))))
  return '#' + m.map((v) => v.toString(16).padStart(2, '0')).join('')
}
export const NOT_STARTED = '#e4e7eb'
export const DONE = '#2e8b57'
export function pctColor(p: number): string {
  if (p <= 0) return NOT_STARTED
  if (p >= 100) return DONE
  return p < 50 ? lerpColor('#f6c453', '#e8d25a', p / 50) : lerpColor('#e8d25a', '#93c56a', (p - 50) / 50)
}
