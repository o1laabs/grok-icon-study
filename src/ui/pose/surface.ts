import {
  projectLocalPoint,
  radians,
  rotateWithQuaternion,
  screenOrientation,
  type HeadPose,
  type Point3
} from './math'

export type SurfaceType = 'sphere' | 'ellipsoid' | 'capsule' | 'cube' | 'cone' | 'diamond'

export type SurfaceConfig = {
  type: SurfaceType
  width: number
  height: number
  depth: number
  roundness: number
}

type Kind = { type: SurfaceType; roundness?: number; depthScale?: number }

const KIND: Record<string, Kind> = {
  blob: { type: 'sphere' },
  bean: { type: 'capsule' },
  egg: { type: 'ellipsoid' },
  teardrop: { type: 'cone', roundness: 0.7 },
  cloud: { type: 'ellipsoid', depthScale: 0.58 },
  leaf: { type: 'diamond', roundness: 0.35 },
  squircle: { type: 'cube', roundness: 0.55 },
  capsule: { type: 'capsule' }
}

type Sample = { point: Point3; normal: Point3 }

const signedPow = (value: number, exp: number) => Math.sign(value) * Math.abs(value) ** exp

const normalize = ([x, y, z]: Point3): Point3 => {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

const measure = (id: string): { width: number; height: number } => {
  const geo = window.GROK_GEO
  const shape = geo?.shapes?.[id] as
    | { path?: string; radius?: number; top?: number; bottom?: number }
    | undefined
  const Re = geo?.Re ?? 114.27
  const flatten = (
    window as unknown as { GROK_MATH?: { flattenPath?: (d: string, step?: number) => number[][] } }
  ).GROK_MATH?.flattenPath
  if (shape?.path && flatten) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const pair of flatten(shape.path, 8)) {
      const x = pair[0]!
      const y = pair[1]!
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    if (Number.isFinite(minX)) return { width: maxX - minX, height: maxY - minY }
  }
  const height =
    shape?.bottom != null && shape.top != null ? shape.bottom - shape.top : Re * 2
  return { width: (shape?.radius ?? Re) * 2, height }
}

const surfaceCache = new Map<string, SurfaceConfig>()

export const surfaceOf = (shape: string): SurfaceConfig => {
  const hit = surfaceCache.get(shape)
  if (hit) return hit
  const kind = KIND[shape] ?? { type: 'ellipsoid' as const }
  const { width, height } = measure(shape)
  const depth = width * (kind.depthScale ?? (kind.type === 'cube' ? 0.9 : 1))
  const surface: SurfaceConfig = {
    type: kind.type,
    width,
    height,
    depth,
    roundness: kind.roundness ?? 1
  }
  surfaceCache.set(shape, surface)
  return surface
}

const cubeExp = (roundness: number) => {
  if (roundness <= 0) return Infinity
  const power = 0.04 + (Math.min(2, roundness) / 2) * 0.96
  return 2 / power
}

const diamondExp = (roundness: number) => 1 + Math.min(2, Math.max(0, roundness)) / 2

const lpPoint = (config: SurfaceConfig, lon: number, lat: number, exp: number): Point3 => {
  const sx = Math.cos(lat) * Math.sin(lon)
  const sy = Math.sin(lat)
  const sz = Math.cos(lat) * Math.cos(lon)
  const length = Number.isFinite(exp)
    ? (Math.abs(sx) ** exp + Math.abs(sy) ** exp + Math.abs(sz) ** exp) ** (1 / exp) || 1
    : Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)) || 1
  return [(config.width / 2) * (sx / length), (config.height / 2) * (sy / length), (config.depth / 2) * (sz / length)]
}

const ellipsoid = (config: SurfaceConfig, lon: number, lat: number): Point3 => [
  (config.width / 2) * Math.cos(lat) * Math.sin(lon),
  (config.height / 2) * Math.sin(lat),
  (config.depth / 2) * Math.cos(lat) * Math.cos(lon)
]

const capsule = (config: SurfaceConfig, lon: number, lat: number): Point3 => {
  const rx = config.width / 2
  const rz = config.depth / 2
  const cap = Math.min(rx, config.height / 2)
  const mid = Math.max(0, config.height / 2 - cap)
  const meridian = mid * 2 + Math.PI * cap
  const distance = ((lat + Math.PI / 2) / Math.PI) * meridian
  let radial = rx
  let y = 0
  if (distance < (Math.PI * cap) / 2) {
    const angle = -Math.PI / 2 + distance / cap
    radial = rx * Math.cos(angle)
    y = -mid + cap * Math.sin(angle)
  } else if (distance <= (Math.PI * cap) / 2 + mid * 2) {
    y = -mid + distance - (Math.PI * cap) / 2
  } else {
    const angle = (distance - (Math.PI * cap) / 2 - mid * 2) / cap
    radial = rx * Math.cos(angle)
    y = mid + cap * Math.sin(angle)
  }
  return [radial * Math.sin(lon), y, radial * (rx ? rz / rx : 1) * Math.cos(lon)]
}

const cone = (config: SurfaceConfig, lon: number, lat: number): Point3 => {
  const t = (lat + Math.PI / 2) / Math.PI
  const tip = 0.16 * config.roundness
  const base = 0.28 * config.roundness
  let radiusScale: number
  let yT = t
  if (tip > 0 && t < tip) {
    const a = (t / tip) * (Math.PI / 2)
    radiusScale = tip * Math.sin(a)
    yT = tip * (1 - Math.cos(a))
  } else if (base > 0 && t > 1 - base) {
    const a = ((t - (1 - base)) / base) * (Math.PI / 2)
    radiusScale = 1 - base + base * Math.cos(a)
    yT = 1 - base + base * Math.sin(a)
  } else {
    const span = 1 - tip - base
    const u = span > 0 ? (t - tip) / span : 0
    radiusScale = tip + (1 - base - tip) * u
  }
  return [
    (config.width / 2) * radiusScale * Math.sin(lon),
    -config.height / 2 + config.height * yT,
    (config.depth / 2) * radiusScale * Math.cos(lon)
  ]
}

export const surfacePointAt = (config: SurfaceConfig, lon: number, lat: number): Point3 => {
  switch (config.type) {
    case 'sphere':
    case 'ellipsoid':
      return ellipsoid(config, lon, lat)
    case 'capsule':
      return capsule(config, lon, lat)
    case 'cube':
      return lpPoint(config, lon, lat, cubeExp(config.roundness))
    case 'diamond':
      return lpPoint(config, lon, lat, diamondExp(config.roundness))
    case 'cone':
      return cone(config, lon, lat)
  }
}

const lpNormal = (config: SurfaceConfig, point: Point3, exp: number): Point3 => {
  const rx = config.width / 2 || 1
  const ry = config.height / 2 || 1
  const rz = config.depth / 2 || 1
  if (!Number.isFinite(exp)) {
    const n: Point3 = [point[0] / rx, point[1] / ry, point[2] / rz]
    const axis = n.reduce((i, v, j, a) => (Math.abs(v) > Math.abs(a[i]!) ? j : i), 0)
    return normalize([axis === 0 ? Math.sign(n[0]) : 0, axis === 1 ? Math.sign(n[1]) : 0, axis === 2 ? Math.sign(n[2]) : 0])
  }
  return normalize([
    signedPow(point[0] / rx, exp - 1) / rx,
    signedPow(point[1] / ry, exp - 1) / ry,
    signedPow(point[2] / rz, exp - 1) / rz
  ])
}

const tangentNormal = (config: SurfaceConfig, lon: number, lat: number): Point3 => {
  const eps = 0.0006
  const beforeLon = surfacePointAt(config, lon - eps, lat)
  const afterLon = surfacePointAt(config, lon + eps, lat)
  const beforeLat = surfacePointAt(config, lon, Math.max(-Math.PI / 2, lat - eps))
  const afterLat = surfacePointAt(config, lon, Math.min(Math.PI / 2, lat + eps))
  const dx: Point3 = [afterLon[0] - beforeLon[0], afterLon[1] - beforeLon[1], afterLon[2] - beforeLon[2]]
  const dy: Point3 = [afterLat[0] - beforeLat[0], afterLat[1] - beforeLat[1], afterLat[2] - beforeLat[2]]
  return normalize([
    dx[1] * dy[2] - dx[2] * dy[1],
    dx[2] * dy[0] - dx[0] * dy[2],
    dx[0] * dy[1] - dx[1] * dy[0]
  ])
}

const sampleAt = (config: SurfaceConfig, lon: number, lat: number): Sample => {
  const point = surfacePointAt(config, lon, lat)
  if (config.type === 'sphere' || config.type === 'ellipsoid') {
    const rx = config.width / 2 || 1
    const ry = config.height / 2 || 1
    const rz = config.depth / 2 || 1
    return {
      point,
      normal: normalize([point[0] / (rx * rx), point[1] / (ry * ry), point[2] / (rz * rz)])
    }
  }
  if (config.type === 'cube') return { point, normal: lpNormal(config, point, cubeExp(config.roundness)) }
  if (config.type === 'diamond') return { point, normal: lpNormal(config, point, diamondExp(config.roundness)) }
  return { point, normal: tangentNormal(config, lon, lat) }
}

const keyOf = (surface: SurfaceConfig) =>
  `${surface.type}:${surface.width.toFixed(2)}:${surface.height.toFixed(2)}:${surface.depth.toFixed(2)}:${surface.roundness}`

const cache = new Map<string, Sample[][]>()

const curvesOf = (surface: SurfaceConfig): Sample[][] => {
  const key = keyOf(surface)
  const hit = cache.get(key)
  if (hit) return hit
  const parallels = [-60, -30, 0, 30, 60].map((lat) =>
    Array.from({ length: 73 }, (_, i) => sampleAt(surface, radians(-180 + i * 5), radians(lat)))
  )
  const meridians = Array.from({ length: 12 }, (_, i) => -150 + i * 30).map((lon) =>
    Array.from({ length: 37 }, (_, step) => sampleAt(surface, radians(lon), radians(-90 + step * 5)))
  )
  const curves = [...parallels, ...meridians]
  if (cache.size > 24) cache.delete(cache.keys().next().value!)
  cache.set(key, curves)
  return curves
}

const polyline = (points: Point3[]) => {
  if (points.length < 2) return ''
  return `M${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}${points
    .slice(1)
    .map((point) => `L${point[0].toFixed(2)} ${point[1].toFixed(2)}`)
    .join('')}`
}

const visibleWire = (samples: Sample[], pose: HeadPose, origin: readonly [number, number]) => {
  const orientation = screenOrientation(pose)
  const segments: Point3[][] = []
  let segment: Point3[] = []
  for (const sample of samples) {
    const facing = rotateWithQuaternion(orientation, sample.normal)[2] > 0
    if (facing) segment.push(projectLocalPoint(pose, sample.point, origin))
    else if (segment.length) {
      segments.push(segment)
      segment = []
    }
  }
  if (segment.length) segments.push(segment)
  return segments
    .filter((item) => item.length > 1)
    .map(polyline)
    .join('')
}

export const wirePaths = (
  pose: HeadPose,
  surface: SurfaceConfig,
  origin: readonly [number, number] = [0, 0]
): string[] => curvesOf(surface).map((curve) => visibleWire(curve, pose, origin)).filter(Boolean)
