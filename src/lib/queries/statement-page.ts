import type { Filter } from '@/app/(app)/extrato/statement-filter'
import type { DayGroup, DayTx } from './statement'

/** Posição de um lançamento na ordem do extrato: date desc, occurred_at desc (nulls last), id desc. */
export type StatementCursor = { date: string; occurredAt: string | null; id: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[0-9:.+\-Z]+$/
const ID_RE = /^[0-9a-fA-F-]{8,64}$/

export function encodeCursor(c: StatementCursor): string {
  return Buffer.from(JSON.stringify([c.date, c.occurredAt, c.id])).toString('base64url')
}

/** Decodifica e valida o cursor (vem do cliente, então nunca é confiável). Lança em caso de formato inválido. */
export function decodeCursor(raw: string): StatementCursor {
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Cursor inválido')
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) throw new Error('Cursor inválido')
  const [date, occurredAt, id] = parsed
  if (typeof date !== 'string' || !DATE_RE.test(date)) throw new Error('Cursor inválido')
  if (occurredAt !== null && (typeof occurredAt !== 'string' || !ISO_RE.test(occurredAt))) throw new Error('Cursor inválido')
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('Cursor inválido')
  return { date, occurredAt, id }
}

/**
 * Condição PostgREST `or=(...)` para "estritamente depois do cursor" na ordem
 * date desc, occurred_at desc nulls last, id desc.
 */
export function keysetOr(c: StatementCursor): string {
  if (c.occurredAt === null) {
    return `date.lt.${c.date},and(date.eq.${c.date},occurred_at.is.null,id.lt.${c.id})`
  }
  return [
    `date.lt.${c.date}`,
    `and(date.eq.${c.date},occurred_at.lt.${c.occurredAt})`,
    `and(date.eq.${c.date},occurred_at.eq.${c.occurredAt},id.lt.${c.id})`,
    `and(date.eq.${c.date},occurred_at.is.null)`,
  ].join(',')
}

export type FilterPredicate = { column: 'amount_cents' | 'card_last4'; op: 'gt' | 'lt' | 'not.is'; value: number | null } | null

/** Filtro de UI → predicado de coluna aplicado no servidor. */
export function filterPredicate(filter: Filter): FilterPredicate {
  switch (filter) {
    case 'entradas':
      return { column: 'amount_cents', op: 'gt', value: 0 }
    case 'saidas':
      return { column: 'amount_cents', op: 'lt', value: 0 }
    case 'cartao':
      return { column: 'card_last4', op: 'not.is', value: null }
    default:
      return null
  }
}

export function isFilter(v: unknown): v is Filter {
  return v === 'tudo' || v === 'entradas' || v === 'saidas' || v === 'cartao'
}

/** Junta páginas: se o último dia de `base` continua em `next`, funde (sem duplicar ids) e soma o total. */
export function mergeGroups<T extends DayTx & { id: string }>(base: DayGroup<T>[], next: DayGroup<T>[]): DayGroup<T>[] {
  const out = base.map((g) => ({ ...g, items: [...g.items] }))
  for (const g of next) {
    const last = out[out.length - 1]
    if (last && last.date === g.date) {
      const seen = new Set(last.items.map((i) => i.id))
      for (const it of g.items) {
        if (seen.has(it.id)) continue
        last.items.push(it)
        last.totalCents += it.amountCents
      }
    } else {
      out.push({ ...g, items: [...g.items] })
    }
  }
  return out
}
