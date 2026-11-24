import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '../store'
import { countDone, floorUnit, isDone, lerpColor, pctColor, taskIdOf, tasksForApt, type Model } from '../engine'
import { fmt } from '../date'
import { ScopePicker } from '../components/ScopePicker'
import type { Building } from '../types'

const APT_W = 7
const APT_D = 11
const CORE_W = 4
const FLOOR_H = 3.1
const SLAB_H = 0.35
const GAP_B = 12
const GAP_LOT = 22

type Mode = 'real' | 'status' | 'trade'

interface Placed {
  b: Building
  x: number
  z: number
  w: number
}
interface LotPlate {
  id: string
  name: string
  x: number
  z: number
  w: number
  d: number
}

function layout(model: Model) {
  const placed: Placed[] = []
  const plates: LotPlate[] = []
  const LOTS_PER_ROW = 4
  let cx = 0
  let rowZ = 0
  let rowDepth = 0
  model.lots.forEach((lot, li) => {
    if (li > 0 && li % LOTS_PER_ROW === 0) {
      cx = 0
      rowZ += rowDepth + GAP_LOT
      rowDepth = 0
    }
    const bs = model.buildings.filter((b) => b.lotId === lot.id)
    const cols = Math.max(1, Math.ceil(bs.length / 2))
    const rows = bs.length > 1 ? 2 : 1
    const cellW = Math.max(...bs.map((b) => b.aptsPerFloor * APT_W + CORE_W), 10) + GAP_B
    const cellD = APT_D + GAP_B
    const w = cols * cellW + 6
    const d = rows * cellD + 6
    plates.push({ id: lot.id, name: lot.name, x: cx + w / 2, z: rowZ + d / 2, w, d })
    bs.forEach((b, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      const bw = b.aptsPerFloor * APT_W + CORE_W
      placed.push({ b, x: cx + 3 + c * cellW + cellW / 2, z: rowZ + 3 + r * cellD + cellD / 2, w: bw })
    })
    cx += w + GAP_LOT
    rowDepth = Math.max(rowDepth, d)
  })
  // מרכוז סביב 0
  const maxX = Math.max(...plates.map((p) => p.x + p.w / 2), 1)
  const maxZ = Math.max(...plates.map((p) => p.z + p.d / 2), 1)
  placed.forEach((p) => {
    p.x -= maxX / 2
    p.z -= maxZ / 2
  })
  plates.forEach((p) => {
    p.x -= maxX / 2
    p.z -= maxZ / 2
  })
  return { placed, plates, size: Math.max(maxX, maxZ) }
}

const box = new THREE.BoxGeometry(1, 1, 1)
const plane = new THREE.PlaneGeometry(1, 1)

const CONCRETE = '#a7abb0'
const BLOCKS = '#cdbfae'
const FINISHED = '#f4f1ea'
const GHOST = '#dfe4ea'

function FocusController({ target, size }: { target: THREE.Vector3 | null; size: number }) {
  const { camera, controls } = useThree()
  const first = useRef(true)
  useEffect(() => {
    const c = controls as unknown as OrbitControlsImpl | null
    if (!c) return
    if (target) {
      c.target.copy(target)
      camera.position.set(target.x - 45, target.y + 40, target.z + 55)
    } else if (!first.current || camera.position.length() < 1) {
      c.target.set(0, 0, 0)
      camera.position.set(-size * 0.45, size * 0.45, size * 0.6)
    }
    first.current = false
    c.update()
  }, [target, size, camera, controls])
  return null
}

export function Site3D() {
  const { model, done, date, sel, setSel, setTab } = useStore()
  const [mode, setMode] = useState<Mode>('real')
  const [tradeId, setTradeId] = useState(model.trades[0]?.id ?? '')
  const [hover, setHover] = useState<string | null>(null)
  const [cut, setCut] = useState<number>(99) // הסתרת קומות מעל
  const { placed, plates, size } = useMemo(() => layout(model), [model])

  const visible = placed.filter((p) => !sel.lotId || p.b.lotId === sel.lotId)

  const aptTradeIds = useMemo(() => model.trades.filter((t) => t.level === 'apt').map((t) => t.id), [model])

  // מצב כל דירה ורצפה בתאריך הנבחר
  const state = useMemo(() => {
    const has = (tid: string, unit: string) => isDone(done, taskIdOf(tid, unit), date)
    const tr = model.tradeById.get(tradeId)
    const floors = new Map<string, { slab: boolean; walls: boolean; blocks: boolean; trade: boolean }>()
    const apts = new Map<string, { show: boolean; color: string; opacity: number; windows: boolean }>()
    for (const p of placed) {
      const b = p.b
      for (let f = 0; f < b.floors; f++) {
        const fu = floorUnit(b.id, f)
        const fs = { slab: has('slab', fu), walls: has('walls', fu), blocks: has('blocks', fu), trade: false }
        if (tr?.level === 'floor') fs.trade = has(tr.id, fu)
        floors.set(fu, fs)
        for (const a of model.aptsByBuilding.get(b.id) ?? []) {
          if (a.floor !== f) continue
          let color = GHOST
          let show = true
          let opacity = 1
          const windows = mode === 'real' && has('alu', a.id)
          if (mode === 'real') {
            if (!fs.walls) show = false
            else {
              const fin = aptTradeIds.length ? aptTradeIds.filter((t) => has(t, a.id)).length / aptTradeIds.length : 0
              color = fin > 0 ? lerpColor(BLOCKS, FINISHED, fin) : fs.blocks ? BLOCKS : CONCRETE
              if (has('handover', a.id)) color = '#e9f3ea'
            }
          } else if (mode === 'status') {
            const c = countDone(done, tasksForApt(model, a.id), date)
            color = pctColor(c.pct)
            if (c.done === 0) opacity = 0.35
          } else if (tr) {
            const ok = tr.level === 'floor' ? fs.trade : has(tr.id, a.id)
            color = ok ? tr.color : GHOST
            if (!ok) opacity = 0.3
          }
          apts.set(a.id, { show, color, opacity, windows })
        }
      }
    }
    return { floors, apts }
  }, [model, done, date, placed, mode, tradeId, aptTradeIds])

  const focus = useMemo(() => {
    const p = placed.find((x) => x.b.id === sel.buildingId)
    if (p) return new THREE.Vector3(p.x, (p.b.floors * FLOOR_H) / 2, p.z)
    if (sel.lotId) {
      const pl = plates.find((x) => x.id === sel.lotId)
      if (pl) return new THREE.Vector3(pl.x, 0, pl.z)
    }
    return null
  }, [placed, plates, sel.buildingId, sel.lotId])

  const selApt = sel.aptId ? model.aptById.get(sel.aptId) : undefined
  const selB = sel.buildingId ? model.buildingById.get(sel.buildingId) : undefined
  const hoverApt = hover ? model.aptById.get(hover) : undefined

  const pick = (aptId: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const a = model.aptById.get(aptId)!
    const b = model.buildingById.get(a.buildingId)!
    setSel({ lotId: sel.lotId ? b.lotId : null, buildingId: b.id, aptId })
  }

  return (
    <div className="view view-3d">
      <div className="toolbar">
        <ScopePicker withApt />
        <div className="seg">
          {(
            [
              ['real', 'מציאותי'],
              ['status', 'סטטוס דירה'],
              ['trade', 'לפי מלאכה'],
            ] as [Mode, string][]
          ).map(([m, l]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {l}
            </button>
          ))}
        </div>
        {mode === 'trade' && (
          <select value={tradeId} onChange={(e) => setTradeId(e.target.value)}>
            {model.trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {selB && (
          <label className="cut">
            חתך עד קומה
            <input type="range" min={0} max={selB.floors - 1} value={Math.min(cut, selB.floors - 1)} onChange={(e) => setCut(+e.target.value)} />
            <span>{Math.min(cut, selB.floors - 1)}</span>
          </label>
        )}
      </div>

      <div className="scene card">
        <Canvas shadows camera={{ fov: 40, near: 1, far: 5000, position: [-size * 0.45, size * 0.45, size * 0.6] }} onPointerMissed={() => setSel({ aptId: null })}>
          <color attach="background" args={['#eef1f5']} />
          <hemisphereLight args={['#ffffff', '#b8c2cc', 0.9]} />
          <directionalLight
            position={[-size * 0.4, size * 0.7, size * 0.3]}
            intensity={1.6}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-size * 0.7}
            shadow-camera-right={size * 0.7}
            shadow-camera-top={size * 0.7}
            shadow-camera-bottom={-size * 0.7}
            shadow-camera-far={size * 3}
          />
          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
          <FocusController target={focus} size={size} />

          <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow geometry={plane} scale={[size * 3, size * 3, 1]}>
            <meshStandardMaterial color="#dfe3e0" />
          </mesh>

          {plates
            .filter((pl) => !sel.lotId || pl.id === sel.lotId)
            .map((pl) => (
              <group key={pl.id}>
                <mesh position={[pl.x, 0.05, pl.z]} geometry={box} scale={[pl.w, 0.1, pl.d]} receiveShadow onClick={(e) => { e.stopPropagation(); setSel({ lotId: pl.id, buildingId: null, aptId: null }) }}>
                  <meshStandardMaterial color={sel.lotId === pl.id ? '#b9d49a' : '#c7d8b4'} />
                </mesh>
                <Html position={[pl.x, 0.2, pl.z + pl.d / 2 + 4]} center className="lbl3d lot">
                  {pl.name}
                </Html>
              </group>
            ))}

          {visible.map(({ b, x, z, w }) => {
            const isSel = sel.buildingId === b.id
            const maxF = isSel ? Math.min(cut, b.floors - 1) : b.floors - 1
            const apts = model.aptsByBuilding.get(b.id) ?? []
            const left = -w / 2
            const topWalls = state.floors.get(floorUnit(b.id, b.floors - 1))?.walls
            return (
              <group key={b.id} position={[x, 0.1, z]}>
                {/* מעטפת מתוכננת (רפאים) */}
                <mesh geometry={box} position={[0, (b.floors * FLOOR_H) / 2, 0]} scale={[w, b.floors * FLOOR_H, APT_D]} raycast={() => null}>
                  <meshBasicMaterial transparent opacity={0.04} color="#5b6b7d" depthWrite={false} />
                  <Edges color={isSel ? '#1f6feb' : '#9aa6b2'} lineWidth={isSel ? 2 : 1} />
                </mesh>
                <Html position={[0, b.floors * FLOOR_H + 3, 0]} center className={`lbl3d${isSel ? ' sel' : ''}`}>
                  {b.name}
                </Html>

                {Array.from({ length: maxF + 1 }, (_, f) => {
                  const fs = state.floors.get(floorUnit(b.id, f))!
                  const y = f * FLOOR_H
                  return (
                    <group key={f}>
                      {(fs.slab || mode !== 'real') && (
                        <mesh geometry={box} position={[0, y + SLAB_H / 2, 0]} scale={[w + 0.6, SLAB_H, APT_D + 0.6]} castShadow receiveShadow>
                          <meshStandardMaterial
                            color={mode === 'trade' && model.tradeById.get(tradeId)?.level === 'floor' ? (fs.trade ? model.tradeById.get(tradeId)!.color : GHOST) : fs.slab ? '#9a9ea4' : GHOST}
                            transparent={!fs.slab}
                            opacity={fs.slab ? 1 : 0.4}
                          />
                        </mesh>
                      )}
                      {(fs.walls || mode !== 'real') && (
                        <mesh geometry={box} position={[w / 2 - CORE_W / 2, y + FLOOR_H / 2 + SLAB_H / 2, 0]} scale={[CORE_W - 0.4, FLOOR_H - SLAB_H, APT_D - 2]} castShadow>
                          <meshStandardMaterial color={fs.walls ? '#8f949a' : GHOST} transparent={!fs.walls} opacity={fs.walls ? 1 : 0.3} />
                        </mesh>
                      )}
                      {apts
                        .filter((a) => a.floor === f)
                        .map((a) => {
                          const s = state.apts.get(a.id)!
                          if (!s.show) return null
                          const ax = left + a.idx * APT_W + APT_W / 2
                          const selected = sel.aptId === a.id
                          const hovered = hover === a.id
                          return (
                            <group key={a.id} position={[ax, y + SLAB_H + (FLOOR_H - SLAB_H) / 2, 0]}>
                              <mesh
                                geometry={box}
                                scale={[APT_W - 0.25, FLOOR_H - SLAB_H, APT_D - 0.2]}
                                castShadow
                                receiveShadow
                                onClick={pick(a.id)}
                                onPointerOver={(e) => {
                                  e.stopPropagation()
                                  setHover(a.id)
                                }}
                                onPointerOut={() => setHover((h) => (h === a.id ? null : h))}
                              >
                                <meshStandardMaterial
                                  color={selected ? '#1f6feb' : s.color}
                                  emissive={hovered ? '#335' : '#000'}
                                  transparent={s.opacity < 1}
                                  opacity={s.opacity}
                                />
                              </mesh>
                              {s.windows && (
                                <>
                                  <mesh geometry={plane} position={[0, 0.1, APT_D / 2 - 0.08]} scale={[APT_W * 0.62, 1.5, 1]}>
                                    <meshStandardMaterial color="#35506e" metalness={0.3} roughness={0.3} />
                                  </mesh>
                                  <mesh geometry={plane} position={[0, 0.1, -APT_D / 2 + 0.08]} rotation-y={Math.PI} scale={[APT_W * 0.62, 1.5, 1]}>
                                    <meshStandardMaterial color="#35506e" metalness={0.3} roughness={0.3} />
                                  </mesh>
                                </>
                              )}
                            </group>
                          )
                        })}
                    </group>
                  )
                })}
                {mode === 'real' && topWalls && maxF === b.floors - 1 && (
                  <mesh geometry={box} position={[0, b.floors * FLOOR_H + SLAB_H / 2, 0]} scale={[w + 0.6, SLAB_H, APT_D + 0.6]} castShadow>
                    <meshStandardMaterial color="#b4b8bd" />
                  </mesh>
                )}
              </group>
            )
          })}

          {hoverApt &&
            (() => {
              const p = placed.find((x) => x.b.id === hoverApt.buildingId)
              if (!p) return null
              const ax = p.x - p.w / 2 + hoverApt.idx * APT_W + APT_W / 2
              return (
                <Html position={[ax, hoverApt.floor * FLOOR_H + FLOOR_H + 1, p.z]} center className="lbl3d tip">
                  בניין {p.b.name} · דירה {hoverApt.number} · קומה {hoverApt.floor}
                </Html>
              )
            })()}
        </Canvas>

        <div className="legend">
          {mode === 'real' && (
            <>
              <span><i style={{ background: '#9a9ea4' }} />שלד / יציקה</span>
              <span><i style={{ background: BLOCKS }} />בלוקים</span>
              <span><i style={{ background: FINISHED }} />גמרים</span>
              <span><i style={{ background: '#35506e' }} />אלומיניום</span>
              <span><i style={{ background: '#e9f3ea' }} />נמסר</span>
            </>
          )}
          {mode === 'status' && (
            <>
              <span><i style={{ background: pctColor(0) }} />לא התחיל</span>
              <span><i style={{ background: pctColor(30) }} />בתהליך</span>
              <span><i style={{ background: pctColor(80) }} />מתקדם</span>
              <span><i style={{ background: pctColor(100) }} />הושלם</span>
            </>
          )}
          {mode === 'trade' && (
            <>
              <span><i style={{ background: model.tradeById.get(tradeId)?.color }} />בוצע</span>
              <span><i style={{ background: GHOST }} />לא בוצע</span>
            </>
          )}
          <span className="muted">· {fmt(date)}</span>
        </div>

        {selApt && (
          <div className="apt-panel">
            <div className="apt-panel-head">
              <b>
                דירה {selApt.number} · בניין {model.buildingById.get(selApt.buildingId)?.name} · קומה {selApt.floor}
              </b>
              <button className="x" onClick={() => setSel({ aptId: null })}>
                ×
              </button>
            </div>
            <ul>
              {tasksForApt(model, selApt.id).map((t) => {
                const tr = model.tradeById.get(t.tradeId)!
                const ok = isDone(done, t.id, date)
                return (
                  <li key={t.id} className={ok ? 'ok' : ''}>
                    <span className="dot" style={{ background: tr.color }} />
                    {tr.name}
                    <span className="muted">{ok ? `✓ ${fmt(done.get(t.id)!)}` : '—'}</span>
                  </li>
                )
              })}
            </ul>
            <button className="btn" onClick={() => setTab('matrix')}>
              עדכון במטריצה
            </button>
          </div>
        )}
      </div>
      <p className="muted small">
        גרירה לסיבוב · גלגלת לזום · קליק ימני להזזה · לחיצה על מגרש / דירה לבחירה. הפעל ▶ בציר הזמן כדי לראות את
        הבניין נבנה.
      </p>
    </div>
  )
}
