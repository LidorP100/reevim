/* eslint-disable @typescript-eslint/no-explicit-any */
import type { useStore } from './store'
import { aptDone, countDone, floorLabel, floorUnit, isDone, taskIdOf, tasksForApt } from './engine'
import { fmt, fromDay } from './date'
import { loadScript, saveFile } from './files'
import type { SummaryRow } from './views/Budget'

type Store = ReturnType<typeof useStore>
type Cell = string | number | null | undefined
interface Sheet {
  name: string
  rows: Cell[][]
  widths?: number[]
}

const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'

export async function saveXlsx(filename: string, sheets: Sheet[], toast?: Store['toast']) {
  try {
    await loadScript(XLSX_SRC)
    const X = (window as any).XLSX
    const wb = X.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    for (const sh of sheets) {
      const ws = X.utils.aoa_to_sheet(sh.rows)
      ws['!cols'] = (sh.widths ?? sh.rows[0]?.map(() => 14) ?? []).map((w) => ({ wch: w }))
      if (!ws['!views']) ws['!views'] = [{ RTL: true }]
      X.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))
    }
    const out: Uint8Array = X.write(wb, { bookType: 'xlsx', type: 'array' })
    const r = await saveFile(filename, new Blob([out as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    if (r === 'failed') toast?.({ kind: 'error', text: 'לא ניתן לשמור קובץ בתצוגה הזו' })
  } catch {
    toast?.({ kind: 'error', text: 'הייצוא נכשל — בדוק חיבור לאינטרנט ונסה שוב' })
  }
}

const today = () => fromDay(Math.floor(Date.now() / 86400000))
const d = (s: Store, id: string) => {
  const x = s.done.get(id)
  return x !== undefined && x <= s.date ? fmt(x) : ''
}

/** מטריצת ביצוע: גיליון לכל בניין, תאריך ביצוע בכל תא */
export function exportMatrix(s: Store, buildingIds: string[]) {
  const sheets: Sheet[] = buildingIds.map((bid) => {
    const b = s.model.buildingById.get(bid)!
    const apts = s.model.aptsByBuilding.get(bid) ?? []
    const rows: Cell[][] = [['קומה', 'דירה', ...s.model.trades.map((t) => t.name), '% ביצוע']]
    for (let f = b.floors - 1; f >= 0; f--) {
      rows.push([floorLabel(f), '', ...s.model.trades.map((t) => (t.level === 'floor' ? d(s, taskIdOf(t.id, floorUnit(bid, f))) : '')), ''])
      for (const a of apts.filter((x) => x.floor === f)) {
        const pct = countDone(s.done, tasksForApt(s.model, a.id), s.date).pct
        rows.push([floorLabel(f), a.number, ...s.model.trades.map((t) => (t.level === 'apt' ? d(s, taskIdOf(t.id, a.id)) : '')), Math.round(pct)])
      }
    }
    return { name: `בניין ${b.name}`, rows, widths: [8, 6, ...s.model.trades.map(() => 11), 8] }
  })
  return saveXlsx(`מטריצת ביצוע ${today()}.xlsx`, sheets, s.toast)
}

/** כל הדירות: סטטוס, רוכש, מסירה, ליקויים */
export function exportApartments(s: Store) {
  const aptTrades = s.model.trades.filter((t) => t.level === 'apt')
  const rows: Cell[][] = [['מגרש', 'בניין', 'טיפוס', 'קומה', 'דירה', 'חדרים', 'רוכש', '% ביצוע', 'הושלמה', 'תאריך מסירה', 'ליקויים פתוחים', ...aptTrades.map((t) => t.name)]]
  for (const a of s.model.apts) {
    const b = s.model.buildingById.get(a.buildingId)!
    const lot = s.model.lots.find((l) => l.id === b.lotId)
    const info = s.aptInfo[a.id] ?? {}
    const pct = countDone(s.done, tasksForApt(s.model, a.id), s.date).pct
    rows.push([
      lot?.name ?? '',
      b.name,
      b.type ?? '',
      floorLabel(a.floor),
      a.number,
      info.rooms ?? '',
      info.buyer ?? '',
      Math.round(pct),
      aptDone(s.model, s.done, a.id, s.date) ? 'כן' : '',
      s.handovers[a.id] ? fmt(s.handovers[a.id].day) : '',
      s.defects.filter((x) => x.aptId === a.id && x.status === 'open').length || '',
      ...aptTrades.map((t) => d(s, taskIdOf(t.id, a.id))),
    ])
  }
  return saveXlsx(`סטטוס דירות ${today()}.xlsx`, [{ name: 'דירות', rows, widths: [14, 7, 9, 8, 6, 9, 18, 8, 8, 12, 10, ...aptTrades.map(() => 11)] }], s.toast)
}

export function exportDefects(s: Store) {
  const rows: Cell[][] = [['בניין', 'דירה', 'קומה', 'מלאכה', 'תיאור', 'סטטוס', 'נפתח', 'תוקן']]
  for (const x of s.defects) {
    const a = s.model.aptById.get(x.aptId)
    rows.push([
      s.model.buildingById.get(x.buildingId)?.name ?? '',
      a?.number ?? '',
      a ? floorLabel(a.floor) : '',
      x.tradeId ? s.model.tradeById.get(x.tradeId)?.name ?? '' : '',
      x.text,
      x.status === 'open' ? 'פתוח' : 'תוקן',
      new Date(x.created).toLocaleDateString('he-IL'),
      x.fixedAt ? new Date(x.fixedAt).toLocaleDateString('he-IL') : '',
    ])
  }
  return saveXlsx(`ליקויים ${today()}.xlsx`, [{ name: 'ליקויים', rows, widths: [7, 6, 8, 14, 44, 8, 11, 11] }], s.toast)
}

export function exportReport(s: Store, from: number) {
  const rows: Cell[][] = [['בניין', 'מלאכה', 'כמות', 'יחידה']]
  for (const b of s.model.buildings) {
    const m = new Map<string, number>()
    for (const t of s.model.tasksByBuilding.get(b.id) ?? []) {
      const x = s.done.get(t.id)
      if (x !== undefined && x > from && x <= s.date) m.set(t.tradeId, (m.get(t.tradeId) ?? 0) + 1)
    }
    for (const [tid, n] of m) {
      const t = s.model.tradeById.get(tid)!
      rows.push([b.name, t.name, n, t.level === 'floor' ? 'קומות' : 'דירות'])
    }
  }
  return saveXlsx(`דוח ביצוע ${fromDay(from + 1)} עד ${fromDay(s.date)}.xlsx`, [{ name: 'בוצע בתקופה', rows, widths: [8, 18, 8, 8] }], s.toast)
}

export function exportBudget(s: Store, summary: { rows: SummaryRow[]; total: SummaryRow }) {
  const upTo = fromDay(s.date).slice(0, 7)
  const paid = (x: { invoices: Record<string, { month: string; amount: number } | null> }) =>
    Object.values(x.invoices ?? {}).reduce((a, i) => (i && i.month <= upTo ? a + (+i.amount || 0) : a), 0)
  const sum: Cell[][] = [['סעיף', 'תקציב', 'שולם', 'יתרה', 'תחזית לסיום'], ...summary.rows.map((r) => [r.group, r.budget, r.paid, r.budget - r.paid, Math.round(r.eac)])]
  sum.push(['סה״כ', summary.total.budget, summary.total.paid, summary.total.budget - summary.total.paid, Math.round(summary.total.eac)])
  const cons: Cell[][] = [['קבלן', 'מקצועות', 'טלפון', 'איש קשר', 'סעיף תקציב', 'חוזה', 'שולם', 'יתרה', '% ביצוע']]
  for (const c of s.contractors) {
    const tasks = s.model.tasks.filter((t) => c.trades.includes(t.tradeId))
    cons.push([
      c.name,
      c.trades.map((t) => s.model.tradeById.get(t)?.name).filter(Boolean).join(', '),
      c.phone ?? '',
      c.contact ?? '',
      c.code ?? '',
      c.budget,
      paid(c),
      c.budget - paid(c),
      tasks.length ? Math.round(countDone(s.done, tasks, s.date).pct) : '',
    ])
  }
  const inv: Cell[][] = [['גורם', 'סוג', 'חודש', 'סכום', 'הערה']]
  for (const c of s.contractors) for (const i of Object.values(c.invoices ?? {})) if (i) inv.push([c.name, 'קבלן', i.month, i.amount, i.note ?? ''])
  for (const l of s.budget) for (const i of Object.values(l.invoices ?? {})) if (i) inv.push([l.name, l.category, i.month, i.amount, i.note ?? ''])
  const lines: Cell[][] = [['סעיף', 'קטגוריה', 'מספר', 'תקציב', 'שולם', 'יתרה'], ...s.budget.map((l) => [l.name, l.category, l.code ?? '', l.budget, paid(l), l.budget - paid(l)])]
  return saveXlsx(
    `תקציב ${today()}.xlsx`,
    [
      { name: 'סיכום', rows: sum, widths: [26, 14, 14, 14, 14] },
      { name: 'קבלנים', rows: cons, widths: [22, 24, 14, 14, 10, 13, 13, 13, 8] },
      { name: 'סעיפים נוספים', rows: lines, widths: [24, 16, 10, 13, 13, 13] },
      { name: 'חשבונות', rows: inv, widths: [22, 14, 9, 13, 30] },
    ],
    s.toast,
  )
}

export { isDone }
