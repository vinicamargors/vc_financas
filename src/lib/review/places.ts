import { normalizeText } from '@/lib/classify/normalize'
import { prettyDescription } from '@/lib/format/description'

const MAX_GROUPS = 20

/**
 * Padrão de regra para uma descrição: normalizado e sem o que muda a cada compra
 * (código da maquininha, documento, data, parcela). `null` se sobrar menos de 3 caracteres
 * com letra (padrão curto demais casaria com tudo).
 */
export function patternFor(description: string): string | null {
  const p = normalizeText(
    description
      .replace(/^[a-z]{1,4}\s*\*\s*/i, '')
      .replace(/\bdocto:?\s*\d+/gi, ' ')
      .replace(/\b(?:parc(?:ela)?\s*)?\d{1,2}\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?\b/gi, ' ')
      .replace(/\d{4,}/g, ' ')
      .replace(/\s+-\s+/g, ' ')
      .replace(/[\s-]+$/g, ''),
  )
  return p.length >= 3 && /[a-z]/.test(p) ? p : null
}

export interface NewPlaceRow {
  id: string
  description: string
  amountCents: number
  date: string
}

export interface NewPlaceGroup {
  pattern: string
  /** Nome sugerido (descrição legível da linha mais recente). */
  displayName: string
  count: number
  totalCents: number
  /** Ids do grupo, do mais recente para o mais antigo. */
  ids: string[]
}

/** Agrupa saídas sem estabelecimento pelo padrão; os 20 mais frequentes primeiro. */
export function groupNewPlaces(rows: NewPlaceRow[]): NewPlaceGroup[] {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const groups = new Map<string, NewPlaceGroup>()
  for (const r of sorted) {
    const pattern = patternFor(r.description)
    if (!pattern) continue
    const g = groups.get(pattern) ?? { pattern, displayName: prettyDescription(r.description), count: 0, totalCents: 0, ids: [] }
    g.count += 1
    g.totalCents += r.amountCents
    g.ids.push(r.id)
    groups.set(pattern, g)
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.totalCents - b.totalCents)
    .slice(0, MAX_GROUPS)
}
