import { PERSON_TRANSFER } from '@/lib/classify/classify'
import { normalizeText } from '@/lib/classify/normalize'
import { prettyDescription } from '@/lib/format/description'

const MAX_GROUPS = 20
const MIN_PATTERN = 5
/** Palavras que aparecem em qualquer lançamento: sozinhas, a regra casaria com tudo. */
const GENERIC = new Set(
  'pix ted doc transferencia transf enviado enviada recebido pagamento pagto compra debito credito qr code dinamico estatico des rem para de'.split(' '),
)

/** Pix/TED/transferência para uma pessoa: não é "lugar" para ensinar. */
export function isPersonTransfer(description: string): boolean {
  const n = normalizeText(description)
  return PERSON_TRANSFER.test(n) || /^(pix|ted) (para|de) /.test(normalizeText(prettyDescription(description)))
}

/**
 * Padrão de regra para uma descrição: normalizado e sem o que muda a cada compra
 * (código da maquininha, documento, data, parcela). `null` se o padrão for curto (< 5) ou
 * não tiver uma palavra própria de 3+ letras fora das genéricas (casaria com tudo).
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
  const own = p.split(/[^a-z0-9]+/).some((w) => w.length >= 3 && /[a-z]/.test(w) && !GENERIC.has(w))
  return p.length >= MIN_PATTERN && own ? p : null
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
    if (isPersonTransfer(r.description)) continue
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
