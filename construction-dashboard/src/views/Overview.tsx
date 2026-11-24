import { useMemo } from 'react'
import { useStore } from '../store'
import { aptDone, countDone, forecast, isDone, lateTasks, plannedPct, readyTasks, STUCK_DAYS } from '../engine'
import { fmt } from '../date'
import { Avatar, Bar, CountUp, Icon, Ring } from '../components/ui'
import { exportApartments } from '../exporters'

export function Overview() {
  const store = useStore()
  const { model, done, date, setSel, setTab, marks, names, defects, openApt, data, canWrite, ask, resetTrades } = store

  const s = useMemo(() => {
    const total = countDone(done, model.tasks, date)
    const fc = forecast(done, model.tasks, date)
    const aptsDone = model.apts.filter((a) => aptDone(model, done, a.id, date)).length
    const shellIds = new Set(model.trades.filter((t) => t.level === 'floor').map((t) => t.id))
    const shellDone = model.buildings.filter((b) =>
      (model.tasksByBuilding.get(b.id) ?? []).filter((t) => shellIds.has(t.tradeId)).every((t) => isDone(done, t.id, date)),
    ).length
    const ready = readyTasks(model, done, date)
    let stuck = 0
    for (const since of ready.values()) if (date - since > STUCK_DAYS) stuck++

    const perBuilding = new Map(
      model.buildings.map((b) => {
        const ts = model.tasksByBuilding.get(b.id) ?? []
        const c = countDone(done, ts, date)
        const apts = model.aptsByBuilding.get(b.id) ?? []
        const delivered = apts.filter((a) => aptDone(model, done, a.id, date)).length
        let stage = 'טרם התחיל'
        for (const t of model.trades) if (ts.some((x) => x.tradeId === t.id && isDone(done, x.id, date))) stage = t.name
        return [b.id, { ...c, delivered, apts: apts.length, stage }]
      }),
    )
    const perTrade = model.trades.map((t) => ({ trade: t, ...countDone(done, model.tasks.filter((x) => x.tradeId === t.id), date) }))

    // פעילות אחרונה: ביצועים ב־21 הימים שעד התאריך, מקובצים לפי יום+בניין+מלאכה
    const groups = new Map<string, { day: number; b: string; trade: string; n: number; by?: string; apt?: string }>()
    for (const t of model.tasks) {
      const d = done.get(t.id)
      if (d === undefined || d > date || d < date - 21) continue
      const k = `${d}|${t.buildingId}|${t.tradeId}`
      const g = groups.get(k) ?? { day: d, b: t.buildingId, trade: t.tradeId, n: 0 }
      g.n++
      g.by = g.by ?? marks[t.id]?.by
      g.apt = t.aptId ?? undefined
      groups.set(k, g)
    }
    const feed = [...groups.values()].sort((a, b) => b.day - a.day).slice(0, 9)
    let plan: { planned: number; late: number; worst: { id: string; n: number; gap: number }[] } | null = null
    if (data.planOn && !data.sampleOn) {
      const late = lateTasks(done, model.tasks, date)
      const byB = new Map<string, number>()
      for (const t of late) byB.set(t.buildingId, (byB.get(t.buildingId) ?? 0) + 1)
      const worst = [...byB.entries()]
        .map(([id, n]) => {
          const ts = model.tasksByBuilding.get(id) ?? []
          return { id, n, gap: plannedPct(ts, date) - countDone(done, ts, date).pct }
        })
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 6)
      plan = { planned: plannedPct(model.tasks, date), late: late.length, worst }
    }
    return { total, fc, aptsDone, shellDone, ready: ready.size, stuck, perBuilding, perTrade, feed, plan }
  }, [model, done, date, marks, data.planOn, data.sampleOn])

  const openBuilding = (id: string) => {
    const b = model.buildingById.get(id)!
    setSel({ lotId: b.lotId, buildingId: id, aptId: null })
    setTab('matrix')
  }
  const openDefects = defects.filter((d) => d.status === 'open').length

  return (
    <>
      {data.sampleOn && (
        <section className="card demo-banner">
          <Icon name="building" size={22} />
          <div>
            <b>מוצג כרגע פרויקט שלם להדמיה</b>
            <div className="muted small">
              כל 30 הבניינים מוצגים גמורים, וציר הזמן מראה את הבנייה מההתחלה. כשמתחילים לעבוד באמת — מאפסים את כל המלאכות, ומאז כל יציקה או מלאכה שמסמנים נבנית בתלת מימד. לוח הזמנים המתוכנן מתחיל בחפירת החניונים באפריל 2027.
            </div>
          </div>
          {canWrite && (
            <button className="btn danger" onClick={() => ask('לאפס את כל המלאכות? הפרויקט יוצג ריק, וכל סימוני הביצוע יימחקו.', resetTrades)}>
              <Icon name="refresh" size={15} /> אפס את כל המלאכות
            </button>
          )}
        </section>
      )}
      <section className="card hero">
        <Ring pct={s.total.pct} label={<CountUp value={s.total.pct} decimals={1} suffix="%" />} sub="ביצוע כולל" />
        <div className="hero-facts stagger">
          <div className="fact" style={{ ['--i' as string]: 0 }}>
            <span>דירות שהושלמו</span>
            <b>
              <CountUp value={s.aptsDone} /> <span className="muted" style={{ fontSize: 15 }}>/ {model.apts.length}</span>
            </b>
            <Bar pct={(s.aptsDone / Math.max(1, model.apts.length)) * 100} />
          </div>
          <div className="fact" style={{ ['--i' as string]: 1 }}>
            <span>בניינים עם שלד גמור</span>
            <b>
              <CountUp value={s.shellDone} /> <span className="muted" style={{ fontSize: 15 }}>/ {model.buildings.length}</span>
            </b>
            <Bar pct={(s.shellDone / Math.max(1, model.buildings.length)) * 100} />
          </div>
          <div className="fact" style={{ ['--i' as string]: 2 }}>
            <span>תחזית סיום לפי הקצב</span>
            <b>{s.fc.finish === null ? '—' : s.fc.remaining === 0 ? 'הושלם' : fmt(s.fc.finish)}</b>
            <em>{s.fc.remaining.toLocaleString()} משימות נותרו</em>
          </div>
          <div className="fact" style={{ ['--i' as string]: 3 }}>
            <span>קצב ממוצע (8 שבועות)</span>
            <b>
              <CountUp value={s.fc.perWeek} /> <span className="muted" style={{ fontSize: 14 }}>משימות לשבוע</span>
            </b>
          </div>
          <button className="fact" style={{ ['--i' as string]: 4, border: 0, background: 'none', padding: 0, textAlign: 'start', cursor: 'pointer' }} onClick={() => setTab('board')}>
            <span>מוכן לביצוע עכשיו</span>
            <b>
              <CountUp value={s.ready} />
            </b>
            <em>{s.stuck > 0 ? <span className="danger-text">{s.stuck} ממתינות מעל 3 שבועות</span> : 'אין משימות תקועות'}</em>
          </button>
          <button className="fact" style={{ ['--i' as string]: 5, border: 0, background: 'none', padding: 0, textAlign: 'start', cursor: 'pointer' }} onClick={() => setTab('defects')}>
            <span>ליקויים פתוחים</span>
            <b className={openDefects ? 'danger-text' : ''}>{openDefects}</b>
            <em>{defects.length} נרשמו סה״כ</em>
          </button>
        </div>
      </section>

      {s.plan && (
        <section className="card">
          <div className="card-head">
            <h3>מול לוח הזמנים המתוכנן</h3>
            <span className={`badge ${s.total.pct + 2 < s.plan.planned ? 'danger' : 'ok'}`}>
              {s.total.pct + 2 < s.plan.planned ? `פיגור של ${(s.plan.planned - s.total.pct).toFixed(1)}%` : 'בהתאם לתוכנית'}
            </span>
          </div>
          <div className="plan-row">
            <div className="fact">
              <span>מתוכנן עד היום</span>
              <b>{s.plan.planned.toFixed(1)}%</b>
            </div>
            <div className="fact">
              <span>בוצע בפועל</span>
              <b>{s.total.pct.toFixed(1)}%</b>
            </div>
            <div className="fact">
              <span>משימות בפיגור</span>
              <b className={s.plan.late ? 'danger-text' : ''}>{s.plan.late.toLocaleString()}</b>
              <em>היו צריכות להסתיים לפני יותר משבוע</em>
            </div>
            <div className="plan-worst">
              <span className="muted small">הבניינים עם הפיגור הגדול ביותר</span>
              <div className="chips">
                {s.plan.worst.length === 0 && <span className="muted small">אין</span>}
                {s.plan.worst.map((w) => (
                  <button key={w.id} className="chip stuck" onClick={() => openBuilding(w.id)}>
                    בניין {model.buildingById.get(w.id)?.name} · {w.gap.toFixed(0)}% · {w.n} משימות
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid-2 split">
        <section className="card">
          <div className="card-head">
            <h3>מגרשים ובניינים</h3>
            <button className="btn small" onClick={() => exportApartments(store)}>
              <Icon name="report" size={14} /> סטטוס כל הדירות לאקסל
            </button>
          </div>
          <div className="lots stagger">
            {model.lots.map((lot, li) => {
              const bs = model.buildings.filter((b) => b.lotId === lot.id)
              const lc = countDone(done, bs.flatMap((b) => model.tasksByBuilding.get(b.id) ?? []), date)
              const aptCount = bs.reduce((a, b) => a + b.apts, 0)
              return (
                <div key={lot.id} className="lot" style={{ ['--i' as string]: li }}>
                  <div className="lot-head">
                    <b>{lot.name}</b>
                    <span className="muted small">
                      {bs.length} בניינים · {aptCount} דירות
                    </span>
                    <span className="lot-pct">{lc.pct.toFixed(0)}%</span>
                  </div>
                  {bs.map((b) => {
                    const pb = s.perBuilding.get(b.id)!
                    return (
                      <button key={b.id} className="brow" onClick={() => openBuilding(b.id)}>
                        <span className="brow-name">
                          <b>בניין {b.name}</b>
                          <small>{b.type}</small>
                        </span>
                        <Bar pct={pb.pct} />
                        <span className="brow-pct">{pb.pct.toFixed(0)}%</span>
                        <span className="brow-stage">
                          {pb.stage} · {pb.delivered}/{pb.apts} דירות הושלמו
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <h3>התקדמות לפי מלאכה</h3>
            <div className="trade-list">
              {s.perTrade.map(({ trade, pct, done: d, total }) => (
                <div key={trade.id} className="trade-row">
                  <span className="dot" style={{ background: trade.color }} />
                  <span>{trade.name}</span>
                  <Bar pct={pct} color={trade.color} />
                  <span className="muted num small" style={{ textAlign: 'end' }}>
                    {d}/{total}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h3>פעילות אחרונה</h3>
              <span className="muted small">3 שבועות עד {fmt(date)}</span>
            </div>
            {s.feed.length === 0 ? (
              <div className="empty">
                <Icon name="clock" size={28} />
                אין ביצועים בתקופה הזו
              </div>
            ) : (
              <div className="feed">
                {s.feed.map((g, k) => {
                  const tr = model.tradeById.get(g.trade)!
                  const b = model.buildingById.get(g.b)!
                  return (
                    <div key={k} className="feed-item">
                      {g.by ? <Avatar id={g.by} name={names[g.by]} /> : <span className="avatar" style={{ background: tr.color }}><Icon name="check" size={14} stroke={2.5} /></span>}
                      <span>
                        <b>{tr.name}</b> · בניין {b.name}{' '}
                        {g.n === 1 && g.apt ? (
                          <button className="btn ghost small" style={{ minHeight: 0, padding: '0 4px' }} onClick={() => openApt(g.apt!)}>
                            דירה {model.aptById.get(g.apt)?.number}
                          </button>
                        ) : (
                          <span className="muted">· {g.n} {tr.level === 'floor' ? 'קומות' : 'דירות'}</span>
                        )}
                        {g.by && names[g.by] ? <span className="muted"> · {names[g.by]}</span> : null}
                      </span>
                      <span className="muted small num">{fmt(g.day)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
