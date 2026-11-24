export type Level = 'floor' | 'apt'

export interface Lot {
  id: string
  name: string
}

export interface Building {
  id: string
  lotId: string
  name: string
  floors: number // כולל קומת קרקע
  aptsPerFloor: number
  start: number // יום התחלה (מספר ימים מאז 1970)
}

export interface Trade {
  id: string
  name: string
  level: Level // ברמת קומה או ברמת דירה
  color: string
  duration: number // ימים
  after: string | null // מלאכה קודמת (תלות)
  lag: number // כמה ימים אחרי תחילת המלאכה הקודמת מתחילים
  weight: number // משקל בחישוב אחוז ביצוע כללי
  sample?: boolean // מלאכה עם נתוני דוגמה
}

export interface Apt {
  id: string
  buildingId: string
  floor: number
  idx: number // מיקום בקומה
  number: number // מספר דירה בבניין
}

export interface Task {
  id: string // `${tradeId}|${unit}`
  tradeId: string
  buildingId: string
  floor: number
  aptId: string | null
  ps: number // התחלה מתוכננת
  pe: number // סיום מתוכנן
}

// תאריך ביצוע שהוזן ידנית לכל משימה (null = סומן כלא בוצע)
export type DoneOverrides = Record<string, number | null>

export interface ProjectData {
  projectName: string
  lots: Lot[]
  buildings: Building[]
  trades: Trade[]
  userDone: DoneOverrides
  sampleOn: boolean
}

export interface Selection {
  lotId: string | null
  buildingId: string | null
  aptId: string | null
}
