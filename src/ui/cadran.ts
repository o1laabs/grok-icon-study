/** Angle CSS : 0 vers le haut, sens horaire, ramene sur [0, 360). */
export function tourAngle(a: number) {
  return ((Math.round(a) % 360) + 360) % 360
}

/** Angle depuis le centre d'un cadran, meme convention que `linear-gradient`. */
export function angleDepuisPointeur(el: HTMLElement, e: PointerEvent) {
  const r = el.getBoundingClientRect()
  const x = e.clientX - (r.left + r.width / 2)
  const y = e.clientY - (r.top + r.height / 2)
  return (Math.atan2(x, -y) * 180) / Math.PI
}

export const PAS_CADRAN: Record<string, number> = {
  ArrowLeft: -15,
  ArrowUp: -15,
  ArrowRight: 15,
  ArrowDown: 15
}
