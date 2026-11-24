import { useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '../store'
import type { Contractor } from '../types'
import { countDone } from '../engine'
import { fromDay, TODAY } from '../date'
import { Icon } from '../components/ui'

export const ils = (n: number) => '₪' + Math.round(n).toLocaleString('he-IL')
const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`
const sumInv = (c: Contractor, upTo?: string) =>
  Object.values(c.invoices ?? {}).reduce((a, i) => (i && (!upTo || i.month <= upTo) ? a + (+i.amount || 0) : a), 0)
const ALERT_GAP = 10

function ContractorCard({ c, open, onToggle }: { c: Contractor; open: boolean; onToggle: () => void }) {
  const { model, done, date, saveContractor, canWrite, ask, toast } = useStore()
  const upTo = fromDay(date).slice(0, 7)
  const paid = sumInv(c, upTo)
  const remaining = c.budget - paid
  const paidPct = c.budget > 0 ? (paid / c.budget) * 100 : 0
  const tasks = useMemo(() => model.tasks.filter((t) => c.trades.includes(t.tradeId)), [model, c.trades])
  const prog = countDone(done, tasks, date).pct
  const ahead = c.budget > 0 && tasks.length > 0 && paidPct - prog > ALERT_GAP
  const invoices = Object.entries(c.invoices ?? {})
    .filter((e): e is [string, NonNullable<(typeof e)[1]>] => !!e[1])
    .sort((a, b) => b[1].month.localeCompare(a[1].month) || b[1].created - a[1].created)
  const [inv, setInv] = useState({ month: fromDay(Math.min(date, TODAY)).slice(0, 7), amount: '', note: '' })
  const patch = (p: Partial<Contractor>) => saveContractor({ ...c, ...p })

  return (
    <article className={`card contractor${open ? ' open' : ''}`}>
      <button className="contractor-head" onClick={onToggle} aria-expanded={open}>
        <div className="contractor-id">
          <b>{c.name}</b>
          <div className="chips" style={{ gap: 4 }}>
            {c.trades.map((tid) => {
              const t = model.tradeById.get(tid)
              return t ? (
                <span key={tid} className="badge" style={{ borderColor: t.color }}>
                  <span className="dot" style={{ background: t.color, width: 8, height: 8 }} />
                  {t.name}
                </span>
              ) : null
            })}
            {c.code && <span className="badge accent">סעיף {c.code}</span>}
          </div>
        </div>
        <div className="money">
          <div>
            <span>חוזה</span>
            <b>{ils(c.budget)}</b>
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
        <div className="budget-bar" title={`שולם ${paidPct.toFixed(0)}% מהחוזה · בוצע ${prog.toFixed(0)}% מהעבודה`}>
          <div className="budget-fill" style={{ width: `${Math.min(100, paidPct)}%`, background: ahead ? 'var(--danger)' : 'var(--accent)' }} />
          {tasks.length > 0 && <i className="budget-mark" style={{ insetInlineStart: `${Math.min(100, prog)}%` }} />}
        </div>
        <div className="budget-legend small">
          <span>שולם {paidPct.toFixed(0)}%</span>
          {tasks.length > 0 && <span className="muted">בוצע {prog.toFixed(0)}%</span>}
          {ahead && <span className="badge danger">חיוב מעל הביצוע</span>}
          {remaining < 0 && <span className="badge danger">חריגה מהתקציב</span>}
        </div>
      </button>

      {open && (
        <div className="contractor-body">
          <div className="info-grid">
            <label className="field">
              שם הקבלן
              <input type="text" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && patch({ name: e.target.value.trim() })} disabled={!canWrite} />
            </label>
            <label className="field">
              טלפון
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <input type="text" dir="ltr" defaultValue={c.phone ?? ''} onBlur={(e) => e.target.value !== (c.phone ?? '') && patch({ phone: e.target.value.trim() })} disabled={!canWrite} style={{ flex: 1, minWidth: 0 }} />
                {c.phone && (
                  <>
                    <a className="btn icon" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label="חייג" title="חייג">
                      <Icon name="share" size={15} />
                    </a>
                    <button
                      className="btn icon"
                      aria-label="העתק מספר"
                      title="העתק"
                      onClick={() => navigator.clipboard?.writeText(c.phone!).then(() => toast({ kind: 'ok', text: 'המספר הועתק' }), () => {})}
                    >
                      <Icon name="copy" size={15} />
                    </button>
                  </>
                )}
              </div>
            </label>
            <label className="field">
              איש קשר
              <input type="text" defaultValue={c.contact ?? ''} onBlur={(e) => e.target.value !== (c.contact ?? '') && patch({ contact: e.target.value.trim() })} disabled={!canWrite} />
            </label>
            <label className="field">
              סעיף תקציב
              <input type="text" defaultValue={c.code ?? ''} onBlur={(e) => e.target.value !== (c.code ?? '') && patch({ code: e.target.value.trim() })} disabled={!canWrite} />
            </label>
            <label className="field">
              סכום החוזה (₪)
              <input type="number" min={0} step={1000} style={{ width: '100%' }} defaultValue={c.budget} onBlur={(e) => +e.target.value !== c.budget && patch({ budget: Math.max(0, +e.target.value || 0) })} disabled={!canWrite} />
            </label>
            <label className="field">
              הערות
              <input type="text" defaultValue={c.notes ?? ''} onBlur={(e) => e.target.value !== (c.notes ?? '') && patch({ notes: e.target.value })} disabled={!canWrite} />
            </label>
          </div>
          <div>
            <div className="muted small" style={{ marginBottom: 6 }}>מקצועות (לחיצה מוסיפה או מסירה)</div>
            <div className="chips">
              {model.trades.map((t) => {
                const on = c.trades.includes(t.id)
                return (
                  <button
                    key={t.id}
                    className="chip"
                    disabled={!canWrite}
                    style={on ? { background: t.color, borderColor: t.color, color: '#fff' } : undefined}
                    onClick={() => patch({ trades: on ? c.trades.filter((x) => x !== t.id) : [...c.trades, t.id] })}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '4px 0 8px' }}>חשבונות חודשיים</h4>
            {canWrite && (
              <form
                className="form-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  const amount = +inv.amount
                  if (!(amount > 0) || !inv.month) return toast({ kind: 'warn', text: 'צריך חודש וסכום חיובי' })
                  const id = 'i' + Date.now().toString(36)
                  patch({ invoices: { ...c.invoices, [id]: { month: inv.month, amount, note: inv.note.trim() || undefined, created: Date.now() } } })
                  setInv({ ...inv, amount: '', note: '' })
                  toast({ kind: 'ok', text: `חשבון ${ils(amount)} נוסף — יתרה ${ils(remaining - (inv.month <= upTo ? amount : 0))}` })
                }}
              >
                <input type="month" value={inv.month} onChange={(e) => setInv({ ...inv, month: e.target.value })} aria-label="חודש" />
                <input type="number" min={0} step={100} placeholder="סכום ₪" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} style={{ width: 130 }} aria-label="סכום" />
                <input type="text" placeholder="הערה (חשבון חלקי 4…)" value={inv.note} onChange={(e) => setInv({ ...inv, note: e.target.value })} />
                <button className="btn primary" type="submit">
                  <Icon name="plus" size={15} /> הוסף חשבון
                </button>
              </form>
            )}
            {invoices.length === 0 ? (
              <p className="muted small">עדיין לא הוזנו חשבונות.</p>
            ) : (
              <div className="table-wrap">
                <table className="list compact">
                  <thead>
                    <tr>
                      <th>חודש</th>
                      <th className="num">סכום</th>
                      <th>הערה</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(([id, i]) => (
                      <tr key={id} style={i.month > upTo ? { opacity: 0.45 } : undefined}>
                        <td className="num">{monthLabel(i.month)}</td>
                        <td className="num">{ils(i.amount)}</td>
                        <td className="muted">{i.note}</td>
                        <td>
                          {canWrite && (
                            <button className="btn ghost small icon" aria-label="מחק חשבון" onClick={() => ask(`למחוק את החשבון של ${monthLabel(i.month)} (${ils(i.amount)})?`, () => patch({ invoices: { ...c.invoices, [id]: null } }))}>
                              <Icon name="x" size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>
                        <b>סה״כ</b>
                      </td>
                      <td className="num">
                        <b>{ils(paid)}</b>
                      </td>
                      <td colSpan={2} className="muted small">
                        יתרה לסוף: <b className={remaining < 0 ? 'danger-text' : ''}>{ils(remaining)}</b>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          {canWrite && (
            <button className="btn danger small" style={{ alignSelf: 'flex-start' }} onClick={() => ask(`למחוק את הקבלן ${c.name} וכל החשבונות שלו?`, () => saveContractor(c, true))}>
              מחק קבלן
            </button>
          )}
        </div>
      )}
    </article>
  )
}

export function Contractors() {
  const { model, contractors, saveContractor, canWrite, date, shared, toast, done } = useStore()
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState({ name: '', trade: '', phone: '', code: '', budget: '' })
  const upTo = fromDay(date).slice(0, 7)

  const totals = useMemo(() => {
    const budget = contractors.reduce((a, c) => a + (c.budget || 0), 0)
    const paid = contractors.reduce((a, c) => a + sumInv(c, upTo), 0)
    const byMonth = new Map<string, number>()
    for (const c of contractors) for (const i of Object.values(c.invoices ?? {})) if (i) byMonth.set(i.month, (byMonth.get(i.month) ?? 0) + (+i.amount || 0))
    let cum = 0
    const months = [...byMonth.keys()].sort().map((m) => {
      cum += byMonth.get(m)!
      return { m: monthLabel(m), month: byMonth.get(m)!, cum }
    })
    return { budget, paid, months }
  }, [contractors, upTo])

  const groups = useMemo(() => {
    const seen = new Set<string>()
    const out: { title: string; color?: string; list: Contractor[] }[] = []
    for (const t of model.trades) {
      if (filter && filter !== t.id) continue
      const list = contractors.filter((c) => c.trades[0] === t.id || (!seen.has(c.id) && c.trades.includes(t.id) && filter === t.id))
      list.forEach((c) => seen.add(c.id))
      if (list.length) out.push({ title: t.name, color: t.color, list })
    }
    if (!filter) {
      const rest = contractors.filter((c) => !seen.has(c.id))
      if (rest.length) out.push({ title: 'ללא מקצוע', list: rest })
    }
    return out
  }, [model.trades, contractors, filter])

  const add = () => {
    if (!form.name.trim()) return
    const c: Contractor = {
      id: 'c' + Date.now().toString(36),
      name: form.name.trim(),
      trades: form.trade ? [form.trade] : [],
      phone: form.phone.trim() || undefined,
      code: form.code.trim() || undefined,
      budget: Math.max(0, +form.budget || 0),
      invoices: {},
      created: Date.now(),
    }
    saveContractor(c)
    setOpenId(c.id)
    setForm({ name: '', trade: '', phone: '', code: '', budget: '' })
    toast({ kind: 'ok', text: `${c.name} נוסף` })
  }

  const remaining = totals.budget - totals.paid
  const ahead = contractors.filter((c) => {
    const tasks = model.tasks.filter((t) => c.trades.includes(t.tradeId))
    return c.budget > 0 && tasks.length > 0 && (sumInv(c, upTo) / c.budget) * 100 - countDone(done, tasks, date).pct > ALERT_GAP
  }).length

  return (
    <>
      <div className="kpis stagger">
        <div className="kpi" style={{ ['--i' as string]: 0 }}>
          <span className="kpi-label">תקציב חוזים</span>
          <span className="kpi-value">{ils(totals.budget)}</span>
          <span className="kpi-sub">{contractors.length} קבלנים</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 1 }}>
          <span className="kpi-label">שולם עד {monthLabel(upTo)}</span>
          <span className="kpi-value">{ils(totals.paid)}</span>
          <span className="kpi-sub">{totals.budget ? ((totals.paid / totals.budget) * 100).toFixed(1) : 0}% מהתקציב</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 2 }}>
          <span className="kpi-label">יתרה לסוף הפרויקט</span>
          <span className={`kpi-value ${remaining < 0 ? 'danger-text' : ''}`}>{ils(remaining)}</span>
        </div>
        <div className="kpi" style={{ ['--i' as string]: 3 }}>
          <span className="kpi-label">חיוב מעל הביצוע</span>
          <span className={`kpi-value ${ahead ? 'danger-text' : ''}`}>{ahead}</span>
          <span className="kpi-sub">שולם יותר מ־{ALERT_GAP}% מעבר לאחוז הביצוע</span>
        </div>
      </div>

      {shared && (
        <p className="muted small" style={{ margin: 0 }}>
          <Icon name="users" size={13} /> קבלנים, טלפונים ותקציב גלויים רק לעורכים. מי שיש לו קישור צפייה בלבד לא רואה את המסך הזה.
        </p>
      )}

      <div className="grid-2 split">
        <div className="stack">
          <div className="toolbar">
            <label className="inline muted small">
              מקצוע
              <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="סינון לפי מקצוע">
                <option value="">כל המקצועות</option>
                {model.trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {groups.length === 0 ? (
            <div className="card empty">
              <Icon name="users" size={36} />
              <b>{canWrite ? 'עדיין אין קבלנים' : 'אין קבלנים להצגה'}</b>
              <span className="small">{canWrite ? 'מוסיפים קבלן בטופס שבצד: שם, מקצוע, טלפון, סעיף תקציב וסכום חוזה.' : 'רק עורכים רואים את רשימת הקבלנים והתקציב.'}</span>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.title} className="stack" style={{ gap: 10 }}>
                <h3 className="group-title">
                  {g.color && <span className="dot" style={{ background: g.color }} />}
                  {g.title}
                  <span className="muted small" style={{ fontWeight: 400 }}>
                    {g.list.length}
                  </span>
                </h3>
                {g.list.map((c) => (
                  <ContractorCard key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
                ))}
              </section>
            ))
          )}
        </div>

        <div className="stack">
          {canWrite && (
            <section className="card">
              <h3>הוספת קבלן</h3>
              <form
                className="stack"
                style={{ gap: 8 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  add()
                }}
              >
                <input type="text" placeholder="שם הקבלן / החברה" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="שם" />
                <select value={form.trade} onChange={(e) => setForm({ ...form, trade: e.target.value })} aria-label="מקצוע">
                  <option value="">מקצוע…</option>
                  {model.trades.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input type="text" dir="ltr" placeholder="טלפון" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="טלפון" style={{ textAlign: 'right' }} />
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input type="text" placeholder="סעיף תקציב" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} aria-label="סעיף תקציב" style={{ flex: 1, minWidth: 0 }} />
                  <input type="number" min={0} step={1000} placeholder="סכום חוזה ₪" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} aria-label="סכום חוזה" style={{ flex: 1, minWidth: 0, width: 'auto' }} />
                </div>
                <button className="btn primary" type="submit" disabled={!form.name.trim()}>
                  <Icon name="plus" size={15} /> הוסף קבלן
                </button>
              </form>
            </section>
          )}
          <section className="card">
            <h3>חשבונות לפי חודש</h3>
            {totals.months.length === 0 ? (
              <p className="muted small">הגרף יופיע אחרי שיוזנו חשבונות.</p>
            ) : (
              <div className="chart" dir="ltr">
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={totals.months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--grid)" vertical={false} />
                    <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}K`)} width={44} />
                    <Tooltip formatter={(v, n) => [ils(+v), n]} />
                    <Bar dataKey="month" name="חשבונות בחודש" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                    <Line dataKey="cum" name="מצטבר" stroke="var(--amber)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="muted small">
              הסימון האנכי בפס של כל קבלן = אחוז הביצוע של המקצועות שלו בפועל. כשהתשלום עוקף את הביצוע ביותר מ־{ALERT_GAP}%, הפס נצבע באדום.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}

