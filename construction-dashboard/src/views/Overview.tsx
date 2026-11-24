import { useMemo } from 'react'
import { useStore } from '../store'
import { aptDone, countDone, isDone, pctColor } from '../engine'

function Bar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${pct}%`, background: color ?? pctColor(pct) }} />
    </div>
  )
}

export function Overview() {
  const { model, done, date, setSel, setTab } = useStore()

  const stats = useMemo(() => {
    const total = countDone(done, model.tasks, date)
    const week = countDone(done, model.tasks, date - 7)
    const aptsDone = model.apts.filter((a) => aptDone(model, done, a.id, date)).length
    const shellTrades = model.trades.filter((t) => t.level === 'floor').map((t) => t.id)
    const shellDone = model.buildings.filter((b) =>
      (model.tasksByBuilding.get(b.id) ?? []).filter((t) => shellTrades.includes(t.tradeId)).every((t) => isDone(done, t.id, date)),
    ).length
    const perBuilding = new Map(
      model.buildings.map((b) => {
        const ts = model.tasksByBuilding.get(b.id) ?? []
        const c = countDone(done, ts, date)
        const apts = model.aptsByBuilding.get(b.id) ?? []
        const delivered = apts.filter((a) => aptDone(model, done, a.id, date)).length
        // השלב הנוכחי: המלאכה האחרונה (לפי סדר) שהתחילה
        let stage = 'טרם התחיל'
        for (const t of model.trades) if (ts.some((x) => x.tradeId === t.id && isDone(done, x.id, date))) stage = t.name
        return [b.id, { ...c, delivered, apts: apts.length, stage }]
      }),
    )
    const perTrade = model.trades.map((t) => ({
      trade: t,
      ...countDone(done, model.tasks.filter((x) => x.tradeId === t.id), date),
    }))
    return { total, weekDelta: total.done - week.done, aptsDone, shellDone, perBuilding, perTrade }
  }, [model, done, date])

  const openBuilding = (id: string) => {
    const b = model.buildingById.get(id)!
    setSel({ lotId: b.lotId, buildingId: id, aptId: null })
    setTab('matrix')
  }

  return (
    <div className="view">
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">התקדמות כללית</span>
          <span className="kpi-value">{stats.total.pct.toFixed(1)}%</span>
          <Bar pct={stats.total.pct} />
        </div>
        <div className="kpi">
          <span className="kpi-label">דירות שהושלמו</span>
          <span className="kpi-value">
            {stats.aptsDone} <small>/ {model.apts.length}</small>
          </span>
          <Bar pct={(stats.aptsDone / Math.max(1, model.apts.length)) * 100} />
        </div>
        <div className="kpi">
          <span className="kpi-label">בניינים עם שלד גמור</span>
          <span className="kpi-value">
            {stats.shellDone} <small>/ {model.buildings.length}</small>
          </span>
          <Bar pct={(stats.shellDone / Math.max(1, model.buildings.length)) * 100} />
        </div>
        <div className="kpi">
          <span className="kpi-label">בוצעו ב־7 הימים האחרונים</span>
          <span className="kpi-value">{stats.weekDelta}</span>
          <span className="kpi-sub">משימות</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>מגרשים ובניינים</h3>
          <div className="lots">
            {model.lots.map((lot) => {
              const bs = model.buildings.filter((b) => b.lotId === lot.id)
              const lotTasks = bs.flatMap((b) => model.tasksByBuilding.get(b.id) ?? [])
              const lc = countDone(done, lotTasks, date)
              const aptCount = bs.reduce((s, b) => s + b.floors * b.aptsPerFloor, 0)
              return (
                <div key={lot.id} className="lot">
                  <div className="lot-head">
                    <b>{lot.name}</b>
                    <span className="muted">
                      {bs.length} בניינים · {aptCount} דירות
                    </span>
                    <span className="lot-pct">{lc.pct.toFixed(0)}%</span>
                  </div>
                  {bs.map((b) => {
                    const s = stats.perBuilding.get(b.id)!
                    return (
                      <button key={b.id} className="brow" onClick={() => openBuilding(b.id)} title="פתח מטריצת ביצוע">
                        <span className="brow-name">בניין {b.name}</span>
                        <Bar pct={s.pct} />
                        <span className="brow-pct">{s.pct.toFixed(0)}%</span>
                        <span className="brow-stage muted">{s.stage}</span>
                        <span className="brow-apts muted">
                          {s.delivered}/{s.apts} דירות
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </section>

        <section className="card">
          <h3>התקדמות לפי מלאכה (כל הפרויקט)</h3>
          <div className="trade-list">
            {stats.perTrade.map(({ trade, pct, done: d, total }) => (
              <div key={trade.id} className="trade-row">
                <span className="dot" style={{ background: trade.color }} />
                <span className="trade-name">{trade.name}</span>
                <Bar pct={pct} color={trade.color} />
                <span className="muted num">
                  {d}/{total}
                </span>
              </div>
            ))}
          </div>
          <p className="muted small">
            מלאכות ברמת קומה נספרות לכל קומה; מלאכות ברמת דירה נספרות לכל דירה.
          </p>
        </section>
      </div>
    </div>
  )
}
