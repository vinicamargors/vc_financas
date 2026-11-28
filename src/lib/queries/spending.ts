import { toLocalDate } from '@/lib/format/date'
import { minusDays } from '@/lib/sync/classification'
import { createServerSupabase } from '@/lib/supabase/server'
import { realSpending } from './totals'

/** Janela de 30 dias (hoje incluso), em datas locais de São Paulo. */
export async function loadRealSpending(): Promise<{ spendingCents: number; pendingCents: number }> {
  const supabase = await createServerSupabase()
  const today = toLocalDate(new Date())
  const { data, error } = await supabase
    .from('transactions')
    .select('kind, amount_cents')
    .in('kind', ['expense', 'refund', 'pending_review'])
    .is('deleted_at', null)
    .gte('date', minusDays(today, 29))
    .lte('date', today)
    .limit(5000)
  if (error) throw new Error('Falha ao carregar o gasto real')
  return realSpending((data ?? []).map((r) => ({ kind: r.kind, amountCents: Number(r.amount_cents) })))
}
