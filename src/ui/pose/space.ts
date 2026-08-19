export type LocalPoint = readonly [number, number]

export type Frame = {
  x: number
  y: number
  w: number
  h: number
}

export const VIEW = 300
export const HALF = VIEW / 2
export const HEAD_RE = 114.2705

export const localHeadRadius = (svg: SVGSVGElement | null, radius = HEAD_RE) => {
  if (!svg) return 95
  const box = svg.viewBox.baseVal
  if (!box.width) return 95
  return (radius / box.width) * VIEW
}

export const toLocal = (
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number
): LocalPoint | null => {
  if (!svg) return null
  const rectangle = svg.getBoundingClientRect()
  if (rectangle.width < 1 || rectangle.height < 1) return null
  return [
    ((clientX - rectangle.left) / rectangle.width) * VIEW - HALF,
    ((clientY - rectangle.top) / rectangle.height) * VIEW - HALF
  ]
}

export const overlayToHost = (
  host: SVGSVGElement | null,
  x: number,
  y: number
): LocalPoint | null => {
  if (!host) return null
  const box = host.viewBox.baseVal
  const w = box.width || VIEW
  const h = box.height || VIEW
  return [box.x + ((x + HALF) / VIEW) * w, box.y + ((y + HALF) / VIEW) * h]
}

export const hostToLocal = (
  host: SVGSVGElement | null,
  x: number,
  y: number
): LocalPoint | null => {
  if (!host) return null
  const matrix = host.getScreenCTM()
  if (!matrix) return toLocal(host, x, y)
  const point = host.createSVGPoint()
  point.x = x
  point.y = y
  const screen = point.matrixTransform(matrix)
  return toLocal(host, screen.x, screen.y)
}

export const mapElementPoint = (
  el: SVGGraphicsElement,
  x: number,
  y: number,
  host: SVGSVGElement | null
): LocalPoint | null => {
  const svg = el.ownerSVGElement
  const screenMatrix = el.getScreenCTM()
  const localMatrix = el.getCTM()
  const hostMatrix = host?.getScreenCTM()
  if (!svg || (!screenMatrix && (!localMatrix || !hostMatrix))) return null
  const point = svg.createSVGPoint()
  point.x = x
  point.y = y
  const screen = screenMatrix
    ? point.matrixTransform(screenMatrix)
    : point.matrixTransform(localMatrix!).matrixTransform(hostMatrix!)
  return toLocal(host ?? svg, screen.x, screen.y)
}

export const frameOf = (
  el: SVGGraphicsElement | null | undefined,
  overlay: SVGSVGElement | null
): Frame | null => {
  if (!el || !overlay) return null
  if (el.style.display === 'none') return null
  const box = el.getBoundingClientRect()
  const host = overlay.getBoundingClientRect()
  if (box.width < 0.5 || box.height < 0.5 || host.width < 1) return null
  const sx = VIEW / host.width
  const sy = VIEW / host.height
  return {
    x: (box.left + box.width / 2 - host.left) * sx - HALF,
    y: (box.top + box.height / 2 - host.top) * sy - HALF,
    w: box.width * sx,
    h: box.height * sy
  }
}
