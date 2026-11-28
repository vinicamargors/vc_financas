import { subDays } from 'date-fns'
import { isMissingFromBank } from '@/lib/reconcile/reconcile'
import { createServerSupabase } from '@/lib/supabase/server'
import { toLocalDate } from '@/lib/format/date'
import { logoMap } from './logos'
import type { Kind } from '@/lib/classify/classify'
import { countsInDayTotal } from './totals'
import { prettyDescription } from '@/lib/format/description'
import { isSavingsYield } from '@/lib/pluggy/map'
import type { Filter } from '@/app/(app)/extrato/statement-filter'
import { decodeCursor, encodeCursor, filterPredicate, keysetOr, type StatementCursor } from './statement-page'

export type DayTx = { date: string; amountCents: number; deletedAt: string | null; kind: string | null }
export type DayGroup<T extends DayTx> = { date: string; totalCents: number; items: T[] }

/** Agrupa por dia (desc), ignorando transações apagadas. O total do dia soma só despesa, entrada e estorno. Mantém a ordem de entrada dentro do dia. */
export function groupByDay<T extends DayTx>(txs: T[]): DayGroup<T>[] {
  const days = new Map<string, DayGroup<T>>()
  for (const t of txs) {
    if (t.deletedAt) continue
    const g = days.get(t.date) ?? { date: t.date, totalCents: 0, items: [] }
    if (countsInDayTotal(t.kind)) g.totalCents += t.amountCents
    g.items.push(t)
    days.set(t.date, g)
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export type StatementTx = DayTx & {
  id: string
  description: string
  accountLabel: string
  /** Instante com hora, quando conhecido. */
  occurredAt: string | null
  logoUrl: string | null
  cardLast4: string | null
  installmentNumber: number | null
  installmentTotal: number | null
  /** Rendimento de caixinha: não conta como entrada e aparece apagado. */
  isYield: boolean
  kind: Kind | null
  categoryName: string | null
  /** Lançamento manual sem par na Pluggy depois de 3 dias. */
  missingFromBank?: boolean
}

export const SAVINGS_YIELD_LABEL = 'Rendimento · caixinha'
const MERCADO_PAGO_RE = /mercado\s*pago/i

/** Rendimento de caixinha: marcado na sincronização ou reconhecido pela descrição (linhas antigas). */
export function statementYield(row: { kind: string | null; description_raw: string }, accountHasBoxes: boolean): boolean {
  return row.kind === 'savings_yield' || isSavingsYield(row.description_raw, accountHasBoxes)
}

const COLUMNS =
  'id, date, occurred_at, amount_cents, description_raw, installment_number, installment_total, card_last4, deleted_at, kind, source, linked_transaction_id, account_id, accounts(institution, name, logo_url, type), merchants(display_name), categories(name)'

export type StatementPage = { groups: DayGroup<StatementTx>[]; nextCursor: string | null }

export async function loadStatementPage({
  cursor,
  filter = 'tudo',
  limit = 50,
  days = 90,
}: {
  cursor?: string | null
  filter?: Filter
  limit?: number
  days?: number
}): Promise<StatementPage> {
  const supabase = await createServerSupabase()
  const since = toLocalDate(subDays(new Date(), days))
  const today = toLocalDate(new Date())
  const after: StatementCursor | null = cursor ? decodeCursor(cursor) : null
  const pred = filterPredicate(filter)

  // Parcelas futuras do cartão ficam fora do extrato (são compromissos, não lançamentos).
  function base(from: StatementCursor | null) {
    let q = supabase.from('transactions').select(COLUMNS).is('deleted_at', null).gte('date', since).lte('date', today)
    if (pred) q = q.filter(pred.column, pred.op, pred.value === null ? null : pred.value)
    if (from) q = q.or(keysetOr(from))
    return q
      .order('date', { ascending: false })
      .order('occurred_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
  }
  type Row = NonNullable<Awaited<ReturnType<ReturnType<typeof base>['limit']>>['data']>[number]
  const cursorOf = (r: Row): StatementCursor => ({ date: r.date, occurredAt: r.occurred_at, id: r.id })

  const [conns, page, boxes] = await Promise.all([
    supabase.from('connections').select('connector_name, connector_image_url'),
    base(after).limit(limit + 1),
    supabase.from('savings_boxes').select('account_id'),
  ])
  if (conns.error) throw new Error('Falha ao carregar conexões')
  // Sem caixinhas (ou tabela indisponível) cai só no nome do banco.
  const boxAccounts = new Set((boxes.data ?? []).map((b) => b.account_id as string))
  if (page.error) throw new Error('Falha ao carregar o extrato')
  const logos = logoMap(conns.data ?? [])

  let rows: Row[] = page.data ?? []
  let hasMore = rows.length > limit
  if (hasMore) {
    const last = rows[limit - 1]
    // Completa o último dia para que grupos e totais nunca fiquem parciais.
    if (rows[limit].date === last.date) {
      const rest = await base(cursorOf(last)).eq('date', last.date)
      if (rest.error) throw new Error('Falha ao carregar o extrato')
      rows = [...rows.slice(0, limit), ...(rest.data ?? [])]
      const probe = await base(null).lt('date', last.date).limit(1)
      if (probe.error) throw new Error('Falha ao carregar o extrato')
      hasMore = (probe.data ?? []).length > 0
    } else {
      rows = rows.slice(0, limit)
    }
  }

  const missing = await missingFromBankIds(supabase, rows, today)
  const groups = groupByDay(
    rows.map((t) => {
      const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
      const merchant = Array.isArray(t.merchants) ? t.merchants[0] : t.merchants
      const category = Array.isArray(t.categories) ? t.categories[0] : t.categories
      const isYield = statementYield(t, boxAccounts.has(t.account_id) || MERCADO_PAGO_RE.test(acc?.institution ?? ''))
      return {
        id: t.id,
        date: t.date,
        occurredAt: t.occurred_at,
        amountCents: Number(t.amount_cents),
        deletedAt: t.deleted_at,
        description: isYield ? SAVINGS_YIELD_LABEL : (merchant?.display_name?.trim() || prettyDescription(t.description_raw)),
        kind: t.kind as Kind | null,
        categoryName: category?.name ?? null,
        isYield,
        accountLabel: acc?.institution ?? acc?.name ?? '',
        logoUrl: (acc?.logo_url && /^https:\/\//.test(acc.logo_url) ? acc.logo_url : null) ?? logos.get(acc?.institution ?? '') ?? null,
        cardLast4: t.card_last4,
        installmentNumber: t.installment_number,
        installmentTotal: t.installment_total,
        missingFromBank: missing.has(t.id),
      }
    }),
  )
  return { groups, nextCursor: hasMore && rows.length ? encodeCursor(cursorOf(rows[rows.length - 1])) : null }
}

/**
 * Ids dos lançamentos manuais da página que "não apareceram no banco". Consulta à parte: sem a migração da
 * conferência, o extrato continua igual (sem a etiqueta).
 */
async function missingFromBankIds(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  rows: { id: string; source: string; date: string; linked_transaction_id: string | null; accounts: unknown }[],
  today: string,
): Promise<Set<string>> {
  const manual = rows.filter((r) => r.source === 'manual')
  if (manual.length === 0) return new Set()
  const { data, error } = await supabase.from('transactions').select('id, reconciled, reconcile_candidate_id').in('id', manual.map((r) => r.id))
  if (error) return new Set()
  const extra = new Map((data ?? []).map((d) => [d.id as string, d]))
  const out = new Set<string>()
  for (const r of manual) {
    const e = extra.get(r.id)
    const acc = (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) as { type?: string } | null
    if (
      e &&
      isMissingFromBank(
        {
          source: r.source,
          reconciled: !!e.reconciled,
          deletedAt: null,
          linkedTransactionId: r.linked_transaction_id,
          reconcileCandidateId: (e.reconcile_candidate_id as string | null) ?? null,
          accountType: acc?.type ?? '',
          date: r.date,
        },
        today,
      )
    )
      out.add(r.id)
  }
  return out
}
