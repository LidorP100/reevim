import type { Building, Lot, ProjectData, Trade } from './types'
import { toDay } from './date'

// מלאכות ברירת מחדל: שלד ברמת קומה, ואחריו גמרים ברמת דירה
export const defaultTrades: Trade[] = [
  { id: 'slab', name: 'יציקת רצפה', level: 'floor', color: '#8d939b', duration: 3, after: null, lag: 0, weight: 3 },
  { id: 'walls', name: 'קירות ועמודים', level: 'floor', color: '#6b7380', duration: 6, after: 'slab', lag: 3, weight: 3 },
  { id: 'blocks', name: 'בנייה (בלוקים)', level: 'floor', color: '#b07a52', duration: 8, after: 'walls', lag: 16, weight: 2 },
  { id: 'plumb', name: 'אינסטלציה גס', level: 'apt', color: '#2f7fc1', duration: 6, after: 'blocks', lag: 8, weight: 1.5 },
  { id: 'elec', name: 'חשמל גס', level: 'apt', color: '#e0a526', duration: 6, after: 'plumb', lag: 2, weight: 1.5 },
  { id: 'ac', name: 'הכנה למיזוג', level: 'apt', color: '#4bb3c4', duration: 4, after: 'elec', lag: 3, weight: 1 },
  { id: 'plaster', name: 'טיח', level: 'apt', color: '#c9b79c', duration: 10, after: 'ac', lag: 4, weight: 2 },
  { id: 'water', name: 'איטום', level: 'apt', color: '#5b6cc9', duration: 4, after: 'plaster', lag: 10, weight: 1 },
  { id: 'tiles', name: 'ריצוף', level: 'apt', color: '#c46b4b', duration: 10, after: 'water', lag: 5, weight: 2 },
  { id: 'cladding', name: 'חיפוי קירות', level: 'apt', color: '#9c6bc4', duration: 6, after: 'tiles', lag: 6, weight: 1 },
  { id: 'alu', name: 'אלומיניום', level: 'apt', color: '#3d5a80', duration: 5, after: 'tiles', lag: 10, weight: 1.5 },
  { id: 'paint', name: 'צבע', level: 'apt', color: '#d68fb0', duration: 8, after: 'alu', lag: 6, weight: 1 },
  { id: 'doors', name: 'נגרות ודלתות', level: 'apt', color: '#8a5a2b', duration: 5, after: 'paint', lag: 5, weight: 1 },
  { id: 'kitchen', name: 'מטבח', level: 'apt', color: '#5a8a3c', duration: 4, after: 'doors', lag: 3, weight: 1 },
  { id: 'sanitary', name: 'כלים סניטריים', level: 'apt', color: '#3c8a7e', duration: 3, after: 'kitchen', lag: 2, weight: 0.7 },
  { id: 'elecfin', name: 'חשמל גמר', level: 'apt', color: '#c9a20e', duration: 4, after: 'sanitary', lag: 2, weight: 0.7 },
  { id: 'handover', name: 'מסירה', level: 'apt', color: '#2e8b57', duration: 2, after: 'elecfin', lag: 10, weight: 0.5 },
].map((t) => ({ ...t, level: t.level as Trade['level'], sample: true }))

// פריסת בניינים — פרויקט עכו 590 (מתוך קובץ האקסל)
// [מגרש, מספר בניין, טיפוס, דירות, קומות מגורים כולל קרקע]
export const AKKO_590: [string, number, string, number, number][] = [
  ['282', 1, 'C15-1', 15, 6], ['282', 2, 'C15-1M', 15, 6], ['282', 3, 'C15', 15, 6],
  ['288', 4, 'CM', 15, 6], ['288', 5, 'C', 15, 6], ['288', 6, 'CM', 15, 6], ['288', 7, 'A2', 50, 14],
  ['253-277', 8, 'C21M', 21, 8], ['253-277', 9, 'B', 14, 8], ['253-277', 10, 'C21M', 21, 8], ['253-277', 11, 'C21M', 21, 8], ['253-277', 12, 'C21', 21, 8],
  ['314', 13, 'C18-2', 18, 7], ['314', 14, 'C18M', 18, 7], ['314', 15, 'C18-1', 18, 7], ['314', 16, 'C18', 18, 7],
  ['283-284', 17, 'C15', 15, 6], ['283-284', 18, 'C15-1M', 15, 6], ['283-284', 19, 'A', 36, 10], ['283-284', 20, 'A', 36, 10],
  ['283-284', 21, 'C15M', 15, 6], ['283-284', 22, 'C15-1', 15, 6], ['283-284', 23, 'C15-1M', 15, 6], ['283-284', 24, 'C15M', 15, 6],
  ['214-215', 25, 'A1M', 26, 7], ['214-215', 26, 'A1', 26, 7],
  ['200-313', 27, 'C15-2', 15, 6], ['200-313', 28, 'B1', 10, 6], ['200-313', 29, 'C15M', 15, 6], ['200-313', 30, 'A1-1', 26, 7],
]

export function defaultStructure(): { lots: Lot[]; buildings: Building[] } {
  const lots: Lot[] = []
  const buildings: Building[] = []
  const projectStart = toDay('2025-05-01')
  const perLotIndex = new Map<string, number>()
  for (const [lotName, num, type, apts, floors] of AKKO_590) {
    let lot = lots.find((l) => l.name === `מגרש ${lotName}`)
    if (!lot) lots.push((lot = { id: `L${lotName}`, name: `מגרש ${lotName}` }))
    const li = lots.indexOf(lot)
    const j = perLotIndex.get(lot.id) ?? 0
    perLotIndex.set(lot.id, j + 1)
    buildings.push({
      id: `B${num}`,
      lotId: lot.id,
      name: String(num),
      type,
      floors,
      apts,
      start: projectStart + li * 105 + j * 20,
    })
  }
  return { lots, buildings }
}

export function defaultData(): ProjectData {
  const { lots, buildings } = defaultStructure()
  return {
    projectName: 'פרויקט עכו 590',
    lots,
    buildings,
    trades: defaultTrades,
    sampleOn: true,
  }
}

// ---------- תוכנית מצב (מתוך תשריט המגרשים) ----------
// קואורדינטות בפיקסלים של התשריט: x מערב→מזרח, y צפון→דרום. סקאלה: 0.32 מ׳ לפיקסל.
export const PLAN_SCALE = 0.32
export const PLAN_CENTER = { x: 450, y: 630 }
/** מרכז כל בניין לפי מספרו */
export const PLAN_BUILDINGS: Record<string, [number, number]> = {
  '23': [122, 95], '24': [228, 95], '22': [122, 178], '21': [228, 268], '20': [122, 305], '19': [122, 395], '18': [122, 485], '17': [240, 485],
  '28': [488, 92], '27': [402, 142], '29': [562, 142], '30': [728, 142],
  '26': [405, 280], '25': [405, 368],
  '1': [122, 600], '2': [122, 698], '3': [228, 698],
  '16': [405, 600], '15': [512, 600], '13': [405, 715], '14': [512, 715],
  '4': [122, 925], '5': [228, 925], '6': [228, 1022], '7': [128, 1145],
  '11': [400, 888], '12': [522, 888], '10': [400, 985], '9': [388, 1075], '8': [400, 1165],
}
/** גבולות המגרשים (מלבנים: x1,y1,x2,y2) לפי שם המגרש */
export const PLAN_LOTS: Record<string, [number, number, number, number][]> = {
  'מגרש 283-284': [[60, 58, 288, 525]],
  'מגרש 200-313': [[343, 58, 835, 182]],
  'מגרש 214-215': [[343, 220, 497, 428]],
  'מגרש 282': [[60, 563, 288, 738]],
  'מגרש 314': [[343, 563, 583, 760]],
  'מגרש 288': [[60, 893, 288, 1205]],
  'מגרש 253-277': [[343, 855, 583, 940], [343, 855, 462, 1205]],
}
