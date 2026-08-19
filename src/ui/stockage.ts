const PREFIXE = 'study:'
const NOMS = ['cycles', 'cycle', 'forme', 'couleur', 'expression', 'langue', 'manuel'] as const

export type NomStocke = (typeof NOMS)[number]

export function cle(nom: NomStocke): string {
  return `${PREFIXE}${nom}`
}

export function lis(nom: NomStocke): string | null {
  try {
    return localStorage.getItem(cle(nom))
  } catch {
    return null
  }
}

export function ecris(nom: NomStocke, valeur: string): void {
  try {
    localStorage.setItem(cle(nom), valeur)
  } catch {
    /* persist is optional */
  }
}
