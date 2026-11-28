import { toLocalDate } from '@/lib/format/date'
import { createServerSupabase } from '@/lib/supabase/server'
import { recentWindowStart, sumRealSpending } from './totals'

/** Gasto real e "a confirmar" dos últimos 30 dias (datas locais de São Paulo), paginado por id. */
export async function loadRealSpending(): Promise<{ spendingCents: number; pendingCents: number }> {
  const supabase = await createServerSupabase()
  const today = toLocalDate(new Date())
  return sumRealSpending(async (from, to) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('kind, amount_cents')
      .or('kind.in.(expense,refund,pending_review),kind.is.null')
      .is('deleted_at', null)
      .gte('date', recentWindowStart(today))
      .lte('date', today)
      .order('id')
      .range(from, to)
    if (error) throw new Error('Falha ao carregar o gasto real')
    return (data ?? []).map((r) => ({ kind: r.kind, amountCents: Number(r.amount_cents) }))
  })
}
