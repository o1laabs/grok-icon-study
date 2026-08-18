const SEPARATEUR = ' | '

export function interpoler(texte: string, valeurs?: Record<string, string | number>): string {
  if (!valeurs) return texte
  let sortie = texte
  for (const [nom, valeur] of Object.entries(valeurs)) {
    sortie = sortie.replaceAll(`{${nom}}`, String(valeur))
  }
  return sortie
}

export function formePlurielle(gabarit: string, n: number, tag: string): string {
  const formes = gabarit.split(SEPARATEUR)
  if (formes.length < 2) return formes[0]!
  const index = new Intl.PluralRules(tag).select(n) === 'one' ? 0 : 1
  return formes[index] ?? formes[0]!
}
