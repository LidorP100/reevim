import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, OrbitControls, Sky, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { aptsPerFloor, countDone, floorLabel, floorUnit, isDone, lerpColor, pctColor, taskIdOf, tasksForApt, type Model } from '../engine'
import { PLAN_BUILDINGS, PLAN_CENTER, PLAN_LOTS, PLAN_SCALE } from '../sample'
import { fmt } from '../date'
import { ScopePicker } from '../components/ScopePicker'
import { Icon } from '../components/ui'
import type { Building } from '../types'

// ---------- מידות (מטרים) ----------
const APT_W = 8
const APT_D = 9
const CORE_W = 4.5
const FLOOR_H = 3.1
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
}
interface LotPlate {
  id: string
  name: string
  rects: { x: number; z: number; w: number; d: number }[]
  label: [number, number]
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
        placed.push({ b, x, z, w, d, cols, perFloor })
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
        placed.push({ b, x: startX + w / 2, z, w, d, cols, perFloor })
        z += d + 14
      }
      if (!planRects) rects = [{ x: startX + 15, z: -60 + (z + 60) / 2 - 14, w: 50, d: z + 60 + 4 }]
      extraX += 60
    }
    if (rects.length) {
      const r = rects[0]
      plates.push({ id: lot.id, name: lot.name, rects, label: [r.x, r.z - r.d / 2 - 4] })
    }
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
const plane = new THREE.PlaneGeometry(1, 1)

// ---------- פלטות צבע ----------
const C = {
  concrete: '#9fa4aa',
  blocks: '#cbc3b7',
  white: '#f3f1ec',
  delivered: '#fbfaf6',
  ghost: '#d8dee5',
  balcony: '#2c3035',
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
    trees.forEach(([x, z, s], i) => {
      m.compose(new THREE.Vector3(x, 1.4 * s, z), q, new THREE.Vector3(0.35 * s, 2.8 * s, 0.35 * s))
      trunk.current?.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(x, 3.6 * s, z), q, new THREE.Vector3(2.4 * s, 2.2 * s, 2.4 * s))
      crown.current?.setMatrixAt(i, m)
      const c = new THREE.Color().setHSL(0.24 + ((i * 37) % 10) / 120, 0.38, 0.27 + ((i * 13) % 10) / 90)
      crown.current?.setColorAt(i, c)
    })
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true
    if (crown.current) {
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
          <instancedMesh ref={crown} args={[new THREE.IcosahedronGeometry(0.5, 1), undefined, trees.length]} castShadow>
            <meshStandardMaterial roughness={0.9} flatShading />
          </instancedMesh>
          <instancedMesh ref={lampPole} args={[box, undefined, lamps.length]}>
            <meshStandardMaterial color="#2b2b2b" />
          </instancedMesh>
          <instancedMesh ref={lampBulb} args={[new THREE.SphereGeometry(0.5, 10, 8), undefined, lamps.length]}>
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
    <group position={[p.x, 0.06, p.z]}>
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
              return (
                <group key={id} position={[loc.x, ay, loc.z]}>
                  <Grow from={viz ? 0 : 1}>
                    <mesh
                      geometry={box}
                      scale={[APT_W - 0.2, FLOOR_H - SLAB_H, APT_D - 0.2]}
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
                      <meshStandardMaterial color={isSel ? '#3d7bff' : s.color} emissive={isSel ? '#173a88' : '#000'} transparent={s.opacity < 1} opacity={s.opacity} roughness={0.85} />
                    </mesh>
                  </Grow>
                  {s.windows !== 'none' && (
                    <mesh geometry={plane} position={[0, 0.05, loc.face * (APT_D / 2 - 0.05)]} rotation-y={loc.face > 0 ? 0 : Math.PI} scale={[APT_W * 0.6, 1.75, 1]}>
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
                  {s.balcony && (
                    <>
                      <mesh geometry={box} position={[-APT_W * 0.12, -(FLOOR_H - SLAB_H) / 2 + 0.1, loc.face * (APT_D / 2 + 0.8)]} scale={[APT_W * 0.62, 0.22, 1.6]} castShadow>
                        <meshStandardMaterial color={C.balcony} />
                      </mesh>
                      <mesh geometry={box} position={[-APT_W * 0.12 + APT_W * 0.31, 0, loc.face * (APT_D / 2 + 0.8)]} scale={[0.25, FLOOR_H - SLAB_H, 1.6]}>
                        <meshStandardMaterial color={C.balcony} />
                      </mesh>
                    </>
                  )}
                </group>
              )
            })}
          </group>
        )
      })}
      {viz && topWalls && maxF === b.floors - 1 && (
        <Grow>
          <mesh geometry={box} position={[0, H + SLAB_H / 2, 0]} scale={[w + 0.6, SLAB_H * 1.5, d + 0.6]} castShadow>
            <meshStandardMaterial color="#e7e4de" />
          </mesh>
          <mesh geometry={box} position={[w / 2 - CORE_W / 2, H + 1.4, 0]} scale={[CORE_W, 2.6, 5]} castShadow>
            <meshStandardMaterial color="#efece6" />
          </mesh>
          <mesh geometry={box} position={[-w / 4, H + 0.7, 0]} scale={[w * 0.35, 0.12, d * 0.4]} rotation-x={-0.2}>
            <meshStandardMaterial color="#20324a" metalness={0.5} roughness={0.3} />
          </mesh>
        </Grow>
      )}
    </group>
  )
})

export function Site3D() {
  const { model, done, date, sel, setSel, openApt, data } = useStore()
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
        const fs: FloorState = { slab: has('slab') ? ok('slab', fu) : walls, walls, tradeDone: tr?.level === 'floor' ? ok(tr.id, fu) : false }
        floors.push(fs)
        const blocks = has('blocks') ? ok('blocks', fu) : walls
        const onFloor = bApts.filter((a) => a.floor === f)
        aptIds.push(onFloor.map((a) => a.id))
        for (const a of onFloor) {
          const s: AptState = { show: true, color: C.ghost, opacity: 1, windows: 'none', balcony: false }
          if (mode === 'viz') {
            if (!fs.walls) s.show = false
            else {
              const fin = aptTradeIds.length ? aptTradeIds.filter((t) => ok(t, a.id)).length / aptTradeIds.length : 0
              const delivered = has('handover') && ok('handover', a.id)
              s.color = delivered ? C.delivered : fin > 0 ? lerpColor(C.blocks, C.white, Math.min(1, fin * 1.6)) : blocks ? C.blocks : C.concrete
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
      target = new THREE.Vector3(p.x, (p.b.floors * FLOOR_H) / 2, p.z)
      dist = 55 + p.b.floors * 3
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
                    position={[r.x, 0.06, r.z]}
                    geometry={box}
                    scale={[r.w, 0.12, r.d]}
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
                  <Html position={[pl.label[0], 0.5, pl.label[1]]} center className="lbl3d lot" zIndexRange={[20, 0]}>
                    {pl.name}
                  </Html>
                )}
              </group>
            ))}

          {visible.map((p) => {
            const st = state.get(p.b.id)!
            const isSel = sel.buildingId === p.b.id
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
                <Html position={[p.x + loc.x, hoverApt.floor * FLOOR_H + FLOOR_H + 1.2, p.z + loc.z]} center className="lbl3d tip" zIndexRange={[30, 0]}>
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
