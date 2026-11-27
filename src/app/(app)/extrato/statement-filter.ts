import type { DayGroup, StatementTx } from '@/lib/queries/statement'

export type Filter = 'tudo' | 'entradas' | 'saidas' | 'cartao'

export const FILTERS: { id: Filter; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'saidas', label: 'Saídas' },
  { id: 'cartao', label: 'Cartão' },
]

const MATCH: Record<Filter, (t: StatementTx) => boolean> = {
  tudo: () => true,
  entradas: (t) => t.amountCents > 0,
  saidas: (t) => t.amountCents < 0,
  cartao: (t) => Boolean(t.cardLast4),
}

/** Refiltra os dias já carregados, recalculando o total de cada dia e tirando dias vazios. */
export function filterDays(days: DayGroup<StatementTx>[], filter: Filter): DayGroup<StatementTx>[] {
  if (filter === 'tudo') return days
  const out: DayGroup<StatementTx>[] = []
  for (const d of days) {
    const items = d.items.filter(MATCH[filter])
    if (items.length) out.push({ date: d.date, items, totalCents: items.reduce((s, t) => s + t.amountCents, 0) })
  }
  return out
}

/** Duas letras para o círculo: iniciais das duas primeiras palavras, ou as duas primeiras letras. */
export function initials(description: string): string {
  const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'para'])
  const all = description.match(/[\p{L}\p{N}]+/gu) ?? []
  const words = all.filter((w) => !STOP.has(w.toLowerCase()))
  if (words.length === 0) words.push(...all)
  const [a, b] = words
  if (!a) return '·'
  return (b ? a.charAt(0) + b.charAt(0) : a.slice(0, 2)).toUpperCase()
}
