import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'

type TimeOfDay = 'day' | 'sunset' | 'night'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** טקסטורת חלונות לבנייני העיר: מפה רגילה + מפת אור לחלונות דולקים */
function windowTextures() {
  const mk = (lit: boolean) => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 128
    const g = c.getContext('2d')!
    g.fillStyle = lit ? '#000' : '#ece8df'
    g.fillRect(0, 0, 64, 128)
    const r = rng(lit ? 7 : 3)
    for (let y = 6; y < 124; y += 12)
      for (let x = 5; x < 60; x += 14) {
        const on = r() < 0.55
        g.fillStyle = lit ? (on ? (r() < 0.2 ? '#ffe2b0' : '#ffb661') : '#000') : '#3e4a57'
        g.fillRect(x, y, 8, 6)
      }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  }
  return { map: mk(false), lit: mk(true) }
}

const box = new THREE.BoxGeometry(1, 1, 1)
const cone = new THREE.ConeGeometry(1, 1, 7, 1)
const dot = new THREE.SphereGeometry(1, 6, 4)

/**
 * רקע העיר עכו: הים במערב ומפרץ חיפה עם הכרמל בדרום־מערב, הרי הגליל במזרח,
 * שכונות עכו מסביב לאתר, וכביש מהיר עם תנועה.
 */
export function AkkoBackdrop({ size, tod }: { size: number; tod: TimeOfDay }) {
  const night = tod === 'night'
  const dusk = tod === 'sunset'
  const tex = useMemo(windowTextures, [])

  const city = useMemo(() => {
    const r = rng(590)
    const items: { x: number; z: number; w: number; d: number; h: number; roof: boolean }[] = []
    const inner = size * 0.62
    const outer = size * 3.4
    let guard = 0
    while (items.length < 1500 && guard++ < 20000) {
      const ang = r() * Math.PI * 2
      const rad = inner + Math.pow(r(), 0.8) * (outer - inner)
      const x = Math.cos(ang) * rad
      const z = Math.sin(ang) * rad
      if (x < -size * 1.05) continue // ים
      if (x > size * 0.3 && x < size * 0.62 && Math.abs(z) < size * 0.75) continue // פארק ונחל
      if (Math.abs(x - size * 0.68) < 18) continue // כביש מהיר
      const k = r()
      const tower = k > 0.985
      const mid = !tower && k > 0.86
      const w = tower ? 22 + r() * 10 : mid ? 18 + r() * 14 : 9 + r() * 9
      const d = tower ? 20 + r() * 10 : mid ? 14 + r() * 10 : 9 + r() * 8
      const h = tower ? 50 + r() * 45 : mid ? 14 + r() * 16 : 4 + r() * 5
      items.push({ x, z, w, d, h, roof: !tower && !mid && r() < 0.55 })
    }
    return items
  }, [size])

  const lights = useMemo(() => {
    const r = rng(11)
    return Array.from({ length: 900 }, () => {
      const ang = r() * Math.PI * 2
      const rad = size * 0.6 + r() * size * 3
      const x = Math.cos(ang) * rad
      const z = Math.sin(ang) * rad
      return x < -size * 1.05 ? null : ([x, 6 + r() * 2, z] as [number, number, number])
    }).filter((v): v is [number, number, number] => !!v)
  }, [size])

  const bld = useRef<THREE.InstancedMesh>(null)
  const roofs = useRef<THREE.InstancedMesh>(null)
  const lamps = useRef<THREE.InstancedMesh>(null)
  const hills = useRef<THREE.InstancedMesh>(null)

  const hillList = useMemo(() => {
    const r = rng(42)
    const out: [number, number, number, number][] = []
    // הרי הגליל במזרח
    for (let i = 0; i < 26; i++) out.push([size * (4.2 + r() * 1.6), (r() - 0.5) * size * 12, size * (0.9 + r() * 0.9), 120 + r() * 260])
    // הכרמל מעבר למפרץ, בדרום־מערב
    for (let i = 0; i < 14; i++) {
      const t = i / 13
      out.push([-size * (2.2 + t * 3.2), size * (4.4 - t * 0.6), size * (0.8 + r() * 0.6), 180 + r() * 150])
    }
    return out
  }, [size])

  useEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const c = new THREE.Color()
    let ri = 0
    city.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.h / 2, b.z), q, new THREE.Vector3(b.w, b.h, b.d))
      bld.current?.setMatrixAt(i, m)
      bld.current?.setColorAt(i, c.setHSL(0.09, 0.12 + (i % 5) * 0.03, 0.82 + (i % 7) * 0.02))
      if (b.roof && roofs.current) {
        m.compose(new THREE.Vector3(b.x, b.h + 0.6, b.z), q, new THREE.Vector3(b.w * 1.04, 1.2, b.d * 1.04))
        roofs.current.setMatrixAt(ri++, m)
      }
    })
    if (roofs.current) {
      roofs.current.count = ri
      roofs.current.instanceMatrix.needsUpdate = true
    }
    if (bld.current) {
      bld.current.instanceMatrix.needsUpdate = true
      if (bld.current.instanceColor) bld.current.instanceColor.needsUpdate = true
    }
    lights.forEach(([x, y, z], i) => {
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(0.9, 0.9, 0.9))
      lamps.current?.setMatrixAt(i, m)
    })
    if (lamps.current) lamps.current.instanceMatrix.needsUpdate = true
    hillList.forEach(([x, z, rad, h], i) => {
      m.compose(new THREE.Vector3(x, h / 2 - 10, z), q, new THREE.Vector3(rad, h, rad * 0.8))
      hills.current?.setMatrixAt(i, m)
    })
    if (hills.current) hills.current.instanceMatrix.needsUpdate = true
  }, [city, lights, hillList])

  const cityMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.lit, emissive: new THREE.Color('#ffb15e'), roughness: 0.9 }),
    [tex],
  )
  useEffect(() => {
    cityMat.emissiveIntensity = night ? 1.6 : dusk ? 0.7 : 0
  }, [cityMat, night, dusk])

  return (
    <group>
      {/* הים התיכון ומפרץ חיפה */}
      <mesh rotation-x={-Math.PI / 2} position={[-size * 5.2, -0.4, size * 1.5]}>
        <planeGeometry args={[size * 8.4, size * 16]} />
        <meshStandardMaterial color={night ? '#0c1a2c' : dusk ? '#3b5878' : '#2a6f97'} metalness={0.7} roughness={0.12} />
      </mesh>
      <instancedMesh ref={bld} args={[box, cityMat, city.length]} castShadow={false} receiveShadow />
      <instancedMesh ref={roofs} args={[box, undefined, city.length]}>
        <meshStandardMaterial color="#b45a3c" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={hills} args={[cone, undefined, hillList.length]}>
        <meshStandardMaterial color={night ? '#141c2a' : dusk ? '#5d5a6e' : '#7b8a86'} roughness={1} flatShading />
      </instancedMesh>
      {tod !== 'day' && (
        <instancedMesh ref={lamps} args={[dot, undefined, lights.length]}>
          <meshBasicMaterial color={night ? '#ffc477' : '#ffd8a8'} toneMapped={false} />
        </instancedMesh>
      )}
      <Highway size={size} tod={tod} />
    </group>
  )
}

/** כביש מהיר ממזרח לאתר, עם תנועה ואורות רכבים */
function Highway({ size, tod }: { size: number; tod: TimeOfDay }) {
  const x0 = size * 0.68
  const len = size * 7
  const N = 70
  const cars = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const r = rng(5)
    return Array.from({ length: N }, (_, i) => ({ lane: i % 4, z: (r() - 0.5) * len, v: 18 + r() * 14 }))
  }, [len])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const lit = tod !== 'day'
  useFrame((_, dt) => {
    for (let i = 0; i < N; i++) {
      const c = data[i]
      const dir = c.lane < 2 ? 1 : -1
      c.z += dir * c.v * Math.min(dt, 0.05)
      if (c.z > len / 2) c.z = -len / 2
      if (c.z < -len / 2) c.z = len / 2
      const x = x0 + (c.lane - 1.5) * 4.2
      m.compose(new THREE.Vector3(x, 0.8, c.z), q, new THREE.Vector3(1.9, 1.3, 4.4))
      cars.current?.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(x, 0.8, c.z + dir * 2.3), q, new THREE.Vector3(1.6, 0.35, 0.2))
      heads.current?.setMatrixAt(i, m)
    }
    if (cars.current) cars.current.instanceMatrix.needsUpdate = true
    if (heads.current) heads.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <mesh position={[x0, 0.04, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[19, len]} />
        <meshStandardMaterial color="#34383d" roughness={0.85} />
      </mesh>
      <mesh position={[x0, 0.06, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.4, len]} />
        <meshStandardMaterial color="#d9d4c4" />
      </mesh>
      <instancedMesh ref={cars} args={[box, undefined, N]}>
        <meshStandardMaterial color="#cfd3d8" metalness={0.6} roughness={0.35} />
      </instancedMesh>
      {lit && (
        <instancedMesh ref={heads} args={[box, undefined, N]}>
          <meshBasicMaterial color="#fff1cf" toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  )
}

/** סביבת תאורה רכה להשתקפויות בזכוכית ובמתכת (נבנית בתוך הסצנה, בלי הורדת קבצים) */
export function SoftEnvironment({ tod }: { tod: TimeOfDay }) {
  const warm = tod === 'sunset'
  return (
    <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={tod === 'night' ? 0.4 : 2} color={warm ? '#ffd2b0' : '#ffffff'} scale={[20, 6, 1]} position={[0, 8, -10]} />
      <Lightformer form="rect" intensity={tod === 'night' ? 0.2 : 1} color={warm ? '#ff9a6a' : '#cfe3ff'} scale={[20, 4, 1]} position={[-12, 3, 6]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={0.6} color="#8fa6c8" scale={[20, 4, 1]} position={[12, 3, 6]} rotation-y={-Math.PI / 2} />
    </Environment>
  )
}

/** עיבוד תמונה: הצללה רכה בפינות, זוהר לאורות, החלקת קצוות */
export function PostFX({ tod, low }: { tod: TimeOfDay; low: boolean }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {low ? <></> : <N8AO aoRadius={3.5} distanceFalloff={1.2} intensity={2.2} quality="medium" halfRes />}
      <Bloom mipmapBlur luminanceThreshold={tod === 'day' ? 1.2 : 0.85} luminanceSmoothing={0.2} intensity={tod === 'night' ? 1.3 : 0.8} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
      <Vignette offset={0.25} darkness={0.42} />
    </EffectComposer>
  )
}
