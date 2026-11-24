import { useEffect, useState } from 'react'
import { StoreProvider, useStore, type Tab } from './store'
import { Timeline } from './components/Timeline'
import { Icon } from './components/ui'
import { AptDrawer } from './components/AptDrawer'
import { Palette } from './components/Palette'
import { Overview } from './views/Overview'
import { Matrix } from './views/Matrix'
import { Board } from './views/Board'
import { Flowline } from './views/Flowline'
import { Charts } from './views/Charts'
import { Defects } from './views/Defects'
import { Report } from './views/Report'
import { Trades } from './views/Trades'
import { Structure } from './views/Structure'
import { Site3D } from './views/Site3D'
import { Drawings } from './views/Drawings'
import { Contractors } from './views/Contractors'


interface PageDef {
  id: Tab
  label: string
  icon: string
  sub: string
  group: string
  timeline: boolean
}
export const PAGES: PageDef[] = [
  { id: 'overview', label: 'סקירה', icon: 'home', sub: 'תמונת מצב של כל הפרויקט', group: 'מעקב', timeline: true },
  { id: 'site3d', label: 'תלת מימד', icon: 'cube', sub: 'האתר נבנה לפי ציר הזמן', group: 'מעקב', timeline: true },
  { id: 'matrix', label: 'מטריצת ביצוע', icon: 'grid', sub: 'סימון ביצוע לפי קומה ודירה', group: 'מעקב', timeline: true },
  { id: 'board', label: 'לוח עבודה', icon: 'board', sub: 'מה מוכן לביצוע עכשיו, לפי מלאכה', group: 'מעקב', timeline: true },
  { id: 'flowline', label: 'קו זרימה', icon: 'flow', sub: 'התקדמות כל מלאכה בין הקומות לאורך זמן', group: 'ניתוח', timeline: true },
  { id: 'charts', label: 'גרפים', icon: 'chart', sub: 'התקדמות, קצב ותחזית', group: 'ניתוח', timeline: true },
  { id: 'report', label: 'דוח שבועי', icon: 'report', sub: 'מה בוצע השבוע — מוכן לשליחה', group: 'ניתוח', timeline: true },
  { id: 'defects', label: 'ליקויים', icon: 'alert', sub: 'ליקויים פתוחים וסגורים לפי דירה', group: 'איכות ומסמכים', timeline: false },
  { id: 'drawings', label: 'תוכניות', icon: 'layers', sub: 'חזיתות, חתכים ותוכניות לכל מגרש', group: 'איכות ומסמכים', timeline: false },
  { id: 'contractors', label: 'קבלנים ותקציב', icon: 'users', sub: 'קבלנים לפי מקצוע, חוזים, חשבונות חודשיים ויתרה', group: 'ניהול', timeline: true },
  { id: 'trades', label: 'מלאכות', icon: 'tools', sub: 'רשימת המלאכות וסדר הביצוע', group: 'הגדרות', timeline: false },
  { id: 'structure', label: 'מבנה הפרויקט', icon: 'building', sub: 'מגרשים, בניינים וחלוקת דירות לקומות', group: 'הגדרות', timeline: false },
]
const MOBILE: Tab[] = ['overview', 'site3d', 'matrix', 'board']

const SYNC_LABEL: Record<string, string> = {
  local: 'שמור בדפדפן',
  connecting: 'מתחבר…',
  live: 'מסונכרן',
  saving: 'שומר…',
  offline: 'אין חיבור',
  readonly: 'צפייה בלבד',
}

function Shell() {
  const s = useStore()
  const { tab, setTab, data, pending, closeAsk, toasts, dismissToast, status, defects, aptOpen, loaded, hasProject } = s
  const [palette, setPalette] = useState(false)
  const [more, setMore] = useState(false)
  const page = PAGES.find((p) => p.id === tab)!
  const openDefects = defects.filter((d) => d.status === 'open').length

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette(true)
      } else if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea, select')) {
        e.preventDefault()
        setPalette(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    document.title = `${data.projectName} · ${page.label}`
  }, [data.projectName, page.label])

  const go = (t: Tab) => {
    setTab(t)
    setMore(false)
    window.scrollTo({ top: 0 })
  }

  let groupSeen = ''
  return (
    <div className="app">
      <aside className="side" aria-label="ניווט">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="crane" size={20} stroke={2} />
          </span>
          <div className="brand-text">
            <b>{data.projectName}</b>
            <span>
              {data.buildings.length} בניינים · {data.buildings.reduce((a, b) => a + b.apts, 0)} דירות
            </span>
          </div>
        </div>
        {PAGES.map((p) => {
          const head = p.group !== groupSeen ? (groupSeen = p.group) : null
          return (
            <div key={p.id}>
              {head && <div className="nav-group">{head}</div>}
              <button className={`nav-btn${tab === p.id ? ' on' : ''}`} onClick={() => go(p.id)} aria-current={tab === p.id ? 'page' : undefined}>
                <Icon name={p.icon} />
                {p.label}
                {p.id === 'defects' && openDefects > 0 && <span className="badge">{openDefects}</span>}
              </button>
            </div>
          )
        })}
        <div className="side-foot">
          <button className="btn small" onClick={() => setPalette(true)}>
            <Icon name="search" size={14} /> חיפוש מהיר · Ctrl+K
          </button>
          <span>רווח = נגן · חצים = צעד בזמן</span>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-row">
            <h1 className="page-title">
              {page.label}
              <small>{page.sub}</small>
            </h1>
            <div className="top-actions">
              <button className="search-btn" onClick={() => setPalette(true)} aria-label="חיפוש">
                <Icon name="search" size={16} />
                <span className="search-label">חיפוש בניין, דירה, מלאכה…</span>
                <kbd>Ctrl K</kbd>
              </button>
              <span className={`sync ${status}`} title={SYNC_LABEL[status]}>
                <i />
                <span className="sync-label">{SYNC_LABEL[status]}</span>
              </span>
            </div>
          </div>
          {page.timeline && hasProject && loaded && <Timeline />}
        </header>

        <main className="content">
          {!loaded ? (
            <div className="splash">
              <div>
                <Icon name="refresh" size={28} />
                <p>טוען את נתוני הפרויקט…</p>
              </div>
            </div>
          ) : !hasProject ? (
            <Onboarding />
          ) : (
            <div className="page" key={tab}>
              {tab === 'overview' && <Overview />}
              {tab === 'site3d' && <Site3D />}
              {tab === 'matrix' && <Matrix />}
              {tab === 'board' && <Board />}
              {tab === 'flowline' && <Flowline />}
              {tab === 'charts' && <Charts />}
              {tab === 'report' && <Report />}
              {tab === 'defects' && <Defects />}
              {tab === 'drawings' && <Drawings />}
              {tab === 'contractors' && <Contractors />}
              {tab === 'trades' && <Trades />}
              {tab === 'structure' && <Structure />}
            </div>
          )}
        </main>
      </div>

      <nav className="tabbar" aria-label="ניווט ראשי">
        {MOBILE.map((id) => {
          const p = PAGES.find((x) => x.id === id)!
          return (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
              <Icon name={p.icon} size={20} />
              {p.label === 'מטריצת ביצוע' ? 'מטריצה' : p.label}
            </button>
          )
        })}
        <button className={!MOBILE.includes(tab) || more ? 'on' : ''} onClick={() => setMore(!more)}>
          <Icon name="more" size={20} />
          עוד
        </button>
      </nav>
      {more && (
        <>
          <div className="drawer-back" style={{ zIndex: 94 }} onClick={() => setMore(false)} />
          <div className="more-sheet">
            {PAGES.filter((p) => !MOBILE.includes(p.id)).map((p) => (
              <button key={p.id} onClick={() => go(p.id)}>
                <Icon name={p.icon} size={22} />
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}

      {aptOpen && <AptDrawer />}
      {palette && <Palette onClose={() => setPalette(false)} />}

      {pending && (
        <div className="modal-back" onClick={closeAsk}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{pending.msg}</h3>
            <div className="modal-actions">
              <button
                className="btn danger"
                autoFocus
                onClick={() => {
                  pending.onYes()
                  closeAsk()
                }}
              >
                כן, המשך
              </button>
              <button className="btn" onClick={closeAsk}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind ?? ''}`}>
            {t.kind === 'ok' && <Icon name="check" size={16} />}
            <span>{t.text}</span>
            {t.undo && (
              <button
                className="tbtn"
                onClick={() => {
                  t.undo!()
                  dismissToast(t.id)
                }}
              >
                <Icon name="undo" size={14} /> בטל
              </button>
            )}
            <button className="tbtn" onClick={() => dismissToast(t.id)} aria-label="סגור">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Onboarding() {
  const { createProject, canWrite } = useStore()
  return (
    <div className="page">
      <div className="card empty" style={{ padding: '56px 20px' }}>
        <Icon name="building" size={44} />
        <h2>עדיין לא הוגדר פרויקט</h2>
        <p style={{ maxWidth: 460 }}>
          אפשר להתחיל מפריסת פרויקט עכו 590 (7 מגרשים, 30 בניינים, 590 דירות) ולערוך אחר כך במסך מבנה הפרויקט, או לייבא
          פריסה מ־Excel.
        </p>
        {canWrite ? (
          <button className="btn primary" onClick={createProject}>
            <Icon name="plus" size={16} /> צור את הפרויקט
          </button>
        ) : (
          <p className="small">רק מי שיש לו הרשאת עריכה יכול ליצור את הפרויקט.</p>
        )}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
