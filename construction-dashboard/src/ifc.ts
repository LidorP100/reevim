/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three'
import { loadScript } from './files'

/** קריאת קובץ IFC בדפדפן: הספרייה נטענת מ־CDN רק כשצריך, וקובץ ה־wasm מוגש ליד הדף */
const WEB_IFC_SRC = 'https://cdn.jsdelivr.net/npm/web-ifc@0.0.66/web-ifc-api-iife.js'
const IFCBUILDINGSTOREY = 3124254112
const IFCRELCONTAINEDINSPATIALSTRUCTURE = 3242617779
const IFCRELAGGREGATES = 160246688

export interface IfcStorey {
  name: string
  minY: number
  opaque: THREE.BufferGeometry | null
  glass: THREE.BufferGeometry | null
}
export interface ParsedIfc {
  storeys: IfcStorey[]
  size: { w: number; d: number; h: number }
  groundIndex: number
}

interface Bucket {
  name: string
  pos: number[]
  nor: number[]
  col: number[]
  gpos: number[]
  gnor: number[]
  minY: number
}

const cache = new Map<string, Promise<ParsedIfc>>()

export function loadIfc(key: string, getBytes: () => Promise<ArrayBuffer>, onStage?: (s: string) => void): Promise<ParsedIfc> {
  if (!cache.has(key)) {
    const p = (async () => {
      onStage?.('טוען את מנוע הקריאה…')
      await loadScript(WEB_IFC_SRC)
      const W = (window as any).WebIFC
      const api = new W.IfcAPI()
      const wasm = new URL('web-ifc.wasm', location.href).href
      await api.Init((path: string) => (path.endsWith('.wasm') ? wasm : path), true)
      onStage?.('מוריד את הקובץ…')
      const bytes = new Uint8Array(await getBytes())
      onStage?.('מפענח את המודל…')
      const id = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
      try {
        return parse(api, id)
      } finally {
        api.CloseModel(id)
      }
    })()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return cache.get(key)!
}

function parse(api: any, id: number): ParsedIfc {
  const storeyOf = new Map<number, number>()
  const buckets = new Map<number, Bucket>()
  const sIds = api.GetLineIDsWithType(id, IFCBUILDINGSTOREY)
  for (let i = 0; i < sIds.size(); i++) {
    const sid = sIds.get(i)
    const line = api.GetLine(id, sid)
    buckets.set(sid, { name: line?.Name?.value ?? `Storey ${i}`, pos: [], nor: [], col: [], gpos: [], gnor: [], minY: Infinity })
  }
  const rels = api.GetLineIDsWithType(id, IFCRELCONTAINEDINSPATIALSTRUCTURE)
  for (let i = 0; i < rels.size(); i++) {
    const r = api.GetLine(id, rels.get(i))
    const sid = r?.RelatingStructure?.value
    if (!buckets.has(sid)) continue
    for (const e of r.RelatedElements ?? []) storeyOf.set(e.value, sid)
  }
  // רכיבים שמורכבים מחלקים (מדרגות, קירות מסך…) — החלקים שייכים לאותה קומה
  const aggs = api.GetLineIDsWithType(id, IFCRELAGGREGATES)
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < aggs.size(); i++) {
      const r = api.GetLine(id, aggs.get(i))
      const parent = r?.RelatingObject?.value
      const sid = storeyOf.get(parent) ?? (buckets.has(parent) ? parent : undefined)
      if (sid === undefined) continue
      for (const e of r.RelatedObjects ?? []) if (!storeyOf.has(e.value)) storeyOf.set(e.value, sid)
    }

  const loose: Bucket = { name: '', pos: [], nor: [], col: [], gpos: [], gnor: [], minY: Infinity }
  const m = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  api.StreamAllMeshes(id, (mesh: any) => {
    const sid = storeyOf.get(mesh.expressID)
    const b = (sid !== undefined && buckets.get(sid)) || loose
    const gs = mesh.geometries
    for (let i = 0; i < gs.size(); i++) {
      const pg = gs.get(i)
      const geom = api.GetGeometry(id, pg.geometryExpressID)
      const verts: Float32Array = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
      const idx: Uint32Array = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())
      m.fromArray(pg.flatTransformation)
      nm.getNormalMatrix(m)
      const glass = pg.color.w < 0.95
      const P = glass ? b.gpos : b.pos
      const N = glass ? b.gnor : b.nor
      for (let k = 0; k < idx.length; k++) {
        const o = idx[k] * 6
        v.set(verts[o], verts[o + 1], verts[o + 2]).applyMatrix4(m)
        n.set(verts[o + 3], verts[o + 4], verts[o + 5]).applyMatrix3(nm).normalize()
        P.push(v.x, v.y, v.z)
        N.push(n.x, n.y, n.z)
        if (!glass) b.col.push(pg.color.x, pg.color.y, pg.color.z)
        if (v.y < b.minY) b.minY = v.y
      }
      geom.delete()
    }
  })

  const list = [...buckets.values()].filter((b) => b.pos.length || b.gpos.length)
  if (loose.pos.length || loose.gpos.length) {
    if (list.length) {
      // רכיבים בלי קומה: מצרפים לקומה שהגובה שלה הכי קרוב
      const sorted = [...list].sort((a, b) => a.minY - b.minY)
      const target = (y: number) => sorted.reduce((best, s) => (s.minY <= y + 0.3 ? s : best), sorted[0])
      for (let k = 0; k < loose.pos.length; k += 9) {
        const t = target(Math.min(loose.pos[k + 1], loose.pos[k + 4], loose.pos[k + 7]))
        t.pos.push(...loose.pos.slice(k, k + 9))
        t.nor.push(...loose.nor.slice(k, k + 9))
        t.col.push(...loose.col.slice(k, k + 9))
      }
      for (let k = 0; k < loose.gpos.length; k += 9) {
        const t = target(Math.min(loose.gpos[k + 1], loose.gpos[k + 4], loose.gpos[k + 7]))
        t.gpos.push(...loose.gpos.slice(k, k + 9))
        t.gnor.push(...loose.gnor.slice(k, k + 9))
      }
    } else list.push({ ...loose, name: 'Model' })
  }
  list.sort((a, b) => a.minY - b.minY)

  // מרכוז: מרכז אופקי ל־0, קומת הקרקע ל־0
  const box = new THREE.Box3()
  for (const b of list) for (let k = 0; k < b.pos.length; k += 3) box.expandByPoint(v.set(b.pos[k], b.pos[k + 1], b.pos[k + 2]))
  const cx = (box.min.x + box.max.x) / 2
  const cz = (box.min.z + box.max.z) / 2
  let groundIndex = list.findIndex((b) => b.minY > -2.2)
  if (groundIndex < 0) groundIndex = 0
  const y0 = list[groundIndex]?.minY ?? box.min.y
  const make = (pos: number[], nor: number[], col: number[] | null) => {
    if (!pos.length) return null
    for (let k = 0; k < pos.length; k += 3) {
      pos[k] -= cx
      pos[k + 1] -= y0
      pos[k + 2] -= cz
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeBoundingSphere()
    return g
  }
  const storeys = list.map((b) => ({ name: b.name, minY: b.minY - y0, opaque: make(b.pos, b.nor, b.col), glass: make(b.gpos, b.gnor, null) }))
  return { storeys, size: { w: box.max.x - box.min.x, d: box.max.z - box.min.z, h: box.max.y - y0 }, groundIndex }
}
