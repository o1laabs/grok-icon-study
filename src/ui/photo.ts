/**
 * Mode photo : composition du cadrage, fonds et assemblage du SVG final.
 * Pur — aucun DOM. Le cadre fait 300 unites (viewBox -150 -150 300 300) :
 * en CSS, translate(x/3 %) sur un cadre carre egale translate(x) en SVG,
 * et scale() d'origine centre egale au couple translate/scale autour de 0.
 */

export type CompositionPhoto = Readonly<{
  x: number
  y: number
  scale: number
  cornerRadius: number
}>

export const COMPOSITION_DEFAUT: CompositionPhoto = { x: 0, y: 0, scale: 1, cornerRadius: 0 }

const borne = (valeur: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(valeur) ? valeur : min))

const arrondi = (valeur: number, decimales = 1) => Number(valeur.toFixed(decimales))

export const normaliseComposition = (c: CompositionPhoto): CompositionPhoto => ({
  x: arrondi(borne(c.x, -180, 180)),
  y: arrondi(borne(c.y, -180, 180)),
  scale: arrondi(borne(c.scale, 0.4, 3), 3),
  cornerRadius: arrondi(borne(c.cornerRadius, 0, 50))
})

/** Pourcent (0-50) vers unites viewBox du cadre 300. */
export const rayonCoins = (cornerRadius: number) => borne(cornerRadius, 0, 50) * 3

export type FondPhoto = 'transparent' | 'solid' | 'linear' | 'radial'

/** Direction du linear en degres CSS : 0 = vers le haut, 135 = vers le bas-droite. */
export const ANGLE_DEFAUT = 135

export type OptionsPhoto = {
  fond: FondPhoto
  couleurDe: string
  couleurA: string
  angle: number
  taille: number
  composition: CompositionPhoto
}

/** Fond CSS du cadre vivant — meme geometrie que `degrades`/`rectFond`. */
export function fondCss(
  fond: FondPhoto,
  couleurDe: string,
  couleurA: string,
  angle: number = ANGLE_DEFAUT
) {
  if (fond === 'solid') return couleurDe
  if (fond === 'linear') return `linear-gradient(${angle}deg, ${couleurDe}, ${couleurA})`
  if (fond === 'radial') return `radial-gradient(circle at 50% 42%, ${couleurDe}, ${couleurA})`
  return undefined
}

const degrades = (o: OptionsPhoto) => {
  if (o.fond === 'linear') {
    /*
     * Le repere du cadre est carre : pivoter le vecteur diagonale (0,0)→(1,1)
     * autour du centre egale exactement l'angle CSS, la diagonale valant 135°.
     */
    const rotation = Math.round(o.angle) - 135
    const transform = rotation % 360 === 0 ? '' : ` gradientTransform="rotate(${rotation} 0.5 0.5)"`
    return `<linearGradient id="photo-linear" x1="0" y1="0" x2="1" y2="1"${transform}><stop offset="0" stop-color="${o.couleurDe}"/><stop offset="1" stop-color="${o.couleurA}"/></linearGradient>`
  }
  if (o.fond === 'radial') {
    return `<radialGradient id="photo-radial" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${o.couleurDe}"/><stop offset="1" stop-color="${o.couleurA}"/></radialGradient>`
  }
  return ''
}

const rectFond = (o: OptionsPhoto) => {
  if (o.fond === 'transparent') return ''
  const fill = o.fond === 'solid' ? o.couleurDe : `url(#photo-${o.fond})`
  return `<rect x="-150" y="-150" width="300" height="300" fill="${fill}"/>`
}

/**
 * Enveloppe l'avatar autonome (sortie de `svgAutonome` en 300 x 300) dans le
 * cadre photo : degrade, fond, coins arrondis, translation et echelle.
 */
export function svgPhoto(markup: string, options: OptionsPhoto) {
  const o = { ...options, composition: normaliseComposition(options.composition) }
  const c = o.composition
  const interne = markup.replace('<svg ', '<svg x="-150" y="-150" ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 300 300" width="${o.taille}" height="${o.taille}" role="img">
  <defs>${degrades(o)}<clipPath id="photo-cadre"><rect x="-150" y="-150" width="300" height="300" rx="${rayonCoins(c.cornerRadius)}"/></clipPath></defs>
  <g clip-path="url(#photo-cadre)">${rectFond(o)}<g transform="translate(${c.x} ${c.y}) scale(${c.scale})">${interne}</g></g>
</svg>`
}

/* ------------------------------------------------------------------ */
/* Palettes aleatoires OKLch, contraste >= 3:1 avec la couleur du corps */
/* ------------------------------------------------------------------ */

export type StylePalette = 'solid' | 'linear' | 'radial'

export type PalettePhoto = {
  couleurDe: string
  couleurA: string
}

type CouleurOklch = {
  lightness: number
  chroma: number
  hue: number
}

const hexVersRgb = (hex: string) => {
  const normalise = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalise)) return null
  return {
    red: Number.parseInt(normalise.slice(0, 2), 16),
    green: Number.parseInt(normalise.slice(2, 4), 16),
    blue: Number.parseInt(normalise.slice(4, 6), 16)
  }
}

const luminanceRelative = (hex: string) => {
  const rgb = hexVersRgb(hex)
  if (!rgb) return 0
  const canal = (valeur: number) => {
    const normalise = valeur / 255
    return normalise <= 0.04045
      ? normalise / 12.92
      : ((normalise + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(rgb.red) + 0.7152 * canal(rgb.green) + 0.0722 * canal(rgb.blue)
}

export const contrastePalette = (premiere: string, seconde: string) => {
  const l1 = luminanceRelative(premiere)
  const l2 = luminanceRelative(seconde)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const bornePalette = (valeur: number, min = 0, max = 1) =>
  Math.min(Math.max(valeur, min), max)

const lineaireVersSrgb = (valeur: number) => {
  const normalise = bornePalette(valeur)
  return normalise <= 0.0031308
    ? normalise * 12.92
    : 1.055 * normalise ** (1 / 2.4) - 0.055
}

const canalVersHex = (valeur: number) =>
  Math.round(bornePalette(valeur) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()

const oklchVersHex = ({ lightness, chroma, hue }: CouleurOklch) => {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lPrime ** 3
  const m = mPrime ** 3
  const s = sPrime ** 3
  const red = lineaireVersSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const green = lineaireVersSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const blue = lineaireVersSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return `#${canalVersHex(red)}${canalVersHex(green)}${canalVersHex(blue)}`
}

const memePalette = (a: PalettePhoto, b: PalettePhoto) =>
  a.couleurDe.toLowerCase() === b.couleurDe.toLowerCase() &&
  a.couleurA.toLowerCase() === b.couleurA.toLowerCase()

const contrasteMinimal = (palette: PalettePhoto, avantPlan: string) =>
  Math.min(
    contrastePalette(palette.couleurDe, avantPlan),
    contrastePalette(palette.couleurA, avantPlan)
  )

const teinteEssai = (alea: () => number, essai: number) =>
  (alea() * 360 + essai * 137.508) % 360

const generePalette = (
  style: StylePalette,
  fondSombre: boolean,
  alea: () => number,
  essai: number
): PalettePhoto => {
  const teinte = teinteEssai(alea, essai)
  const chroma = 0.065 + alea() * 0.055

  if (style === 'solid') {
    const lightness = fondSombre ? 0.3 + alea() * 0.14 : 0.78 + alea() * 0.13
    const couleur = oklchVersHex({ lightness, chroma, hue: teinte })
    return { couleurDe: couleur, couleurA: couleur }
  }

  const decalTeinte = 18 + alea() * 38
  const secondeTeinte = (teinte + (alea() > 0.5 ? decalTeinte : -decalTeinte) + 360) % 360
  if (style === 'radial') {
    const lCentre = fondSombre ? 0.36 : 0.94
    const lBord = fondSombre ? 0.12 : 0.7
    return {
      couleurDe: oklchVersHex({ lightness: lCentre, chroma: chroma * 0.82, hue: teinte }),
      couleurA: oklchVersHex({
        lightness: lBord,
        chroma: chroma * (fondSombre ? 0.42 : 0.85),
        hue: secondeTeinte
      })
    }
  }

  const lDebut = fondSombre ? 0.38 : 0.92
  const lFin = fondSombre ? 0.2 : 0.74
  return {
    couleurDe: oklchVersHex({ lightness: lDebut, chroma, hue: teinte }),
    couleurA: oklchVersHex({ lightness: lFin, chroma: chroma * 0.9, hue: secondeTeinte })
  }
}

export const paletteAleatoire = (
  style: StylePalette,
  avantPlan: string,
  actuelle: PalettePhoto,
  alea: () => number = Math.random
): PalettePhoto => {
  const contrasteSombre = contrastePalette(avantPlan, '#15191F')
  const contrasteClair = contrastePalette(avantPlan, '#F2E8D4')
  const fondSombre =
    contrasteSombre >= 3 && contrasteClair >= 3
      ? alea() >= 0.5
      : contrasteSombre >= contrasteClair
  let meilleure: PalettePhoto | null = null
  let meilleurContraste = 0

  for (let essai = 0; essai < 24; essai += 1) {
    const palette = generePalette(style, fondSombre, alea, essai)
    if (memePalette(palette, actuelle)) continue
    const contraste = contrasteMinimal(palette, avantPlan)
    if (contraste >= 3) return palette
    if (contraste > meilleurContraste) {
      meilleure = palette
      meilleurContraste = contraste
    }
  }

  return meilleure ?? generePalette(style, fondSombre, alea, 25)
}
