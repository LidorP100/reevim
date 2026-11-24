export type Level = 'floor' | 'apt'

export interface Lot {
  id: string
  name: string
}

export interface Building {
  id: string
  lotId: string
  name: string // מספר בניין
  type?: string // טיפוס (C15, A2…)
  floors: number // קומות מגורים כולל קרקע
  apts: number // סה"כ דירות
  floorApts?: number[] // פירוט ידני: דירות בכל קומה (אינדקס 0 = קרקע)
  start: number // יום התחלה (לנתוני דוגמה בלבד)
}

export interface Trade {
  id: string
  name: string
  level: Level
  color: string
  duration: number
  after: string | null
  lag: number
  weight: number
  contractor?: string
  phone?: string
  sample?: boolean
}

export interface Apt {
  id: string
  buildingId: string
  floor: number
  idx: number
  number: number
}

export interface Task {
  id: string // `${tradeId}|${unit}`
  tradeId: string
  buildingId: string
  floor: number
  aptId: string | null
  ps: number
  pe: number
}

/** סימון ביצוע: יום הביצוע, מתי סומן ומי סימן */
export interface Mark {
  d: number
  at?: number
  by?: string
}
/** null = סומן במפורש כלא בוצע */
export type Marks = Record<string, Mark | null>

export interface AptInfo {
  rooms?: string
  buyer?: string
  notes?: string
}

export interface Defect {
  id: string
  aptId: string
  buildingId: string
  tradeId?: string
  text: string
  status: 'open' | 'fixed'
  created: number
  fixedAt?: number
  by?: string
}

export interface ProjectData {
  projectName: string
  lots: Lot[]
  buildings: Building[]
  trades: Trade[]
  sampleOn: boolean
}

export interface Selection {
  lotId: string | null
  buildingId: string | null
  aptId: string | null
}
