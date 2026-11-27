import { subDays } from 'date-fns'
import { createServerSupabase } from '@/lib/supabase/server'
import { toLocalDate } from '@/lib/format/date'

export type DayTx = { date: string; amountCents: number; deletedAt: string | null }
export type DayGroup<T extends DayTx> = { date: string; totalCents: number; items: T[] }

/** Agrupa por dia (desc), ignorando transações apagadas. Mantém a ordem de entrada dentro do dia. */
export function groupByDay<T extends DayTx>(txs: T[]): DayGroup<T>[] {
  const days = new Map<string, DayGroup<T>>()
  for (const t of txs) {
    if (t.deletedAt) continue
    const g = days.get(t.date) ?? { date: t.date, totalCents: 0, items: [] }
    g.totalCents += t.amountCents
    g.items.push(t)
    days.set(t.date, g)
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export type StatementTx = DayTx & {
  id: string
  description: string
  accountLabel: string
  cardLast4: string | null
  installmentNumber: number | null
  installmentTotal: number | null
}

export async function loadStatement(days = 90): Promise<DayGroup<StatementTx>[]> {
  const supabase = await createServerSupabase()
  const since = toLocalDate(subDays(new Date(), days))
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, amount_cents, description_raw, installment_number, installment_total, card_last4, deleted_at, accounts(institution, name)')
    .is('deleted_at', null)
    .gte('date', since)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error('Falha ao carregar o extrato')
  return groupByDay(
    (data ?? []).map((t) => {
      const acc = Array.isArray(t.accounts) ? t.accounts[0] : t.accounts
      return {
        id: t.id,
        date: t.date,
        amountCents: Number(t.amount_cents),
        deletedAt: t.deleted_at,
        description: t.description_raw,
        accountLabel: acc?.institution ?? acc?.name ?? '',
        cardLast4: t.card_last4,
        installmentNumber: t.installment_number,
        installmentTotal: t.installment_total,
      }
    }),
  )
}
