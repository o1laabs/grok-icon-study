/**
 * Capture replica : serialise le SVG vivant (aplatit les var CSS) et rejoue
 * hors ecran via GrokCharacter.step, sans rAF.
 */

import type { Block } from '@/editor/cycles'
import { mountReplica, type ReplicaInput } from '@/replica/host'
import { gifAnime, gifIndexe, indexe, nouvellePalette, recense, svgAnime } from './anime'
import { arrete, demiEcran, sansCommentaires, viewBoxExport } from './export'

export function svgAutonome(svg: SVGSVGElement, taille: number, viewBox = viewBoxExport()) {
  const clone = flattenSvg(svg)
  clone.removeAttribute('class')
  clone.removeAttribute('style')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('viewBox', viewBox)
  clone.setAttribute('width', String(taille))
  clone.setAttribute('height', String(taille))
  return sansCommentaires(new XMLSerializer().serializeToString(clone))
}

function flattenSvg(root: SVGSVGElement) {
  const clone = root.cloneNode(true) as SVGSVGElement
  const walk = (src: Element, dst: Element) => {
    const cs = getComputedStyle(src)
    for (const attr of ['fill', 'stroke'] as const) {
      const raw = src.getAttribute(attr)
      if (raw?.includes('var(')) dst.setAttribute(attr, cs[attr])
    }
    const style = src.getAttribute('style')
    if (style?.includes('var(')) {
      let next = style
      if (/fill\s*:/.test(style)) next = next.replace(/fill\s*:\s*var\([^)]+\)/g, `fill:${cs.fill}`)
      if (/stroke\s*:/.test(style)) {
        next = next.replace(/stroke\s*:\s*var\([^)]+\)/g, `stroke:${cs.stroke}`)
      }
      dst.setAttribute('style', next)
    }
    const kids = [...src.children]
    const copies = [...dst.children]
    for (let i = 0; i < kids.length; i++) walk(kids[i]!, copies[i]!)
  }
  walk(root, clone)
  return clone
}

async function dessine(
  markup: string,
  taille: number,
  canvas: HTMLCanvasElement,
  fond: string | null = null
) {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    canvas.width = taille
    canvas.height = taille
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas indisponible')
    ctx.clearRect(0, 0, taille, taille)
    if (fond) {
      ctx.fillStyle = fond
      ctx.fillRect(0, 0, taille, taille)
    }
    ctx.drawImage(img, 0, 0, taille, taille)
    return ctx
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function versPng(markup: string, taille: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  await dessine(markup, taille, canvas)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encodage png impossible'))),
      'image/png'
    )
  })
}

export function telecharge(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = nom
    a.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

export function copiePossible() {
  return (
    typeof ClipboardItem !== 'undefined' &&
    !!navigator.clipboard?.write &&
    (ClipboardItem.supports?.('image/png') ?? true)
  )
}

export async function copie(blob: Promise<Blob>) {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export async function copieTexte(texte: string) {
  await navigator.clipboard.writeText(texte)
}

export type Avancement = (fait: number, total: number) => void

export interface ReglagesBot {
  shape: string
  color: string
  expression: string
  state?: string
}

function inputOf(reglages: ReglagesBot, taille: number, paper?: string): ReplicaInput {
  return {
    state: reglages.state ?? reglages.expression,
    shape: reglages.shape,
    color: reglages.color,
    follow: false,
    paper: paper ?? '#f9f9f9',
    size: taille
  }
}

async function ouvreBot(reglages: ReglagesBot, taille: number, paper?: string) {
  const hote = document.createElement('div')
  hote.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  hote.appendChild(svg)
  document.body.appendChild(hote)
  const mount = await mountReplica(svg, inputOf(reglages, taille, paper), false, { driven: true })
  if (!mount) {
    hote.remove()
    throw new Error('replica hors ecran indisponible')
  }
  return { hote, svg, mount }
}

export async function cycleVersMp4(
  reglages: ReglagesBot,
  blocs: Block[],
  taille: number,
  images: number,
  pas: number,
  fond: string,
  avance?: Avancement,
  signal?: AbortSignal
): Promise<Blob> {
  const { versMp4 } = await import('./video')
  const canvas = document.createElement('canvas')
  const lecteur = await ouvreCycle(reglages, blocs, taille, fond)
  try {
    return await versMp4(
      canvas,
      images,
      Math.round(1 / pas),
      async (i) => {
        const svg = await lecteur.rendre(i * pas)
        await dessine(svgAutonome(svg, taille, viewBoxExport(demiEcran())), taille, canvas, fond)
      },
      avance,
      signal
    )
  } finally {
    lecteur.ferme()
  }
}

export async function cycleVersGif(
  reglages: ReglagesBot,
  blocs: Block[],
  taille: number,
  images: number,
  pas: number,
  fond: string | null,
  avance?: Avancement,
  signal?: AbortSignal
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const vue = viewBoxExport(demiEcran())
  const lecteur = await ouvreCycle(reglages, blocs, taille, fond ?? undefined)

  const passe = async (lis: (index: number, pixels: Uint8ClampedArray) => void) => {
    for (let i = 0; i < images; i++) {
      arrete(signal)
      const svg = await lecteur.rendre(i * pas)
      const ctx = await dessine(svgAutonome(svg, taille, vue), taille, canvas, fond)
      lis(i, ctx.getImageData(0, 0, taille, taille).data)
    }
  }

  try {
    const palette = nouvellePalette()
    await passe((i, pixels) => {
      recense(palette, pixels)
      avance?.(i + 1, images * 2)
    })
    const morceaux: Uint8Array[] = []
    await passe((i, pixels) => {
      morceaux.push(indexe(palette, pixels))
      avance?.(images + i + 1, images * 2)
    })
    return new Blob([gifIndexe(palette, morceaux, taille, taille, Math.round(pas * 1000))], {
      type: 'image/gif'
    })
  } finally {
    lecteur.ferme()
  }
}

export interface LecteurHorsEcran {
  rendre: (t: number) => Promise<SVGSVGElement>
  ferme: () => void
}

export async function ouvreCycle(
  reglages: ReglagesBot,
  blocs: Block[],
  taille: number,
  paper?: string
): Promise<LecteurHorsEcran> {
  const { blockAt } = await import('@/editor/cycles')
  let session = await ouvreBot({ ...reglages, state: blocs[0]?.state ?? 'idle' }, taille, paper)
  let clock = 0

  const reset = async () => {
    session.mount.destroy()
    session.hote.remove()
    session = await ouvreBot({ ...reglages, state: blocs[0]?.state ?? 'idle' }, taille, paper)
    clock = 0
  }

  return {
    rendre: async (t) => {
      if (t < clock - 1e-6) await reset()
      const pas = 1 / 30
      while (clock < t - 1e-9) {
        const next = Math.min(t, clock + pas)
        const { index } = blockAt(blocs, next)
        const want = blocs[index]?.state ?? 'idle'
        session.mount.setState(want)
        session.mount.step(next - clock)
        clock = next
      }
      return session.svg
    },
    ferme: () => {
      session.mount.destroy()
      session.hote.remove()
    }
  }
}

function cssTransform(svgTransform: string) {
  return svgTransform.replace(/([a-z]+)\(([^)]+)\)/gi, (_m, fn: string, args: string) => {
    return `${fn}(${args.trim().split(/[\s,]+/).join(', ')})`
  })
}

function matricesDesYeux(svg: SVGSVGElement) {
  return [...svg.querySelectorAll('g[clip-path] path')].map((e) =>
    cssTransform(e.getAttribute('transform') || 'translate(0 0)')
  )
}

export async function versSvgAnime(
  reglages: ReglagesBot,
  taille: number,
  nombre: number,
  pas: number
): Promise<Blob> {
  const { hote, svg, mount } = await ouvreBot(reglages, taille)
  try {
    let base = ''
    const matrices: string[][] = []
    for (let i = 0; i < nombre; i++) {
      if (i > 0) mount.step(pas)
      if (i === 0) base = svgAutonome(svg, taille)
      matrices.push(matricesDesYeux(svg))
    }
    return new Blob([svgAnime(base, matrices, +((nombre - 1) * pas).toFixed(3))], {
      type: 'image/svg+xml'
    })
  } finally {
    mount.destroy()
    hote.remove()
  }
}

export async function versGifAnime(
  reglages: ReglagesBot,
  taille: number,
  nombre: number,
  pas: number,
  fond: string | null
): Promise<Blob> {
  const { hote, svg, mount } = await ouvreBot(reglages, taille, fond ?? undefined)
  const canvas = document.createElement('canvas')
  try {
    const images: Uint8ClampedArray[] = []
    for (let i = 0; i < nombre; i++) {
      if (i > 0) mount.step(pas)
      const ctx = await dessine(svgAutonome(svg, taille), taille, canvas, fond)
      images.push(ctx.getImageData(0, 0, taille, taille).data)
    }
    return new Blob([gifAnime(images, taille, taille, Math.round(pas * 1000))], {
      type: 'image/gif'
    })
  } finally {
    mount.destroy()
    hote.remove()
  }
}
