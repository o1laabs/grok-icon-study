import { computed, ref, watchEffect } from 'vue'
import { ecris, lis } from '@/ui/stockage'
import { formePlurielle, interpoler } from './format'
import { choisirLangue, estLangue, type Langue, tagDe } from './langues'
import en from './locales/en'
import zh from './locales/zh'

export { LANGUES, type Langue } from './langues'

const dictionnaires: Record<Langue, typeof zh> = { zh, en }

type Chemins<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Chemins<T[K], `${P}${K}.`>
}[keyof T & string]

export type Cle = Chemins<typeof zh>

const courante = ref<Langue>(choisirLangue(lis('langue')))

export const langue = computed<Langue>({
  get: () => courante.value,
  set: (valeur) => {
    if (!estLangue(valeur)) return
    courante.value = valeur
    ecris('langue', valeur)
  }
})

const dictionnaire = computed(() => dictionnaires[courante.value])
const tag = computed(() => tagDe(courante.value))

watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = tag.value
  document.title = t('app.title')
})

function brut(cle: Cle): string {
  const noeud = cle
    .split('.')
    .reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], dictionnaire.value)
  return noeud as string
}

export function t(cle: Cle, valeurs?: Record<string, string | number>): string {
  return interpoler(brut(cle), valeurs)
}

export function pluriel(cle: Cle, n: number, valeurs?: Record<string, string | number>): string {
  return interpoler(formePlurielle(brut(cle), n, tag.value), { n, ...valeurs })
}

export function nomDeCycle(cycle: { name: string }): string {
  return cycle.name || t('cycles.defaultName')
}

const formateurs = new Map<string, Intl.NumberFormat>()

function formateur(cle: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const memo = `${tag.value}:${cle}`
  let f = formateurs.get(memo)
  if (!f) {
    f = new Intl.NumberFormat(tag.value, options)
    formateurs.set(memo, f)
  }
  return f
}

export function nombre(valeur: number, decimales = 0): string {
  return formateur(`n${decimales}`, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  }).format(valeur)
}

export function pourcentage(fraction: number): string {
  return formateur('%', { style: 'percent', maximumFractionDigits: 0 }).format(fraction)
}

export function secondes(valeur: number): string {
  return t('units.seconds', { n: nombre(valeur, 1) })
}

export function secondesCourtes(valeur: number, decimales: number): string {
  return t('units.secondsShort', { n: nombre(valeur, decimales) })
}

export function stateName(id: string): string {
  const dict = dictionnaire.value.states as Record<string, string>
  return dict[id] ?? id
}

export function shapeName(id: string): string {
  const dict = dictionnaire.value.shapes as Record<string, string>
  return dict[id] ?? id
}
