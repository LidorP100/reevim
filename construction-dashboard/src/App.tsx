import { StoreProvider, useStore, type Tab } from './store'
import { Timeline } from './components/Timeline'
import { Overview } from './views/Overview'
import { Site3D } from './views/Site3D'
import { Matrix } from './views/Matrix'
import { Charts } from './views/Charts'
import { Trades } from './views/Trades'
import { Structure } from './views/Structure'

const TABS: [Tab, string][] = [
  ['overview', 'סקירה'],
  ['site3d', 'תלת מימד'],
  ['matrix', 'מטריצת ביצוע'],
  ['charts', 'גרפים'],
  ['trades', 'מלאכות'],
  ['structure', 'מבנה הפרויקט'],
]

function Shell() {
  const { tab, setTab, data, update, pending, closeAsk } = useStore()
  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">▦</span>
          <input
            className="project-name"
            value={data.projectName}
            onChange={(e) => update((d) => ({ ...d, projectName: e.target.value }))}
            aria-label="שם הפרויקט"
          />
        </div>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <Timeline />
      <main>
        {tab === 'overview' && <Overview />}
        {tab === 'site3d' && <Site3D />}
        {tab === 'matrix' && <Matrix />}
        {tab === 'charts' && <Charts />}
        {tab === 'trades' && <Trades />}
        {tab === 'structure' && <Structure />}
      </main>
      {pending && (
        <div className="modal-back" onClick={closeAsk}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{pending.msg}</h3>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button
                className="btn danger"
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
