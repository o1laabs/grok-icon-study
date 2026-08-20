export const LANGUES = [
  { id: 'zh', tag: 'zh-Hans', emoji: '🇨🇳', nom: '简体中文' },
  { id: 'en', tag: 'en', emoji: '🇬🇧', nom: 'English' }
] as const

export type Langue = (typeof LANGUES)[number]['id']

export const LANGUE_PAR_DEFAUT: Langue = 'zh'

export function estLangue(valeur: string | null | undefined): valeur is Langue {
  return LANGUES.some((l) => l.id === valeur)
}

export function tagDe(langue: Langue): string {
  return LANGUES.find((l) => l.id === langue)!.tag
}

export function choisirLangue(memorisee: string | null): Langue {
  return estLangue(memorisee) ? memorisee : LANGUE_PAR_DEFAUT
}
