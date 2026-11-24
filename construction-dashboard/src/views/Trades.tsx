import { useState } from 'react'
import { useStore } from '../store'
import type { Level, Trade } from '../types'
import { countDone } from '../engine'
import { Bar, Icon } from '../components/ui'

const PALETTE = ['#2f7fc1', '#e0a526', '#c46b4b', '#5a8a3c', '#9c6bc4', '#3c8a7e', '#d68fb0', '#8a5a2b', '#5b6cc9', '#c9a20e']

export function Trades() {
  const { model, update, data, ask, done, date, canWrite, contractorFor } = useStore()
  const trades = model.trades
  const last = trades[trades.length - 1]
  const [form, setForm] = useState({ name: '', level: 'apt' as Level, after: last?.id ?? '', color: PALETTE[trades.length % PALETTE.length], contractor: '' })

  const patch = (id: string, p: Partial<Trade>) => update((d) => ({ ...d, trades: d.trades.map((t) => (t.id === id ? { ...t, ...p } : t)) }))

  const remove = (id: string) => {
    const t = data.trades.find((x) => x.id === id)
    if (!t) return
    ask(`למחוק את המלאכה "${t.name}"? היא תוסר מכל הדירות והקומות.`, () =>
      update((d) => ({
        ...d,
        trades: d.trades.filter((x) => x.id !== id).map((x) => (x.after === id ? { ...x, after: t.after } : x)),
      })),
    )
  }

  const add = () => {
    if (!form.name.trim()) return
    const pred = data.trades.find((t) => t.id === form.after)
    const t: Trade = {
      id: 't' + Date.now().toString(36),
      name: form.name.trim(),
      level: form.level,
      color: form.color,
      duration: 5,
      after: form.after || null,
      lag: pred ? pred.duration : 0,
      weight: 1,
      ...(form.contractor.trim() ? { contractor: form.contractor.trim() } : {}),
    }
    update((d) => ({ ...d, trades: [...d.trades, t] }))
    setForm({ ...form, name: '', contractor: '', after: t.id, color: PALETTE[(trades.length + 1) % PALETTE.length] })
  }

  return (
    <>
      {canWrite && (
        <section className="card">
          <h3>הוספת מלאכה</h3>
          <p className="muted small" style={{ marginTop: -6 }}>
            מלאכה חדשה נפתחת מיד בכל הבניינים: לכל דירה, או לכל קומה. ״מגיעה אחרי״ קובע מתי היא נכנסת ללוח העבודה כמוכנה לביצוע.
          </p>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <input id="trade-name" type="text" placeholder="שם המלאכה, למשל: גבס" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select id="trade-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level })}>
              <option value="apt">לכל דירה</option>
              <option value="floor">לכל קומה</option>
            </select>
            <label className="inline muted small">
              מגיעה אחרי
              <select id="trade-after" value={form.after} onChange={(e) => setForm({ ...form, after: e.target.value })}>
                <option value="">— ראשונה —</option>
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <input id="trade-color" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} aria-label="צבע" />
            <button className="btn primary" type="submit" disabled={!form.name.trim()}>
              <Icon name="plus" size={16} /> הוסף
            </button>
          </form>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h3>מלאכות ({trades.length})</h3>
          <span className="muted small">הסדר נקבע לפי ״מגיעה אחרי״ · קבלנים מנוהלים במסך קבלנים ותקציב</span>
        </div>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>#</th>
                <th>צבע</th>
                <th>שם</th>
                <th>רמה</th>
                <th>מגיעה אחרי</th>
                <th>קבלן</th>
                <th style={{ minWidth: 140 }}>ביצוע</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => {
                const c = countDone(done, model.tasks.filter((x) => x.tradeId === t.id), date)
                return (
                  <tr key={t.id}>
                    <td className="muted num">{i + 1}</td>
                    <td>
                      <input type="color" value={t.color} onChange={(e) => patch(t.id, { color: e.target.value })} disabled={!canWrite} aria-label="צבע" />
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <input className="plain" value={t.name} onChange={(e) => patch(t.id, { name: e.target.value })} disabled={!canWrite} aria-label="שם" />
                    </td>
                    <td>
                      <select value={t.level} onChange={(e) => patch(t.id, { level: e.target.value as Level })} disabled={!canWrite} aria-label="רמה">
                        <option value="apt">דירה</option>
                        <option value="floor">קומה</option>
                      </select>
                    </td>
                    <td>
                      <select value={t.after ?? ''} onChange={(e) => patch(t.id, { after: e.target.value || null })} disabled={!canWrite} aria-label="מגיעה אחרי">
                        <option value="">—</option>
                        {trades
                          .filter((x) => x.id !== t.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="small">{contractorFor(t.id)?.name ?? <span className="muted">—</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <Bar pct={c.pct} color={t.color} />
                        <span className="muted small num">{Math.round(c.pct)}%</span>
                      </div>
                    </td>
                    <td>
                      {canWrite && (
                        <button className="btn danger small" onClick={() => remove(t.id)}>
                          מחק
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
