export type Quaternion = readonly [number, number, number, number]
export type Point3 = readonly [number, number, number]
export type HeadPose = { turn: number; tilt: number; roll: number }

export const RADIUS = 120
const RING = 30
const FOCAL = 620
const PERSPECTIVE = 1
const QUARTER_ARC_SAMPLES = 14

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export const radians = (degrees: number) => (degrees * Math.PI) / 180

export const normalizeQuaternion = ([w, x, y, z]: Quaternion): Quaternion => {
  const length = Math.hypot(w, x, y, z) || 1
  return [w / length, x / length, y / length, z / length]
}

export const multiplyQuaternions = (
  [aw, ax, ay, az]: Quaternion,
  [bw, bx, by, bz]: Quaternion
): Quaternion =>
  normalizeQuaternion([
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw
  ])

export const quaternionFromAxisAngle = ([x, y, z]: Point3, angle: number): Quaternion => {
  const halfAngle = angle / 2
  const sine = Math.sin(halfAngle)
  return normalizeQuaternion([Math.cos(halfAngle), x * sine, y * sine, z * sine])
}

export const quaternionFromEuler = (x: number, y: number, z: number): Quaternion => {
  const xRotation = quaternionFromAxisAngle([1, 0, 0], x)
  const yRotation = quaternionFromAxisAngle([0, 1, 0], y)
  const zRotation = quaternionFromAxisAngle([0, 0, 1], z)
  return multiplyQuaternions(multiplyQuaternions(zRotation, xRotation), yRotation)
}

export const quaternionFromVectors = (from: Point3, to: Point3): Quaternion => {
  const dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2]
  const cross: Point3 = [
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0]
  ]
  return normalizeQuaternion([1 + dot, cross[0], cross[1], cross[2]])
}

export const quaternionToEuler = ([w, x, y, z]: Quaternion): Point3 => {
  const matrix00 = 1 - 2 * (y * y + z * z)
  const matrix01 = 2 * (x * y - z * w)
  const matrix10 = 2 * (x * y + z * w)
  const matrix11 = 1 - 2 * (x * x + z * z)
  const matrix20 = 2 * (x * z - y * w)
  const matrix21 = 2 * (y * z + x * w)
  const matrix22 = 1 - 2 * (x * x + y * y)
  const headX = Math.asin(clamp(matrix21, -1, 1))
  if (Math.abs(Math.cos(headX)) < 0.00001) return [headX, 0, Math.atan2(matrix10, matrix00)]
  return [headX, Math.atan2(-matrix20, matrix22), Math.atan2(-matrix01, matrix11)]
}

export const rotateWithQuaternion = ([w, x, y, z]: Quaternion, [px, py, pz]: Point3): Point3 => {
  const tx = 2 * (y * pz - z * py)
  const ty = 2 * (z * px - x * pz)
  const tz = 2 * (x * py - y * px)
  return [
    px + w * tx + (y * tz - z * ty),
    py + w * ty + (z * tx - x * tz),
    pz + w * tz + (x * ty - y * tx)
  ]
}

const nearestEquivalentAngle = (angle: number, current: number) => {
  let result = angle
  while (result - current > 180) result -= 360
  while (result - current < -180) result += 360
  return clamp(result, -365, 365)
}

// Engine eyes.js EYE_HOME: the frame where eyes rest centered. Wires, gizmo
// and eye projection share it so the grid's central meridian splits the eyes.
export const EYE_HOME: HeadPose = { turn: 17, tilt: -14, roll: 29 }

export const conjugateFlipY = ([w, x, y, z]: Quaternion): Quaternion => [w, -x, y, -z]

export const orientationOf = (pose: HeadPose): Quaternion =>
  quaternionFromEuler(radians(pose.tilt), radians(pose.turn), radians(pose.roll))

export const poseFromOrientation = (pose: HeadPose, orientation: Quaternion): HeadPose => {
  const [rx, ry, rz] = quaternionToEuler(orientation)
  return {
    tilt: nearestEquivalentAngle((rx * 180) / Math.PI, pose.tilt),
    turn: nearestEquivalentAngle((ry * 180) / Math.PI, pose.turn),
    roll: nearestEquivalentAngle((rz * 180) / Math.PI, pose.roll)
  }
}

export const visualOrientation = (pose: HeadPose, home: HeadPose = EYE_HOME): Quaternion => {
  const [w, x, y, z] = orientationOf(home)
  return multiplyQuaternions(orientationOf(pose), [w, -x, -y, -z])
}

export const screenOrientation = (pose: HeadPose, home: HeadPose = EYE_HOME): Quaternion =>
  conjugateFlipY(visualOrientation(pose, home))

export const poseFromScreen = (
  pose: HeadPose,
  screen: Quaternion,
  home: HeadPose = EYE_HOME
): HeadPose =>
  poseFromOrientation(pose, multiplyQuaternions(conjugateFlipY(screen), orientationOf(home)))

export const axisVector = (axis: 'x' | 'y' | 'z'): Point3 =>
  axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1]

export const rotatePoseAroundAxis = (pose: HeadPose, axis: 'x' | 'y' | 'z', deltaDegrees: number) => {
  const start = screenOrientation(pose)
  const worldAxis = rotateWithQuaternion(start, axisVector(axis))
  return poseFromScreen(
    pose,
    multiplyQuaternions(quaternionFromAxisAngle(worldAxis, radians(deltaDegrees)), start)
  )
}

export const rotatePoseAroundCamera = (pose: HeadPose, deltaRadians: number) =>
  poseFromScreen(
    pose,
    multiplyQuaternions(quaternionFromAxisAngle([0, 0, 1], deltaRadians), screenOrientation(pose))
  )

const arcballVector = (
  [xValue, yValue]: readonly [number, number],
  radius = RADIUS
): Point3 => {
  const x = xValue / radius
  const y = yValue / radius
  const squaredLength = x * x + y * y
  if (squaredLength <= 1) return [x, y, Math.sqrt(1 - squaredLength)]
  const length = Math.sqrt(squaredLength)
  return [x / length, y / length, 0]
}

export const rotatePoseWithArcball = (
  pose: HeadPose,
  startPoint: readonly [number, number],
  currentPoint: readonly [number, number],
  radius = RADIUS
) => {
  const start = screenOrientation(pose)
  const delta = quaternionFromVectors(
    arcballVector(startPoint, radius),
    arcballVector(currentPoint, radius)
  )
  return poseFromScreen(pose, multiplyQuaternions(delta, start))
}

export const rotationRing = (pose: HeadPose, axis: 'x' | 'y' | 'z', radius = RING): Point3[] =>
  Array.from({ length: 97 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const point: Point3 =
      axis === 'x' ? [0, cosine, sine] : axis === 'y' ? [cosine, 0, sine] : [cosine, sine, 0]
    const rotated = rotateWithQuaternion(screenOrientation(pose), point)
    return [rotated[0] * radius, rotated[1] * radius, rotated[2]]
  })

export const ringPath = (points: Point3[]) =>
  `M${points[0]![0]} ${points[0]![1]}${points
    .slice(1)
    .map((point) => `L${point[0]} ${point[1]}`)
    .join('')}Z`

export const openRingPath = (points: Point3[]) => {
  if (!points.length) return ''
  return `M${points[0]![0]} ${points[0]![1]}${points
    .slice(1)
    .map((point) => `L${point[0]} ${point[1]}`)
    .join('')}`
}

export const splitRingArcs = (points: Point3[]): { front: Point3[][]; back: Point3[][] } => {
  const front: Point3[][] = []
  const back: Point3[][] = []
  if (points.length < 2) return { front, back }
  const cut = (from: Point3, to: Point3): Point3 => {
    const span = to[2] - from[2]
    const t = Math.abs(span) < 1e-8 ? 0.5 : from[2] / -span
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      0
    ]
  }
  let current: Point3[] = [points[0]!]
  let facing = points[0]![2] >= 0
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!
    const nowFront = point[2] >= 0
    if (nowFront !== facing) {
      const mid = cut(current[current.length - 1]!, point)
      current.push(mid)
      ;(facing ? front : back).push(current)
      current = [mid, point]
      facing = nowFront
    } else {
      current.push(point)
    }
  }
  if (current.length > 1) (facing ? front : back).push(current)
  return { front, back }
}

export const unitVector = (
  from: readonly [number, number] | Point3,
  to: readonly [number, number] | Point3
): readonly [number, number] => {
  const x = to[0] - from[0]
  const y = to[1] - from[1]
  const length = Math.hypot(x, y) || 1
  return [x / length, y / length]
}

export const projectLocalPoint = (
  pose: HeadPose,
  local: Point3,
  origin: readonly [number, number] = [0, 0],
  home: HeadPose = EYE_HOME
): Point3 => {
  const rotated = rotateWithQuaternion(screenOrientation(pose, home), local)
  const scale = FOCAL / Math.max(FOCAL - rotated[2] * PERSPECTIVE, 0.0001)
  return [origin[0] + rotated[0] * scale, origin[1] + rotated[1] * scale, rotated[2]]
}

export const roundedRectangle = (width: number, height: number): (readonly [number, number])[] => {
  const halfWidth = width / 2
  const halfHeight = height / 2
  const cornerRadius = Math.min(halfHeight, halfWidth)
  const points: (readonly [number, number])[] = []
  const addLine = (start: readonly [number, number], end: readonly [number, number]) => {
    const samples = Math.max(2, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 1.5))
    for (let index = 0; index < samples; index += 1) {
      const progress = index / samples
      points.push([
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress
      ])
    }
  }
  const addArc = (centerX: number, centerY: number, startAngle: number) => {
    for (let index = 0; index < QUARTER_ARC_SAMPLES; index += 1) {
      const angle = startAngle + (index / QUARTER_ARC_SAMPLES) * (Math.PI / 2)
      points.push([
        centerX + Math.cos(angle) * cornerRadius,
        centerY + Math.sin(angle) * cornerRadius
      ])
    }
  }
  addLine([-halfWidth + cornerRadius, -halfHeight], [halfWidth - cornerRadius, -halfHeight])
  addArc(halfWidth - cornerRadius, -halfHeight + cornerRadius, -Math.PI / 2)
  addLine([halfWidth, -halfHeight + cornerRadius], [halfWidth, halfHeight - cornerRadius])
  addArc(halfWidth - cornerRadius, halfHeight - cornerRadius, 0)
  addLine([halfWidth - cornerRadius, halfHeight], [-halfWidth + cornerRadius, halfHeight])
  addArc(-halfWidth + cornerRadius, halfHeight - cornerRadius, Math.PI / 2)
  addLine([-halfWidth, halfHeight - cornerRadius], [-halfWidth, -halfHeight + cornerRadius])
  addArc(-halfWidth + cornerRadius, -halfHeight + cornerRadius, Math.PI)
  return points
}

export const projectEyePoint = (
  pose: HeadPose,
  faceX: number,
  faceY: number,
  localX: number,
  localY: number,
  angleDeg: number,
  home: HeadPose = EYE_HOME
): Point3 => {
  const angle = radians(angleDeg)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return projectFacePoint(
    pose,
    faceX + localX * cosine - localY * sine,
    faceY + localX * sine + localY * cosine,
    RADIUS,
    [0, 0],
    home
  )
}

export const projectFacePoint = (
  pose: HeadPose,
  x: number,
  y: number,
  radius: number,
  origin: readonly [number, number] = [radius, radius],
  home: HeadPose = EYE_HOME
): Point3 => {
  const diskX = x / radius
  const diskY = y / radius
  // Face coords are authored against RADIUS (original lab units) but ride the
  // visible head: rim = RADIUS scaled to the head edge in overlay units, so
  // the eye sphere silhouette lands on the head outline (engine parity).
  const rim = radius * (95 / 120)
  // Past the silhouette points stay raw on the z=0 plane and get sliced by
  // the head clip instead of folding back inward.
  const diskZ = Math.sqrt(Math.max(0, 1 - diskX * diskX - diskY * diskY))
  const local: Point3 = [diskX, diskY, diskZ]
  const rotated = rotateWithQuaternion(screenOrientation(pose, home), local)
  const depth = rotated[2] * rim
  const scale = FOCAL / Math.max(FOCAL - depth * PERSPECTIVE, 0.0001)
  return [
    origin[0] + rotated[0] * rim * scale,
    origin[1] + rotated[1] * rim * scale,
    rotated[2]
  ]
}
