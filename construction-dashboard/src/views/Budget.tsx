import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store'
import type { BudgetLine, Contractor } from '../types'
import { countDone } from '../engine'
import { fromDay, TODAY } from '../date'
import { Icon } from '../components/ui'
import { Contractors, ils } from './Contractors'
import { exportBudget } from '../exporters'

export const CATEGORIES = ['תכנון ויועצים', 'פיקוח', 'אגרות והיטלים', 'ביטוח', 'פיתוח ותשתיות', 'הוצאות כלליות', 'שיווק ומכירות', 'מימון', 'אחר']
const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`
export const paidOf = (x: { invoices: Record<string, { month: string; amount: number } | null> }, upTo?: string) =>
  Object.values(x.invoices ?? {}).reduce((a, i) => (i && (!upTo || i.month <= upTo) ? a + (+i.amount || 0) : a), 0)

function LineCard({ l, open, onToggle }: { l: BudgetLine; open: boolean; onToggle: () => void }) {
  const { saveBudget, canWrite, ask, toast, date } = useStore()
  const upTo = fromDay(date).slice(0, 7)
  const paid = paidOf(l, upTo)
  const remaining = l.budget - paid
  const pct = l.budget > 0 ? (paid / l.budget) * 100 : 0
  const [inv, setInv] = useState({ month: fromDay(Math.min(date, TODAY)).slice(0, 7), amount: '', note: '' })
  const patch = (p: Partial<BudgetLine>) => saveBudget({ ...l, ...p })
  const invoices = Object.entries(l.invoices ?? {})
    .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
    .sort((a, b) => b[1].month.localeCompare(a[1].month))
  return (
    <article className={`card contractor${open ? ' open' : ''}`}>
      <button className="contractor-head" onClick={onToggle} aria-expanded={open}>
        <div className="contractor-id">
          <b>{l.name}</b>
          <div className="chips" style={{ gap: 4 }}>
            <span className="badge">{l.category}</span>
            {l.code && <span className="badge accent">סעיף {l.code}</span>}
          </div>
        </div>
        <div className="money">
          <div>
            <span>תקציב</span>
            <b>{ils(l.budget)}</b>
          </div>
          <div>
            <span>שולם</span>
            <b>{ils(paid)}</b>
          </div>
          <div>
            <span>יתרה</span>
            <b className={remaining < 0 ? 'danger-text' : 'ok-text'}>{ils(remaining)}</b>
          </div>
        </div>
        <div className="budget-bar">
          <div className="budget-fill" style={{ width: `${Math.min(100, pct)}%`, background: remaining < 0 ? 'var(--danger)' : 'var(--accent)' }} />
        </div>
      </button>
      {open && (
        <div className="contractor-body">
          <div className="info-grid">
            <label className="field">
              שם הסעיף
              <input type="text" defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && patch({ name: e.target.value.trim() })} disabled={!canWrite} />
            </label>
            <label className="field">
              קטגוריה
              <select value={l.category} onChange={(e) => patch({ category: e.target.value })} disabled={!canWrite}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              מספר סעיף
              <input type="text" defaultValue={l.code ?? ''} onBlur={(e) => e.target.value !== (l.code ?? '') && patch({ code: e.target.value.trim() })} disabled={!canWrite} />
            </label>
            <label className="field">
              תקציב (₪)
              <input type="number" min={0} step={1000} style={{ width: '100%' }} defaultValue={l.budget} onBlur={(e) => +e.target.value !== l.budget && patch({ budget: Math.max(0, +e.target.value || 0) })} disabled={!canWrite} />
            </label>
          </div>
          {canWrite && (
            <form
              className="form-row"
              onSubmit={(e) => {
                e.preventDefault()
                const amount = +inv.amount
                if (!(amount > 0) || !inv.month) return toast({ kind: 'warn', text: 'צריך חודש וסכום חיובי' })
                patch({ invoices: { ...l.invoices, ['i' + Date.now().toString(36)]: { month: inv.month, amount, note: inv.note.trim() || undefined, created: Date.now() } } })
                setInv({ ...inv, amount: '', note: '' })
              }}
            >
              <input type="month" value={inv.month} onChange={(e) => setInv({ ...inv, month: e.target.value })} aria-label="חודש" />
              <input type="number" min={0} step={100} placeholder="סכום ₪" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} style={{ width: 130 }} aria-label="סכום" />
              <input type="text" placeholder="הערה" value={inv.note} onChange={(e) => setInv({ ...inv, note: e.target.value })} />
              <button className="btn primary" type="submit">
                <Icon name="plus" size={15} /> הוסף תשלום
              </button>
            </form>
          )}
          {invoices.length > 0 && (
            <table className="list compact">
              <tbody>
                {invoices.map(([id, i]) => (
                  <tr key={id}>
                    <td className="num">{monthLabel(i.month)}</td>
                    <td className="num">{ils(i.amount)}</td>
                    <td className="muted">{i.note}</td>
                    <td>
                      {canWrite && (
                        <button className="btn ghost small icon" aria-label="מחק" onClick={() => ask('למחוק את התשלום?', () => patch({ invoices: { ...l.invoices, [id]: null } }))}>
                          <Icon name="x" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canWrite && (
            <button className="btn danger small" style={{ alignSelf: 'flex-start' }} onClick={() => ask(`למחוק את הסעיף ${l.name}?`, () => saveBudget(l, true))}>
              מחק סעיף
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function Lines() {
  const { budget, saveBudget, canWrite } = useStore()
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', category: CATEGORIES[0], code: '', budget: '' })
  const byCat = CATEGORIES.map((c) => ({ c, list: budget.filter((l) => l.category === c) })).filter((g) => g.list.length)
  return (
    <div className="grid-2 split">
      <div className="stack">
        {byCat.length === 0 ? (
          <div className="card empty">
            <Icon name="report" size={36} />
            <b>אין עדיין סעיפי תקציב נוספים</b>
            <span className="small">כאן נכנס כל מה שאינו קבלן ביצוע: תכנון, פיקוח, אגרות, ביטוח, שיווק, מימון…</span>
          </div>
        ) : (
          byCat.map((g) => (
            <section key={g.c} className="stack" style={{ gap: 10 }}>
              <h3 className="group-title">
                {g.c} <span className="muted small">{g.list.length}</span>
              </h3>
              {g.list.map((l) => (
                <LineCard key={l.id} l={l} open={open === l.id} onToggle={() => setOpen(open === l.id ? null : l.id)} />
              ))}
            </section>
          ))
        )}
      </div>
      {canWrite && (
        <section className="card">
          <h3>הוספת סעיף</h3>
          <form
            className="stack"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!form.name.trim()) return
              const l: BudgetLine = {
                id: 'bl' + Date.now().toString(36),
                name: form.name.trim(),
                category: form.category,
                code: form.code.trim() || undefined,
                budget: Math.max(0, +form.budget || 0),
                invoices: {},
                created: Date.now(),
              }
              saveBudget(l)
              setOpen(l.id)
              setForm({ ...form, name: '', code: '', budget: '' })
            }}
          >
            <input type="text" placeholder="שם הסעיף, למשל: פיקוח עליון" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="שם סעיף" />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="קטגוריה">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="text" placeholder="מספר סעיף" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={{ flex: 1, minWidth: 0 }} aria-label="מספר סעיף" />
              <input type="number" min={0} step={1000} placeholder="תקציב ₪" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} style={{ flex: 1, minWidth: 0, width: 'auto' }} aria-label="תקציב" />
            </div>
            <button className="btn primary" type="submit" disabled={!form.name.trim()}>
              <Icon name="plus" size={15} /> הוסף סעיף
            </button>
          </form>
        </section>
      )}
    </div>
  )
}

export interface SummaryRow {
  group: string
  budget: number
  paid: number
  eac: number
}

/** תחזית לסיום לקבלן: אם שולם יותר מהביצוע — מקרינים לפי היחס */
export function contractorEac(c: Contractor, paid: number, prog: number) {
  if (prog >= 5 && paid > 0) return Math.max(c.budget, (paid / prog) * 100)
  return Math.max(c.budget, paid)
}

export function useBudgetSummary() {
  const { contractors, budget, model, done, date } = useStore()
  return useMemo(() => {
    const upTo = fromDay(date).slice(0, 7)
    const rows: SummaryRow[] = []
    const byTrade = new Map<string, SummaryRow>()
    for (const c of contractors) {
      const t = model.tradeById.get(c.trades[0] ?? '')
      const key = t ? `קבלן · ${t.name}` : 'קבלנים — ללא מקצוע'
      const tasks = model.tasks.filter((x) => c.trades.includes(x.tradeId))
      const prog = tasks.length ? countDone(done, tasks, date).pct : 0
      const paid = paidOf(c, upTo)
      const r = byTrade.get(key) ?? { group: key, budget: 0, paid: 0, eac: 0 }
      r.budget += c.budget
      r.paid += paid
      r.eac += contractorEac(c, paid, prog)
      byTrade.set(key, r)
    }
    rows.push(...byTrade.values())
    for (const cat of CATEGORIES) {
      const ls = budget.filter((l) => l.category === cat)
      if (!ls.length) continue
      const paid = ls.reduce((a, l) => a + paidOf(l, upTo), 0)
      rows.push({ group: cat, budget: ls.reduce((a, l) => a + l.budget, 0), paid, eac: ls.reduce((a, l) => a + Math.max(l.budget, paidOf(l, upTo)), 0) })
    }
    const total = rows.reduce((a, r) => ({ group: 'סה״כ', budget: a.budget + r.budget, paid: a.paid + r.paid, eac: a.eac + r.eac }), { group: 'סה״כ', budget: 0, paid: 0, eac: 0 })
    return { rows, total }
  }, [contractors, budget, model, done, date])
}

function Summary() {
  const { rows, total } = useBudgetSummary()
  const over = total.eac - total.budget
  return (
    <>
      <div className="kpis stagger">
        <div className="kpi" style={{ ['--i' as string]: 0 }}>
          <span className="kpi-label">תקציב כולל</span>
          <span className="kpi-value">{ils(total.budget)}</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 1 }}>
          <span className="kpi-label">שולם עד כה</span>
          <span className="kpi-value">{ils(total.paid)}</span>
          <span className="kpi-sub">{total.budget ? ((total.paid / total.budget) * 100).toFixed(1) : 0}% מהתקציב</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 2 }}>
          <span className="kpi-label">יתרה</span>
          <span className={`kpi-value ${total.budget - total.paid < 0 ? 'danger-text' : ''}`}>{ils(total.budget - total.paid)}</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 3 }}>
          <span className="kpi-label">תחזית לסיום</span>
          <span className={`kpi-value ${over > 0 ? 'danger-text' : ''}`}>{ils(total.eac)}</span>
          <span className="kpi-sub">{over > 0 ? `חריגה צפויה של ${ils(over)}` : 'בתוך התקציב'}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="card empty">הסיכום יופיע אחרי שיוזנו קבלנים או סעיפי תקציב.</div>
      ) : (
        <div className="grid-2">
          <section className="card">
            <h3>לפי סעיף</h3>
            <div className="table-wrap">
              <table className="list">
                <thead>
                  <tr>
                    <th>סעיף</th>
                    <th className="num">תקציב</th>
                    <th className="num">שולם</th>
                    <th className="num">יתרה</th>
                    <th className="num">תחזית לסיום</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.group}>
                      <td>{r.group}</td>
                      <td className="num">{ils(r.budget)}</td>
                      <td className="num">{ils(r.paid)}</td>
                      <td className={`num ${r.budget - r.paid < 0 ? 'danger-text' : ''}`}>{ils(r.budget - r.paid)}</td>
                      <td className={`num ${r.eac > r.budget ? 'danger-text' : ''}`}>{ils(r.eac)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <b>סה״כ</b>
                    </td>
                    <td className="num">
                      <b>{ils(total.budget)}</b>
                    </td>
                    <td className="num">
                      <b>{ils(total.paid)}</b>
                    </td>
                    <td className="num">
                      <b>{ils(total.budget - total.paid)}</b>
                    </td>
                    <td className="num">
                      <b>{ils(total.eac)}</b>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted small">תחזית לסיום לקבלן = לפי היחס בין מה ששולם לאחוז הביצוע בפועל (אם שולם יותר מהביצוע, צפויה חריגה). לסעיפים אחרים = התקציב, או מה ששולם אם עבר אותו.</p>
          </section>
          <section className="card">
            <h3>תקציב מול שולם</h3>
            <div className="chart" dir="ltr">
              <ResponsiveContainer width="100%" height={Math.max(260, rows.length * 38)}>
                <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}K`)} />
                  <YAxis type="category" dataKey="group" width={130} tick={{ fontSize: 11 }} interval={0} />
                  <Tooltip formatter={(v, n) => [ils(+v), n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="budget" name="תקציב" fill="var(--line-2)" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="paid" name="שולם" fill="var(--accent)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export function Budget() {
  const [tab, setTab] = useState<'contractors' | 'lines' | 'summary'>('contractors')
  const store = useStore()
  const summary = useBudgetSummary()
  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {(
            [
              ['contractors', 'קבלנים', 'users'],
              ['lines', 'סעיפי תקציב נוספים', 'report'],
              ['summary', 'סיכום ותחזית', 'trend'],
            ] as const
          ).map(([k, l, ic]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <Icon name={ic} size={15} />
              {l}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => exportBudget(store, summary)}>
          <Icon name="report" size={15} /> ייצוא לאקסל
        </button>
      </div>
      <div key={tab} className="page" style={{ gap: 16 }}>
        {tab === 'contractors' && <Contractors />}
        {tab === 'lines' && <Lines />}
        {tab === 'summary' && <Summary />}
      </div>
    </>
  )
}
