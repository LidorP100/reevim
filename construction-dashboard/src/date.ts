const MS = 86400000

export const toDay = (s: string) => Math.floor(Date.parse(s + 'T00:00:00Z') / MS)
export const fromDay = (d: number) => new Date(d * MS).toISOString().slice(0, 10)
export const fmt = (d: number) => {
  const s = fromDay(d)
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`
}
export const fmtMonth = (d: number) => {
  const s = fromDay(d)
  return `${s.slice(5, 7)}/${s.slice(2, 4)}`
}
export const TODAY = Math.floor(Date.now() / MS)
