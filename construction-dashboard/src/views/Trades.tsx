import { useState } from 'react'
import { useStore } from '../store'
import type { Level, Trade } from '../types'

const PALETTE = ['#2f7fc1', '#e0a526', '#c46b4b', '#5a8a3c', '#9c6bc4', '#3c8a7e', '#d68fb0', '#8a5a2b', '#5b6cc9', '#c9a20e']

export function Trades() {
  const { model, update, data, ask } = useStore()
  const trades = model.trades
  const last = trades[trades.length - 1]
  const [form, setForm] = useState({ name: '', level: 'apt' as Level, after: last?.id ?? '', color: PALETTE[trades.length % PALETTE.length] })

  const patch = (id: string, p: Partial<Trade>) =>
    update((d) => ({ ...d, trades: d.trades.map((t) => (t.id === id ? { ...t, ...p } : t)) }))

  const remove = (id: string) => {
    const t = data.trades.find((x) => x.id === id)
    if (!t) return
    ask(`למחוק את המלאכה "${t.name}"? כל הסימונים שלה יימחקו.`, () => update((d) => ({
      ...d,
      // מלאכות שתלויות בה עוברות לתלות במלאכה שלפניה
      trades: d.trades.filter((x) => x.id !== id).map((x) => (x.after === id ? { ...x, after: t.after } : x)),
      userDone: Object.fromEntries(Object.entries(d.userDone).filter(([k]) => !k.startsWith(id + '|'))),
    })))
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
    }
    update((d) => ({ ...d, trades: [...d.trades, t] }))
    setForm({ ...form, name: '', after: t.id, color: PALETTE[(trades.length + 1) % PALETTE.length] })
  }

  const countFor = (t: Trade) => model.tasks.filter((x) => x.tradeId === t.id).length

  return (
    <div className="view">
      <section className="card">
        <h3>הוספת מלאכה חדשה</h3>
        <p className="muted small">
          מלאכה חדשה נפתחת אוטומטית בכל הבניינים — לכל קומה (מלאכת קומה) או לכל דירה (מלאכת דירה).
        </p>
        <div className="form-row">
          <input placeholder="שם המלאכה, למשל: גבס" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level })}>
            <option value="apt">לכל דירה</option>
            <option value="floor">לכל קומה</option>
          </select>
          <label className="inline">
            אחרי
            <select value={form.after} onChange={(e) => setForm({ ...form, after: e.target.value })}>
              <option value="">— ראשונה —</option>
              {trades.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          <button className="btn primary" onClick={add}>
            + הוסף
          </button>
        </div>
      </section>

      <section className="card">
        <h3>מלאכות ({trades.length})</h3>
        <table className="list">
          <thead>
            <tr>
              <th>#</th>
              <th>צבע</th>
              <th>שם</th>
              <th>רמה</th>
              <th>מגיעה אחרי</th>
              <th>משימות</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={t.id}>
                <td className="muted">{i + 1}</td>
                <td>
                  <input type="color" value={t.color} onChange={(e) => patch(t.id, { color: e.target.value })} />
                </td>
                <td>
                  <input className="plain" value={t.name} onChange={(e) => patch(t.id, { name: e.target.value })} />
                </td>
                <td>
                  <select value={t.level} onChange={(e) => patch(t.id, { level: e.target.value as Level })}>
                    <option value="apt">דירה</option>
                    <option value="floor">קומה</option>
                  </select>
                </td>
                <td>
                  <select value={t.after ?? ''} onChange={(e) => patch(t.id, { after: e.target.value || null })}>
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
                <td className="muted num">{countFor(t)}</td>
                <td>
                  <button className="btn danger small" onClick={() => remove(t.id)}>
                    מחק
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
