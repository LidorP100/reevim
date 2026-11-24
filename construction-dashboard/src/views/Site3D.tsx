import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, OrbitControls, Sky, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { aptsPerFloor, countDone, floorLabel, floorUnit, isDone, lerpColor, pctColor, taskIdOf, tasksForApt, type Model } from '../engine'
import { elevOf, PLAN_BUILDINGS, PLAN_CENTER, PLAN_LOTS, PLAN_SCALE } from '../sample'
import { loadIfc, type ParsedIfc } from '../ifc'
import { fmt } from '../date'
import { ScopePicker } from '../components/ScopePicker'
import { Icon } from '../components/ui'
import type { Building } from '../types'

// ---------- מידות (מטרים) ----------
const APT_W = 8
const APT_D = 9
const CORE_W = 4.5
const FLOOR_H = 3.06 // לפי החתכים: 2.71 נטו + תקרה
const SLAB_H = 0.32

type Mode = 'viz' | 'status' | 'trade'
type TimeOfDay = 'day' | 'sunset' | 'night'

interface Placed {
  b: Building
  x: number
  z: number
  w: number
  d: number
  cols: number
  perFloor: number[]
  y: number // גובה הבסיס (לפי מפלס ±0.00)
}
interface LotPlate {
  id: string
  name: string
  rects: { x: number; z: number; w: number; d: number }[]
  label: [number, number]
  y: number // גובה המשטח של המגרש
}

const px = (x: number, y: number): [number, number] => [(x - PLAN_CENTER.x) * PLAN_SCALE, (y - PLAN_CENTER.y) * PLAN_SCALE]

function layout(model: Model) {
  const placed: Placed[] = []
  const plates: LotPlate[] = []
  let extraX = ((900 - PLAN_CENTER.x) * PLAN_SCALE) | 0
  for (const lot of model.lots) {
    const bs = model.buildings.filter((b) => b.lotId === lot.id)
    const planRects = PLAN_LOTS[lot.name]
    let rects: LotPlate['rects'] = []
    if (planRects) {
      rects = planRects.map(([x1, y1, x2, y2]) => {
        const [a, c] = px(x1, y1)
        const [e, f] = px(x2, y2)
        return { x: (a + e) / 2, z: (c + f) / 2, w: e - a, d: f - c }
      })
    }
    const autoBs: Building[] = []
    for (const b of bs) {
      const perFloor = aptsPerFloor(b)
      const n = Math.max(...perFloor, 1)
      const cols = n <= 2 ? n : Math.ceil(n / 2)
      const w = cols * APT_W + CORE_W
      const d = n <= 2 ? APT_D + 1 : APT_D * 2 + 2.4
      const p = PLAN_BUILDINGS[b.name]
      if (p && planRects) {
        const [x, z] = px(p[0], p[1])
        placed.push({ b, x, z, w, d, cols, perFloor, y: 0 })
      } else autoBs.push(b)
    }
    if (autoBs.length) {
      // בניין שלא מופיע בתשריט: מוצב בטור בצד המזרחי
      const startX = extraX + 20
      let z = -60
      for (const b of autoBs) {
        const perFloor = aptsPerFloor(b)
        const n = Math.max(...perFloor, 1)
        const cols = n <= 2 ? n : Math.ceil(n / 2)
        const w = cols * APT_W + CORE_W
        const d = n <= 2 ? APT_D + 1 : APT_D * 2 + 2.4
        placed.push({ b, x: startX + w / 2, z, w, d, cols, perFloor, y: 0 })
        z += d + 14
      }
      if (!planRects) rects = [{ x: startX + 15, z: -60 + (z + 60) / 2 - 14, w: 50, d: z + 60 + 4 }]
      extraX += 60
    }
    if (rects.length) {
      const r = rects[0]
      plates.push({ id: lot.id, name: lot.name, rects, label: [r.x, r.z - r.d / 2 - 4], y: 0 })
    }
  }
  // טופוגרפיה: הבסיס של כל בניין לפי מפלס ±0.00, ומשטח כל מגרש בגובה הממוצע של הבניינים שלו
  const elevs = placed.map((p) => elevOf(p.b)).filter((e): e is number => typeof e === 'number')
  const base = elevs.length ? Math.min(...elevs) - 0.6 : 0
  for (const p of placed) {
    const e = elevOf(p.b)
    p.y = typeof e === 'number' ? e - base : 0.6
  }
  for (const pl of plates) {
    const ys = placed.filter((p) => p.b.lotId === pl.id).map((p) => p.y)
    pl.y = ys.length ? Math.min(...ys) - 0.15 : 0.3
  }
  let maxR = 60
  for (const p of placed) maxR = Math.max(maxR, Math.hypot(p.x, p.z) + 20)
  return { placed, plates, size: maxR * 2 }
}

/** מיקום דירה בתוך הקומה: שורה קדמית (דרום) ואחורית (צפון), חדר מדרגות בקצה */
function aptLocal(p: Placed, idx: number, nOnFloor: number) {
  const twoRows = Math.max(...p.perFloor) > 2
  const frontCount = twoRows ? Math.ceil(nOnFloor / 2) : nOnFloor
  const row = idx < frontCount ? 0 : 1
  const col = row === 0 ? idx : idx - frontCount
  const x = -p.w / 2 + col * APT_W + APT_W / 2
  const z = twoRows ? (row === 0 ? APT_D / 2 + 1.2 : -(APT_D / 2 + 1.2)) : 0
  return { x, z, face: row === 0 ? 1 : -1 }
}

const box = new THREE.BoxGeometry(1, 1, 1)
/** טקסטורת אבן עם פסים אופקיים, כמו בחזיתות */
let stoneTex: THREE.Texture | null = null
function stone() {
  if (stoneTex) return stoneTex
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = 'rgba(0,0,0,0.13)'
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 1.5)
  g.fillStyle = 'rgba(0,0,0,0.05)'
  for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 0 : 24; x < 64; x += 48) g.fillRect(x, y, 1.2, 16)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 2)
  t.colorSpace = THREE.SRGBColorSpace
  return (stoneTex = t)
}
const plane = new THREE.PlaneGeometry(1, 1)
const crownGeo = new THREE.IcosahedronGeometry(0.5, 1)
const bulbGeo = new THREE.SphereGeometry(0.5, 10, 8)

// ---------- פלטות צבע ----------
const C = {
  concrete: '#9fa4aa',
  blocks: '#cbc3b7',
  white: '#f3f1ec',
  delivered: '#fbfaf6',
  ghost: '#d8dee5',
  balcony: '#2c3035',
  frame: '#1b1d20',
  grayStone: '#a9adb1',
  pentStone: '#7e8287',
  glass: '#86a9c2',
  glassDay: '#3d5670',
  opening: '#26292d',
  lit: '#ffc978',
  slab: '#8e949b',
  grass: '#6e8f4f',
  paving: '#d6d0c3',
  asphalt: '#3b3f44',
  water: '#2b6a8a',
  path: '#d9c9a5',
}

function Grow({ children, from = 0 }: { children: ReactNode; from?: number }) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(from)
  useFrame((_, dt) => {
    if (!ref.current || t.current >= 1) return
    t.current = Math.min(1, t.current + dt * 2.6)
    const e = 1 - Math.pow(1 - t.current, 3)
    ref.current.scale.y = Math.max(0.001, e)
  })
  return (
    <group ref={ref} scale={[1, from || 0.001, 1]}>
      {children}
    </group>
  )
}

/** טיסת מצלמה חלקה למטרה + עדכון מצפן */
function CameraRig({ goal, compassRef }: { goal: { target: THREE.Vector3; pos: THREE.Vector3; key: string } | null; compassRef: React.RefObject<HTMLDivElement | null> }) {
  const { camera, controls } = useThree()
  const flying = useRef(false)
  useEffect(() => {
    if (!goal) return
    flying.current = true
    const c = controls as unknown as { addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void } | null
    const stop = () => (flying.current = false)
    c?.addEventListener('start', stop)
    return () => c?.removeEventListener('start', stop)
  }, [goal, controls])
  useFrame((_, dt) => {
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (c && goal && flying.current) {
      const k = 1 - Math.exp(-dt * 3.2)
      camera.position.lerp(goal.pos, k)
      c.target.lerp(goal.target, k)
      c.update()
      if (camera.position.distanceTo(goal.pos) < 0.3 && c.target.distanceTo(goal.target) < 0.3) flying.current = false
    }
    if (compassRef.current && c) {
      const a = Math.atan2(camera.position.x - c.target.x, camera.position.z - c.target.z)
      compassRef.current.style.transform = `rotate(${(a * 180) / Math.PI}deg)`
    }
  })
  return null
}

function Atmosphere({ tod, size, mode }: { tod: TimeOfDay; size: number; mode: Mode }) {
  const viz = mode === 'viz'
  const sun: [number, number, number] =
    tod === 'day' ? [-size * 0.3, size * 0.9, size * 0.4] : tod === 'sunset' ? [-size * 0.85, size * 0.22, size * 0.45] : [size * 0.5, size * 0.4, -size * 0.6]
  const fog = tod === 'day' ? '#cfdbe6' : tod === 'sunset' ? '#d9a98f' : '#0d1626'
  return (
    <>
      {viz && tod !== 'night' && <Sky distance={4500} sunPosition={sun} turbidity={tod === 'sunset' ? 9 : 4} rayleigh={tod === 'sunset' ? 3.2 : 1.2} mieCoefficient={0.008} mieDirectionalG={0.9} />}
      {viz && tod === 'night' && (
        <>
          <color attach="background" args={['#070c16']} />
          <Stars radius={size * 3} depth={60} count={2500} factor={5} fade />
        </>
      )}
      {!viz && <color attach="background" args={[tod === 'night' ? '#0f151d' : '#e9eef3']} />}
      {viz && <fog attach="fog" args={[fog, size * 0.9, size * 3.2]} />}
      <hemisphereLight args={[tod === 'night' ? '#30406a' : tod === 'sunset' ? '#ffe6d2' : '#ffffff', tod === 'night' ? '#0b0f18' : '#8a8f7a', tod === 'night' ? 0.4 : tod === 'sunset' ? 1.15 : 1.1]} />
      <ambientLight intensity={tod === 'night' ? 0.12 : 0.22} />
      <directionalLight
        position={sun}
        intensity={tod === 'night' ? 0.25 : tod === 'sunset' ? 2.3 : 2.2}
        color={tod === 'sunset' ? '#ffcda0' : tod === 'night' ? '#8ea6ff' : '#ffffff'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size * 0.6}
        shadow-camera-right={size * 0.6}
        shadow-camera-top={size * 0.6}
        shadow-camera-bottom={-size * 0.6}
        shadow-camera-far={size * 4}
        shadow-bias={-0.0004}
      />
    </>
  )
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** נוף: דשא, כבישים, פארק עם נחל, שבילים, עצים ופנסים */
const Landscape = memo(function Landscape({ plates, placed, size, tod, mode }: { plates: LotPlate[]; placed: Placed[]; size: number; tod: TimeOfDay; mode: Mode }) {
  const viz = mode === 'viz'
  const lightsOn = tod !== 'day'
  const streamPts = useMemo(
    () => [
      [690, 230],
      [760, 420],
      [700, 620],
      [790, 830],
      [725, 1040],
      [810, 1240],
    ].map(([x, y]) => {
      const [a, b] = px(x, y)
      return new THREE.Vector3(a, 0, b)
    }),
    [],
  )
  const ribbon = (offset: number, width: number) => {
    const curve = new THREE.CatmullRomCurve3(streamPts)
    const pts = curve.getSpacedPoints(120)
    const pos: number[] = []
    const idx: number[] = []
    pts.forEach((p, i) => {
      const t = curve.getTangentAt(i / (pts.length - 1))
      const n = new THREE.Vector3(-t.z, 0, t.x).normalize()
      const c = p.clone().addScaledVector(n, offset)
      pos.push(c.x + n.x * width / 2, 0, c.z + n.z * width / 2, c.x - n.x * width / 2, 0, c.z - n.z * width / 2)
      if (i < pts.length - 1) {
        const k = i * 2
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return { g, curve }
  }
  const water = useMemo(() => ribbon(0, 10), []) // eslint-disable-line react-hooks/exhaustive-deps
  const path = useMemo(() => ribbon(-15, 3.2), []) // eslint-disable-line react-hooks/exhaustive-deps

  // עצים: לאורך גבולות המגרשים, בפארק, ולאורך הנחל — בלי להתנגש בבניינים
  const trees = useMemo(() => {
    const r = rng(42)
    const out: [number, number, number][] = []
    const free = (x: number, z: number) => placed.every((p) => Math.abs(x - p.x) > p.w / 2 + 3 || Math.abs(z - p.z) > p.d / 2 + 3)
    for (const pl of plates)
      for (const rc of pl.rects) {
        const step = 9
        for (let s = 0; s < rc.w; s += step) {
          for (const zz of [rc.z - rc.d / 2 + 2, rc.z + rc.d / 2 - 2]) {
            const x = rc.x - rc.w / 2 + s + r() * 3
            if (free(x, zz)) out.push([x, zz, 0.8 + r() * 0.6])
          }
        }
        for (let s = 0; s < rc.d; s += step) {
          for (const xx of [rc.x - rc.w / 2 + 2, rc.x + rc.w / 2 - 2]) {
            const z = rc.z - rc.d / 2 + s + r() * 3
            if (free(xx, z)) out.push([xx, z, 0.8 + r() * 0.6])
          }
        }
      }
    const pts = water.curve.getSpacedPoints(70)
    pts.forEach((p, i) => {
      for (const side of [-1, 1]) {
        if (r() < 0.75) out.push([p.x + side * (9 + r() * 14), p.z + (r() - 0.5) * 6, 0.9 + r() * 0.9])
      }
      if (i % 3 === 0) out.push([p.x + 26 + r() * 30, p.z + (r() - 0.5) * 10, 1 + r() * 0.8])
    })
    return out
  }, [plates, placed, water])

  const lamps = useMemo(() => path.curve.getSpacedPoints(40).map((p) => [p.x, p.z] as [number, number]), [path])

  const trunk = useRef<THREE.InstancedMesh>(null)
  const crown = useRef<THREE.InstancedMesh>(null)
  const lampPole = useRef<THREE.InstancedMesh>(null)
  const lampBulb = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    // עץ שעומד על משטח מגרש מוגבה — מתחיל מגובה המשטח
    const groundAt = (x: number, z: number) => {
      for (const pl of plates) for (const r of pl.rects) if (Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2) return pl.y
      return 0
    }
    trees.forEach(([x, z, s], i) => {
      const g = groundAt(x, z)
      m.compose(new THREE.Vector3(x, g + 1.4 * s, z), q, new THREE.Vector3(0.35 * s, 2.8 * s, 0.35 * s))
      trunk.current?.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(x, g + 3.6 * s, z), q, new THREE.Vector3(2.4 * s, 2.2 * s, 2.4 * s))
      crown.current?.setMatrixAt(i, m)
      const c = new THREE.Color().setHSL(0.24 + ((i * 37) % 10) / 120, 0.38, 0.27 + ((i * 13) % 10) / 90)
      crown.current?.setColorAt(i, c)
    })
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true
    if (crown.current) {
      ;(crown.current.material as THREE.Material).needsUpdate = true
      crown.current.instanceMatrix.needsUpdate = true
      if (crown.current.instanceColor) crown.current.instanceColor.needsUpdate = true
    }
    lamps.forEach(([x, z], i) => {
      m.compose(new THREE.Vector3(x, 2, z), q, new THREE.Vector3(0.12, 4, 0.12))
      lampPole.current?.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(x, 4.1, z), q, new THREE.Vector3(0.45, 0.45, 0.45))
      lampBulb.current?.setMatrixAt(i, m)
    })
    if (lampPole.current) lampPole.current.instanceMatrix.needsUpdate = true
    if (lampBulb.current) lampBulb.current.instanceMatrix.needsUpdate = true
  }, [trees, lamps])

  const roads = useMemo(() => {
    const R = [
      [295, 20, 336, 1240],
      [30, 532, 600, 556],
      [30, 790, 600, 840],
      [30, 22, 870, 46],
      [30, 1212, 600, 1240],
      [22, 22, 46, 1240],
    ]
    return R.map(([x1, y1, x2, y2]) => {
      const [a, b] = px(x1, y1)
      const [c, d] = px(x2, y2)
      return { x: (a + c) / 2, z: (b + d) / 2, w: c - a, d: d - b }
    })
  }, [])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow geometry={plane} scale={[size * 6, size * 6, 1]}>
        <meshStandardMaterial color={viz ? (tod === 'night' ? '#26331f' : C.grass) : tod === 'night' ? '#1a222b' : '#dfe4e0'} roughness={1} />
      </mesh>
      {roads.map((r, i) => (
        <mesh key={i} position={[r.x, 0.03, r.z]} geometry={box} scale={[r.w, 0.06, r.d]} receiveShadow>
          <meshStandardMaterial color={viz ? C.asphalt : tod === 'night' ? '#2a333d' : '#c9cfd5'} roughness={0.95} />
        </mesh>
      ))}
      {viz && (
        <>
          <mesh geometry={water.g} position-y={0.08} receiveShadow>
            <meshStandardMaterial color={tod === 'night' ? '#0f2a3d' : C.water} roughness={0.08} metalness={0.55} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={path.g} position-y={0.07}>
            <meshStandardMaterial color={C.path} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <instancedMesh ref={trunk} args={[box, undefined, trees.length]} castShadow>
            <meshStandardMaterial color="#5a4632" />
          </instancedMesh>
          <instancedMesh ref={crown} args={[crownGeo, undefined, trees.length]} castShadow>
            <meshStandardMaterial roughness={0.9} flatShading />
          </instancedMesh>
          <instancedMesh ref={lampPole} args={[box, undefined, lamps.length]}>
            <meshStandardMaterial color="#2b2b2b" />
          </instancedMesh>
          <instancedMesh ref={lampBulb} args={[bulbGeo, undefined, lamps.length]}>
            <meshStandardMaterial color={lightsOn ? '#ffd9a0' : '#e9e4d8'} emissive={lightsOn ? '#ffb455' : '#000'} emissiveIntensity={lightsOn ? 3 : 0} toneMapped={!lightsOn} />
          </instancedMesh>
        </>
      )}
    </group>
  )
})

/** עגורן צריח — מסתובב לאט */
function Crane({ x, z, h }: { x: number; z: number; h: number }) {
  const jib = useRef<THREE.Group>(null)
  const seed = useRef(Math.random() * Math.PI * 2)
  useFrame((s) => {
    if (jib.current) jib.current.rotation.y = seed.current + Math.sin(s.clock.elapsedTime * 0.12 + seed.current) * 1.2
  })
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={box} position={[0, h / 2, 0]} scale={[1.4, h, 1.4]} castShadow>
        <meshStandardMaterial color="#e8b10e" />
      </mesh>
      <group ref={jib} position={[0, h, 0]}>
        <mesh geometry={box} position={[9, 0.5, 0]} scale={[30, 1, 1]} castShadow>
          <meshStandardMaterial color="#e8b10e" />
        </mesh>
        <mesh geometry={box} position={[-6, 0.2, 0]} scale={[3, 1.6, 2]}>
          <meshStandardMaterial color="#6b6f74" />
        </mesh>
        <mesh geometry={box} position={[0, 1.6, 0]} scale={[2, 2, 2]}>
          <meshStandardMaterial color="#d9d9d9" />
        </mesh>
        <mesh geometry={box} position={[18, -6, 0]} scale={[0.08, 12, 0.08]}>
          <meshStandardMaterial color="#333" />
        </mesh>
      </group>
    </group>
  )
}

interface AptState {
  pent: boolean
  textured: boolean
  show: boolean
  color: string
  opacity: number
  windows: 'none' | 'opening' | 'glass' | 'lit'
  balcony: boolean
}
interface FloorState {
  slab: boolean
  walls: boolean
  tradeDone: boolean
  pct: number // אחוז ביצוע של כל משימות הקומה
  fin: number // חלק הגמרים שבוצע בדירות הקומה
  tradeFrac: number // חלק הדירות בקומה שבהן המלאכה הנבחרת בוצעה
}

const BuildingMesh = memo(function BuildingMesh({
  p,
  floors,
  apts,
  aptIds,
  mode,
  tradeColor,
  tradeIsFloor,
  selected,
  selectedApt,
  maxF,
  showLabel,
  tod,
  onPick,
  onHover,
}: {
  p: Placed
  floors: FloorState[]
  apts: AptState[]
  aptIds: string[][]
  mode: Mode
  tradeColor: string
  tradeIsFloor: boolean
  selected: boolean
  selectedApt: string | null
  maxF: number
  showLabel: boolean
  tod: TimeOfDay
  onPick: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const { b, w, d } = p
  const viz = mode === 'viz'
  const H = b.floors * FLOOR_H
  const topWalls = floors[b.floors - 1]?.walls
  let k = 0
  const started = floors.some((f) => f.slab)
  const shellDone = floors.every((f) => f.walls)
  return (
    <group position={[p.x, p.y, p.z]}>
      <mesh geometry={box} position={[0, H / 2, 0]} scale={[w + 0.2, H, d + 0.2]} raycast={() => null}>
        <meshBasicMaterial transparent opacity={viz ? 0.025 : 0.05} color="#5b6b7d" depthWrite={false} />
        <Edges color={selected ? '#3d7bff' : viz ? '#ffffff' : '#9aa6b2'} lineWidth={selected ? 2 : 1} transparent opacity={selected ? 1 : viz ? 0.35 : 0.8} />
      </mesh>
      {showLabel && (
        <Html position={[0, Math.max(H, (floors.filter((f) => f.slab).length || 1) * FLOOR_H) + 4, 0]} center className={`lbl3d${selected ? ' sel' : ''}`} zIndexRange={[20, 0]}>
          {b.name}
          {b.type ? <span style={{ opacity: 0.7 }}> · {b.type}</span> : null}
        </Html>
      )}
      {viz && started && !shellDone && <Crane x={w / 2 + 4} z={-d / 2 - 3} h={H + 10} />}

      {floors.slice(0, maxF + 1).map((fs, f) => {
        const y = f * FLOOR_H
        const n = p.perFloor[f]
        const ids = aptIds[f]
        const floorApts = apts.slice(k, k + n)
        k += n
        const slabColor = mode === 'trade' && tradeIsFloor ? (fs.tradeDone ? tradeColor : C.ghost) : fs.slab ? C.slab : C.ghost
        return (
          <group key={f}>
            {(fs.slab || !viz) && (
              <Grow from={viz ? 0 : 1}>
                <mesh geometry={box} position={[0, y + SLAB_H / 2, 0]} scale={[w + 0.5, SLAB_H, d + 0.5]} castShadow receiveShadow>
                  <meshStandardMaterial color={slabColor} transparent={!fs.slab && !viz} opacity={fs.slab || viz ? 1 : 0.35} />
                </mesh>
              </Grow>
            )}
            {(fs.walls || !viz) && (
              <mesh geometry={box} position={[w / 2 - CORE_W / 2, y + FLOOR_H / 2 + SLAB_H / 2, 0]} scale={[CORE_W - 0.3, FLOOR_H - SLAB_H, Math.min(d - 1, 7)]} castShadow>
                <meshStandardMaterial color={viz ? (floorApts.some((a) => a.color === C.white || a.color === C.delivered) ? '#e9e7e2' : C.concrete) : fs.walls ? '#8f949a' : C.ghost} transparent={!viz && !fs.walls} opacity={!viz && !fs.walls ? 0.3 : 1} />
              </mesh>
            )}
            {viz && fs.walls && (
              <mesh geometry={box} position={[w / 2 - CORE_W / 2, y + FLOOR_H / 2, d / 2 - 0.4]} scale={[1.2, FLOOR_H, 0.9]}>
                <meshStandardMaterial color={C.balcony} />
              </mesh>
            )}
            {floorApts.map((s, i) => {
              if (!s.show) return null
              const id = ids[i]
              const loc = aptLocal(p, i, n)
              const isSel = selectedApt === id
              const ay = y + SLAB_H + (FLOOR_H - SLAB_H) / 2
              const pent = viz && s.pent
              const depth = pent ? APT_D * 0.66 : APT_D - 0.2
              const shift = pent ? -loc.face * APT_D * 0.17 : 0
              return (
                <group key={id} position={[loc.x, ay, loc.z]}>
                  <Grow from={viz ? 0 : 1}>
                    <mesh
                      geometry={box}
                      position={[0, 0, shift]}
                      scale={[APT_W - 0.2, FLOOR_H - SLAB_H, depth]}
                      castShadow
                      receiveShadow
                      onClick={(e: ThreeEvent<MouseEvent>) => {
                        e.stopPropagation()
                        onPick(id)
                      }}
                      onPointerOver={(e) => {
                        e.stopPropagation()
                        onHover(id)
                      }}
                      onPointerOut={() => onHover(null)}
                    >
                      <meshStandardMaterial color={isSel ? '#3d7bff' : s.color} map={s.textured && !isSel ? stone() : null} emissive={isSel ? '#173a88' : '#000'} transparent={s.opacity < 1} opacity={s.opacity} roughness={0.85} />
                    </mesh>
                  </Grow>
                  {s.windows !== 'none' && (
                    <mesh geometry={plane} position={[0, 0.05, shift + loc.face * (depth / 2 + 0.03)]} rotation-y={loc.face > 0 ? 0 : Math.PI} scale={[APT_W * (pent ? 0.75 : 0.6), pent ? 2.1 : 1.75, 1]}>
                      <meshStandardMaterial
                        color={s.windows === 'lit' ? C.lit : s.windows === 'glass' ? C.glassDay : C.opening}
                        emissive={s.windows === 'lit' ? '#ffae4a' : '#000'}
                        emissiveIntensity={s.windows === 'lit' ? (tod === 'night' ? 2.2 : 1.3) : 0}
                        toneMapped={s.windows !== 'lit'}
                        metalness={s.windows === 'glass' ? 0.4 : 0}
                        roughness={s.windows === 'glass' ? 0.15 : 0.9}
                      />
                    </mesh>
                  )}
                  {s.balcony && !pent && (
                    <>
                      <mesh geometry={box} position={[-APT_W * 0.08, -(FLOOR_H - SLAB_H) / 2 + 0.1, loc.face * (APT_D / 2 + 0.8)]} scale={[APT_W * 0.7, 0.24, 1.6]} castShadow>
                        <meshStandardMaterial color="#d8d5ce" />
                      </mesh>
                      {s.windows !== 'opening' && s.windows !== 'none' && (
                        <mesh geometry={box} position={[-APT_W * 0.08, -(FLOOR_H - SLAB_H) / 2 + 0.75, loc.face * (APT_D / 2 + 1.58)]} scale={[APT_W * 0.7, 1.05, 0.05]}>
                          <meshStandardMaterial color={C.glass} transparent opacity={0.45} metalness={0.3} roughness={0.1} />
                        </mesh>
                      )}
                    </>
                  )}
                  {pent && s.windows !== 'none' && s.windows !== 'opening' && (
                    <mesh geometry={box} position={[0, -(FLOOR_H - SLAB_H) / 2 + 0.55, loc.face * (APT_D / 2 - 0.1)]} scale={[APT_W - 0.2, 1.05, 0.05]}>
                      <meshStandardMaterial color={C.glass} transparent opacity={0.45} metalness={0.3} roughness={0.1} />
                    </mesh>
                  )}
                </group>
              )
            })}
          </group>
        )
      })}
      {viz && shellDone && b.floors >= 3 && (() => {
        const twoRows = Math.max(...p.perFloor) > 2
        const faceZ = twoRows ? APT_D + 1.2 : APT_D / 2
        const top = (b.floors >= 4 ? b.floors - 1 : b.floors) * FLOOR_H
        const x1 = -w / 2 + 0.3
        const x2 = w / 2 - CORE_W - 0.1
        const zw = x2 - x1
        const hh = top - FLOOR_H
        return [1, -1].map((side) => (
          <group key={side} position={[0, 0, side * (faceZ + 0.85)]}>
            <mesh geometry={box} position={[x1, FLOOR_H + hh / 2, 0]} scale={[0.6, hh, 1.75]} castShadow>
              <meshStandardMaterial color={C.frame} roughness={0.6} />
            </mesh>
            <mesh geometry={box} position={[x2, FLOOR_H + hh / 2, 0]} scale={[0.6, hh, 1.75]} castShadow>
              <meshStandardMaterial color={C.frame} roughness={0.6} />
            </mesh>
            <mesh geometry={box} position={[(x1 + x2) / 2, top - 0.2, 0]} scale={[zw + 0.6, 0.5, 1.75]} castShadow>
              <meshStandardMaterial color={C.frame} roughness={0.6} />
            </mesh>
            <mesh geometry={box} position={[(x1 + x2) / 2, FLOOR_H + 0.05, 0]} scale={[zw + 0.6, 0.35, 1.75]}>
              <meshStandardMaterial color={C.frame} roughness={0.6} />
            </mesh>
          </group>
        ))
      })()}
      {viz && topWalls && maxF === b.floors - 1 && (
        <Grow>
          <mesh geometry={box} position={[0, H + SLAB_H / 2, 0]} scale={[w + 0.6, SLAB_H * 1.5, d + 0.6]} castShadow>
            <meshStandardMaterial color="#e7e4de" />
          </mesh>
          <mesh geometry={box} position={[w / 2 - CORE_W / 2, H + 1.9, 0]} scale={[CORE_W, 3.6, 5]} castShadow>
            <meshStandardMaterial color="#efece6" map={stone()} />
          </mesh>
          <mesh geometry={box} position={[-w / 4, H + 0.7, 0]} scale={[w * 0.35, 0.12, d * 0.4]} rotation-x={-0.2}>
            <meshStandardMaterial color="#20324a" metalness={0.5} roughness={0.3} />
          </mesh>
        </Grow>
      )}
    </group>
  )
})

const flatMats = new Map<string, THREE.MeshStandardMaterial>()
const flatMat = (color: string) => {
  let m = flatMats.get(color)
  if (!m) flatMats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })))
  return m
}

/** בניין ממודל IFC אמיתי: כל קומה במודל נצבעת לפי מצב הביצוע של הקומה המקבילה */
function IfcBuilding({
  p,
  src,
  floors,
  mode,
  tod,
  tradeColor,
  selected,
  maxF,
  showLabel,
  onPick,
}: {
  p: Placed
  src: { key: string; get: () => Promise<ArrayBuffer>; rot: number; scale: number; shift: number }
  floors: FloorState[]
  mode: Mode
  tod: TimeOfDay
  tradeColor: string
  selected: boolean
  maxF: number
  showLabel: boolean
  onPick: () => void
}) {
  const [parsed, setParsed] = useState<ParsedIfc | null>(null)
  const [stage, setStage] = useState('טוען מודל…')
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    setErr(false)
    loadIfc(src.key, src.get, (s) => alive && setStage(s))
      .then((r) => alive && setParsed(r))
      .catch((e) => {
        console.warn('IFC', e)
        if (alive) setErr(true)
      })
    return () => {
      alive = false
    }
  }, [src.key, src.get])
  const viz = mode === 'viz'
  const vcMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), [])
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8fb3cc', transparent: true, opacity: 0.4, metalness: 0.3, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }), [])
  const litMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffae4a', emissiveIntensity: 1.4, toneMapped: false, side: THREE.DoubleSide }), [])
  if (!parsed)
    return (
      <Html position={[p.x, 8, p.z]} center className="lbl3d" zIndexRange={[25, 0]}>
        {err ? 'לא ניתן לטעון את מודל ה־IFC' : stage}
      </Html>
    )
  const top = floors.length - 1
  return (
    <group position={[p.x, p.y, p.z]} rotation-y={(src.rot * Math.PI) / 180} scale={src.scale}>
      {showLabel && (
        <Html position={[0, parsed.size.h + 4, 0]} center className={`lbl3d${selected ? ' sel' : ''}`} zIndexRange={[20, 0]}>
          {p.b.name} · IFC
        </Html>
      )}
      {parsed.storeys.map((s, i) => {
        const f = i - parsed.groundIndex - src.shift
        const fs = floors[Math.max(0, Math.min(top, f))]
        if (!fs) return null
        if (f > maxF && f <= top) return null
        const shown = !viz || (f < 0 ? floors[0]?.slab : f > top ? floors[top]?.walls : fs.slab)
        if (!shown) return null
        let mat: THREE.Material = vcMat
        let color: string | null = null
        if (viz) {
          if (f >= 0 && f <= top && (!fs.walls || fs.fin < 0.5)) color = fs.walls ? C.blocks : C.concrete
        } else if (mode === 'status') color = pctColor(f < 0 || f > top ? 100 : fs.pct)
        else color = (fs.tradeDone || fs.tradeFrac >= 0.5) && f >= 0 && f <= top ? tradeColor : C.ghost
        if (color) mat = flatMat(color)
        const lit = viz && tod !== 'day' && f >= 0 && f <= top && fs.fin >= 0.99
        return (
          <Grow key={i} from={viz ? 0 : 1}>
            {s.opaque && <mesh geometry={s.opaque} material={mat} castShadow receiveShadow onClick={(e) => { e.stopPropagation(); onPick() }} />}
            {s.glass && <mesh geometry={s.glass} material={lit ? litMat : glassMat} />}
          </Grow>
        )
      })}
    </group>
  )
}

export function Site3D() {
  const { model, done, date, sel, setSel, openApt, data, models, saveModel, upload, canWrite, toast, ask } = useStore()
  const [localModels, setLocalModels] = useState<Record<string, { name: string; buf: ArrayBuffer }>>({})
  const [ifcBusy, setIfcBusy] = useState(false)
  const ifcInput = useRef<HTMLInputElement>(null)
  const ifcSrc = useMemo(() => {
    const out = new Map<string, { key: string; get: () => Promise<ArrayBuffer>; rot: number; scale: number; shift: number }>()
    for (const m of models) out.set(m.id, { key: m.asset, get: () => fetch(`/_blob/${m.asset}`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer() }), rot: m.rot ?? 0, scale: m.scale ?? 1, shift: m.shift ?? 0 })
    for (const [bid, l] of Object.entries(localModels)) out.set(bid, { key: 'local:' + bid + ':' + l.name, get: async () => l.buf, rot: 0, scale: 1, shift: 0 })
    return out
  }, [models, localModels])
  const [mode, setMode] = useState<Mode>('viz')
  const [tod, setTod] = useState<TimeOfDay>('sunset')
  const [tradeId, setTradeId] = useState(model.trades[0]?.id ?? '')
  const [hover, setHover] = useState<string | null>(null)
  const [cut, setCut] = useState<number>(99)
  const [labels, setLabels] = useState(true)
  const [viewKey, setViewKey] = useState(0)
  const compassRef = useRef<HTMLDivElement>(null)
  const [wide] = useState(() => window.innerWidth > 1000)
  const { placed, plates, size } = useMemo(() => layout(model), [model])
  const has = (id: string) => model.tradeById.has(id)

  const visible = placed.filter((p) => !sel.lotId || p.b.lotId === sel.lotId)
  const aptTradeIds = useMemo(() => model.trades.filter((t) => t.level === 'apt').map((t) => t.id), [model])
  const tr = model.tradeById.get(tradeId)

  const state = useMemo(() => {
    const ok = (tid: string, unit: string) => isDone(done, taskIdOf(tid, unit), date)
    const out = new Map<string, { floors: FloorState[]; apts: AptState[]; aptIds: string[][] }>()
    for (const p of placed) {
      const b = p.b
      const floors: FloorState[] = []
      const apts: AptState[] = []
      const aptIds: string[][] = []
      const bApts = model.aptsByBuilding.get(b.id) ?? []
      for (let f = 0; f < b.floors; f++) {
        const fu = floorUnit(b.id, f)
        const walls = has('walls') ? ok('walls', fu) : true
        const fs: FloorState = { slab: has('slab') ? ok('slab', fu) : walls, walls, tradeDone: tr?.level === 'floor' ? ok(tr.id, fu) : false, pct: 0, fin: 0, tradeFrac: 0 }
        floors.push(fs)
        const blocks = has('blocks') ? ok('blocks', fu) : walls
        const onFloor = bApts.filter((a) => a.floor === f)
        aptIds.push(onFloor.map((a) => a.id))
        const nOn = onFloor.length
        const pentFloor = b.floors >= 4 && f === b.floors - 1
        for (const a of onFloor) {
          const s: AptState = { show: true, color: C.ghost, opacity: 1, windows: 'none', balcony: false, pent: false, textured: false }
          if (mode === 'viz') {
            if (!fs.walls) s.show = false
            else {
              const fin = aptTradeIds.length ? aptTradeIds.filter((t) => ok(t, a.id)).length / aptTradeIds.length : 0
              const delivered = has('handover') && ok('handover', a.id)
              // חיפוי לפי החזיתות: פנטהאוז באבן אפורה כהה, אזור המרפסות הקדמי באבן אפורה, השאר אבן בהירה
              const front = aptLocal(p, a.idx, nOn).face > 0
              const facade = pentFloor ? C.pentStone : front && f >= 1 ? C.grayStone : C.white
              s.pent = pentFloor
              s.textured = fin > 0.3 && facade === C.white
              s.color = delivered ? (facade === C.white ? C.delivered : facade) : fin > 0 ? lerpColor(C.blocks, facade, Math.min(1, fin * 1.6)) : blocks ? C.blocks : C.concrete
              const alu = has('alu') ? ok('alu', a.id) : fin > 0.6
              s.windows = alu ? (delivered && tod !== 'day' ? 'lit' : 'glass') : blocks ? 'opening' : 'none'
              s.balcony = blocks
            }
          } else if (mode === 'status') {
            const c = countDone(done, tasksForApt(model, a.id), date)
            s.color = pctColor(c.pct)
            if (c.done === 0) s.opacity = 0.35
          } else if (tr) {
            const v = tr.level === 'floor' ? fs.tradeDone : ok(tr.id, a.id)
            s.color = v ? tr.color : C.ghost
            if (!v) s.opacity = 0.28
          }
          apts.push(s)
        }
        if (onFloor.length) {
          const finOf = (aid: string) => (aptTradeIds.length ? aptTradeIds.filter((t) => ok(t, aid)).length / aptTradeIds.length : 0)
          fs.fin = onFloor.reduce((a, x) => a + finOf(x.id), 0) / onFloor.length
          if (tr?.level === 'apt') fs.tradeFrac = onFloor.filter((x) => ok(tr.id, x.id)).length / onFloor.length
        }
        const ft = (model.tasksByBuilding.get(b.id) ?? []).filter((t) => t.floor === f)
        fs.pct = ft.length ? (ft.filter((t) => isDone(done, t.id, date)).length / ft.length) * 100 : 0
      }
      out.set(b.id, { floors, apts, aptIds })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, done, date, placed, mode, tr, aptTradeIds, tod])

  const goal = useMemo(() => {
    const p = placed.find((x) => x.b.id === sel.buildingId)
    let target: THREE.Vector3
    let dist: number
    if (p) {
      target = new THREE.Vector3(p.x, p.y + (p.b.floors * FLOOR_H) / 2, p.z)
      dist = 80 + p.b.floors * 4
    } else if (sel.lotId) {
      const pl = plates.find((x) => x.id === sel.lotId)
      const r = pl?.rects[0]
      target = new THREE.Vector3(r?.x ?? 0, 0, r?.z ?? 0)
      dist = Math.max(90, (r ? Math.max(r.w, r.d) : 80) * 1.4)
    } else {
      target = new THREE.Vector3(0, 0, 0)
      dist = size * 0.62
    }
    const pos = target.clone().add(new THREE.Vector3(dist * 0.32, dist * (p ? 0.42 : 0.4), dist * 0.86))
    return { target, pos, key: `${sel.buildingId}|${sel.lotId}|${viewKey}` }
  }, [placed, plates, sel.buildingId, sel.lotId, size, viewKey])

  const selB = sel.buildingId ? model.buildingById.get(sel.buildingId) : undefined
  const hoverApt = hover ? model.aptById.get(hover) : undefined
  const progress = countDone(done, model.tasks, date)

  const pick = (aptId: string) => {
    const a = model.aptById.get(aptId)!
    const b = model.buildingById.get(a.buildingId)!
    setSel({ lotId: sel.lotId ? b.lotId : null, buildingId: b.id, aptId })
    openApt(aptId)
  }

  return (
    <>
      <div className="toolbar">
        <ScopePicker />
        <div className="seg" role="group" aria-label="תצוגה">
          {(
            [
              ['viz', 'הדמיה', 'camera'],
              ['status', 'סטטוס דירה', 'grid'],
              ['trade', 'לפי מלאכה', 'layers'],
            ] as [Mode, string, string][]
          ).map(([m, l, ic]) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              <Icon name={ic} size={15} />
              {l}
            </button>
          ))}
        </div>
        {mode === 'trade' && (
          <select id="trade-layer" value={tradeId} onChange={(e) => setTradeId(e.target.value)} aria-label="מלאכה">
            {model.trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <div className="seg" role="group" aria-label="שעה ביום">
          {(
            [
              ['day', 'יום', 'sun'],
              ['sunset', 'שקיעה', 'sunset'],
              ['night', 'לילה', 'moon'],
            ] as [TimeOfDay, string, string][]
          ).map(([t, l, ic]) => (
            <button key={t} className={tod === t ? 'on' : ''} onClick={() => setTod(t)} title={l}>
              <Icon name={ic} size={15} />
              {l}
            </button>
          ))}
        </div>
        {selB && (
          <div className="seg" role="group" aria-label="מודל אמיתי">
            {(() => {
              const m = models.find((x) => x.id === selB.id)
              const local = localModels[selB.id]
              if (m)
                return (
                  <>
                    <button onClick={() => saveModel({ ...m, rot: ((m.rot ?? 0) + 90) % 360 })} disabled={!canWrite} title="סובב את המודל ב־90°">
                      <Icon name="refresh" size={14} /> סובב
                    </button>
                    <button onClick={() => saveModel({ ...m, shift: (m.shift ?? 0) + 1 })} disabled={!canWrite} title="הזז את שיוך הקומות קומה אחת">
                      קומות ↑
                    </button>
                    <button onClick={() => saveModel({ ...m, shift: (m.shift ?? 0) - 1 })} disabled={!canWrite} title="הזז את שיוך הקומות קומה אחת">
                      ↓
                    </button>
                    <button onClick={() => ask(`להסיר את מודל ה־IFC מבניין ${selB.name}?`, () => saveModel(m, true))} disabled={!canWrite}>
                      <Icon name="x" size={14} /> הסר מודל
                    </button>
                  </>
                )
              if (local)
                return (
                  <button onClick={() => setLocalModels((m) => {
                    const rest = { ...m }
                    delete rest[selB.id]
                    return rest
                  })}>
                    <Icon name="x" size={14} /> הסר מודל
                  </button>
                )
              return (
                <button onClick={() => ifcInput.current?.click()} disabled={ifcBusy} title="טעינת מודל IFC אמיתי לבניין">
                  <Icon name="building" size={14} /> {ifcBusy ? 'מעלה…' : 'מודל IFC'}
                </button>
              )
            })()}
            <input
              ref={ifcInput}
              type="file"
              accept=".ifc"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f || !selB) return
                if (upload) {
                  setIfcBusy(true)
                  try {
                    const up = await upload(f, 'text/plain')
                    if (!up) throw new Error()
                    saveModel({ id: selB.id, asset: up.id, name: f.name, rot: 0, scale: 1, created: Date.now() })
                    toast({ kind: 'ok', text: `המודל נשמר לבניין ${selB.name}` })
                  } catch {
                    toast({ kind: 'error', text: 'העלאת המודל נכשלה (עד 20MB, קובץ IFC טקסטואלי)' })
                  } finally {
                    setIfcBusy(false)
                  }
                } else {
                  const buf = await f.arrayBuffer()
                  setLocalModels((m) => ({ ...m, [selB.id]: { name: f.name, buf } }))
                  toast({ kind: 'ok', text: 'המודל נטען לתצוגה (לא נשמר — זמין רק בגרסה המשותפת)' })
                }
              }}
            />
          </div>
        )}
        {selB && (
          <label className="cut">
            חתך עד
            <input type="range" min={0} max={selB.floors - 1} value={Math.min(cut, selB.floors - 1)} onChange={(e) => setCut(+e.target.value)} />
            <span className="num">{floorLabel(Math.min(cut, selB.floors - 1))}</span>
          </label>
        )}
      </div>

      <div className="scene card">
        <Canvas
          shadows
          dpr={[1, 1.75]}
          gl={{ antialias: true }}
          camera={{ fov: 38, near: 1, far: 20000, position: [size * 0.2, size * 0.4, size * 0.55] }}
          onPointerMissed={() => setSel({ aptId: null })}
        >
          <Atmosphere tod={tod} size={size} mode={mode} />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.08} minDistance={15} maxDistance={size * 2.2} />
          <CameraRig goal={goal} compassRef={compassRef} />
          <Landscape plates={plates} placed={placed} size={size} tod={tod} mode={mode} />

          {plates
            .filter((pl) => !sel.lotId || pl.id === sel.lotId)
            .map((pl) => (
              <group key={pl.id}>
                {pl.rects.map((r, i) => (
                  <mesh
                    key={i}
                    position={[r.x, pl.y / 2, r.z]}
                    geometry={box}
                    scale={[r.w, Math.max(0.12, pl.y), r.d]}
                    receiveShadow
                    onClick={(e) => {
                      e.stopPropagation()
                      setSel({ lotId: pl.id, buildingId: null, aptId: null })
                    }}
                  >
                    <meshStandardMaterial color={mode === 'viz' ? (tod === 'night' ? '#4a4740' : C.paving) : sel.lotId === pl.id ? '#cfe0bd' : tod === 'night' ? '#26303a' : '#e6ebe1'} roughness={0.95} />
                  </mesh>
                ))}
                {labels && (
                  <Html position={[pl.label[0], pl.y + 0.5, pl.label[1]]} center className="lbl3d lot" zIndexRange={[20, 0]}>
                    {pl.name}
                  </Html>
                )}
              </group>
            ))}

          {visible.map((p) => {
            const st = state.get(p.b.id)!
            const isSel = sel.buildingId === p.b.id
            const src = ifcSrc.get(p.b.id)
            if (src)
              return (
                <IfcBuilding
                  key={p.b.id}
                  p={p}
                  src={src}
                  floors={st.floors}
                  mode={mode}
                  tod={tod}
                  tradeColor={tr?.color ?? '#888'}
                  selected={isSel}
                  maxF={isSel ? Math.min(cut, p.b.floors - 1) : p.b.floors - 1}
                  showLabel={labels && (!!sel.lotId || wide)}
                  onPick={() => setSel({ lotId: sel.lotId ? p.b.lotId : null, buildingId: p.b.id, aptId: null })}
                />
              )
            return (
              <BuildingMesh
                key={p.b.id}
                p={p}
                floors={st.floors}
                apts={st.apts}
                aptIds={st.aptIds}
                mode={mode}
                tradeColor={tr?.color ?? '#888'}
                tradeIsFloor={tr?.level === 'floor'}
                selected={isSel}
                selectedApt={sel.aptId}
                maxF={isSel ? Math.min(cut, p.b.floors - 1) : p.b.floors - 1}
                showLabel={labels && (!!sel.lotId || wide)}
                tod={tod}
                onPick={pick}
                onHover={setHover}
              />
            )
          })}

          {hoverApt &&
            (() => {
              const p = placed.find((x) => x.b.id === hoverApt.buildingId)
              if (!p) return null
              const n = p.perFloor[hoverApt.floor]
              const loc = aptLocal(p, hoverApt.idx, n)
              return (
                <Html position={[p.x + loc.x, p.y + hoverApt.floor * FLOOR_H + FLOOR_H + 1.2, p.z + loc.z]} center className="lbl3d tip" zIndexRange={[30, 0]}>
                  בניין {p.b.name} · דירה {hoverApt.number} · {floorLabel(hoverApt.floor)}
                </Html>
              )
            })()}
        </Canvas>

        <div className="scene-ui">
          <div className="scene-top">
            <div className="glass scene-date">
              <b>{fmt(date)}</b>
              <span>
                {data.projectName} · {progress.pct.toFixed(1)}% בוצע
              </span>
            </div>
            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <div className="glass scene-tools">
                <button className="btn ghost" onClick={() => { setSel({ lotId: null, buildingId: null, aptId: null }); setViewKey((k) => k + 1) }} title="מבט על כל האתר" aria-label="מבט על כל האתר">
                  <Icon name="target" size={17} />
                </button>
                <button className={`btn ghost${labels ? '' : ' muted'}`} onClick={() => setLabels(!labels)} title="הצג/הסתר תוויות" aria-label="תוויות">
                  <Icon name="flag" size={17} />
                </button>
              </div>
              <div className="glass compass" title="צפון">
                <div ref={compassRef} style={{ display: 'grid', placeItems: 'center', transition: 'none' }}>
                  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
                    <path d="M15 3 20 16 15 13 10 16z" fill="#d2423b" />
                    <path d="M15 27 10 14 15 17 20 14z" fill="currentColor" opacity="0.35" />
                  </svg>
                  <span style={{ fontSize: 10, marginTop: -4 }}>צ</span>
                </div>
              </div>
            </div>
          </div>
          <div className="scene-bottom">
            <span className="glass small" style={{ padding: '6px 10px' }}>
              גרירה לסיבוב · גלגלת לזום · קליק ימני להזזה · לחיצה על דירה פותחת את הכרטיס שלה
            </span>
            <div className="glass legend">
              {mode === 'viz' && (
                <>
                  <span><i style={{ background: C.concrete }} />שלד</span>
                  <span><i style={{ background: C.blocks }} />בלוקים</span>
                  <span><i style={{ background: C.white }} />גמרים</span>
                  <span><i style={{ background: C.glassDay }} />אלומיניום</span>
                  <span><i style={{ background: C.lit }} />נמסרה (אור דולק)</span>
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
                  <span><i style={{ background: tr?.color }} />{tr?.name} בוצע</span>
                  <span><i style={{ background: C.ghost }} />לא בוצע</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
