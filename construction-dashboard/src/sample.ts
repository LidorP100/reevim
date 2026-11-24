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

// 7 מגרשים, 30 בניינים, 590 דירות (התפלגות דוגמה)
export function defaultStructure(): { lots: Lot[]; buildings: Building[] } {
  const perLot = [5, 4, 4, 5, 4, 4, 4]
  // שלושה טיפוסים: 9×2=18, 10×2=20, 7×3=21 → 10 מכל טיפוס = 590
  const types = [
    { floors: 9, apf: 2 },
    { floors: 10, apf: 2 },
    { floors: 7, apf: 3 },
  ]
  const lots: Lot[] = []
  const buildings: Building[] = []
  const projectStart = toDay('2025-03-01')
  let k = 0
  perLot.forEach((n, i) => {
    const lotId = `L${i + 1}`
    lots.push({ id: lotId, name: `מגרש ${i + 1}` })
    for (let j = 0; j < n; j++) {
      const t = types[k % 3]
      buildings.push({
        id: `B${k + 1}`,
        lotId,
        name: `${i + 1}${'אבגדהוז'[j]}`,
        floors: t.floors,
        aptsPerFloor: t.apf,
        start: projectStart + i * 105 + j * 21,
      })
      k++
    }
  })
  return { lots, buildings }
}

export function defaultData(): ProjectData {
  const { lots, buildings } = defaultStructure()
  return {
    projectName: 'פרויקט מגורים',
    lots,
    buildings,
    trades: defaultTrades,
    userDone: {},
    sampleOn: true,
  }
}
