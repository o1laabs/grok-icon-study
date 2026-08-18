/**
 * Cadrage et nommage des images exportees. Pur : aucun DOM.
 * Le cadre serre (avatar au repos) et le cadre ecran (cycle, anneaux) suivent
 * Bloub : 1,15 × 1,08 autour du rayon, et 1,58 pour loger les overlay.
 */

const MARGE = 1.08
const RAYON_MAX = 1.15
const ECRAN = 1.58

export function rayonMoteur() {
  return window.GROK_GEO?.Re ?? 114.27
}

export function demiCadre() {
  return Math.ceil(rayonMoteur() * RAYON_MAX * MARGE)
}

export function demiEcran() {
  return rayonMoteur() * ECRAN
}

export function viewBoxExport(demi = demiCadre()) {
  const mid = rayonMoteur()
  return `${(mid - demi).toFixed(2)} ${(mid - demi).toFixed(2)} ${(demi * 2).toFixed(2)} ${(demi * 2).toFixed(2)}`
}

export type ActionId = 'png' | 'svg' | 'anime' | 'gif' | 'copie' | 'copieSvg'
export type ModeExport = 'telecharge' | 'anime' | 'gif' | 'copieImage' | 'copieTexte'

export interface ActionExport {
  id: ActionId
  mode: ModeExport
  taille: number
  extension: 'png' | 'svg' | 'gif'
  suffixe?: string
}

export const ANIM_CLES_PAR_SEC = 30
export const ANIM_SECONDES = 3
export const ANIM_IMAGES = ANIM_CLES_PAR_SEC * ANIM_SECONDES
export const ANIM_PAS = 1 / ANIM_CLES_PAR_SEC

export const GIF_FPS = 20
export const GIF_IMAGES = GIF_FPS * ANIM_SECONDES
export const GIF_PAS = 1 / GIF_FPS
export const GIF_TAILLE = 320

export type FormatCycle = 'mp4' | 'gif'
export const FORMATS_CYCLE: FormatCycle[] = ['mp4', 'gif']
export const FORMAT_CYCLE_DEFAUT: FormatCycle = 'mp4'

export const CYCLE_FPS = { gif: 20, mp4: 30 } as const
export const CYCLE_TAILLE = { gif: 320, mp4: 1024 } as const
export const cyclePas = (format: FormatCycle) => 1 / CYCLE_FPS[format]
export const cycleImages = (duree: number, format: FormatCycle) =>
  Math.max(1, Math.round(duree * CYCLE_FPS[format]))
export const cycleAccepteTransparence = (format: FormatCycle) => format === 'gif'

export type FondGif = 'blanc' | 'transparent'
export const FONDS_GIF: FondGif[] = ['blanc', 'transparent']
export const FOND_GIF_DEFAUT: FondGif = 'blanc'
export const BLANC = '#ffffff'
export const couleurDeFond = (fond: FondGif) => (fond === 'blanc' ? BLANC : null)

export const ACTIONS: ActionExport[] = [
  { id: 'png', mode: 'telecharge', taille: 1024, extension: 'png' },
  { id: 'svg', mode: 'telecharge', taille: 0, extension: 'svg' },
  { id: 'anime', mode: 'anime', taille: 0, extension: 'svg', suffixe: 'anime' },
  { id: 'gif', mode: 'gif', taille: GIF_TAILLE, extension: 'gif' },
  { id: 'copie', mode: 'copieImage', taille: 1024, extension: 'png' },
  { id: 'copieSvg', mode: 'copieTexte', taille: 0, extension: 'svg' }
]

export const ACTION_BY_ID = new Map<string, ActionExport>(ACTIONS.map((a) => [a.id, a]))
export const ACTION_DEFAUT: ActionId = 'png'

export function tailleAction(action: ActionExport) {
  return action.taille || demiCadre() * 2
}

export type EtatExport = 'pret' | 'occupe' | 'exporte' | 'copie' | 'erreur'

export function sansCommentaires(markup: string) {
  return markup.replace(/<!--[\s\S]*?-->/g, '')
}

export function nomFichier(
  forme: string,
  expression: string,
  couleur: string,
  extension: string,
  suffixe = ''
) {
  const propre = (v: string) =>
    v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  const morceaux = [propre(forme), propre(expression), propre(couleur), propre(suffixe)].filter(
    Boolean
  )
  return `study${morceaux.map((m) => `-${m}`).join('')}.${extension}`
}

export function videoPossible() {
  return typeof VideoEncoder !== 'undefined'
}

export class Abandon extends Error {
  constructor() {
    super('export abandonne')
    this.name = 'Abandon'
  }
}

export function arrete(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new Abandon()
}
