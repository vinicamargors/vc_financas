import type { CommitmentInput } from '@/lib/cycle/free'
import { createServerSupabase } from '@/lib/supabase/server'

export type CommitmentRow = CommitmentInput & { active: boolean; sort: number }

/** Todos os compromissos (ativos primeiro, na ordem) e as categorias do usuário, para a tela de configuração. */
export async function loadCommitmentsSetup(userId: string): Promise<{ commitments: CommitmentRow[]; categories: { id: string; name: string }[] }> {
  const db = await createServerSupabase()
  const [commitments, categories] = await Promise.all([
    db
      .from('commitments')
      .select('id, name, kind, amount_cents, percent, percent_base, category_id, match_counterparty, active, sort')
      .eq('user_id', userId)
      .order('active', { ascending: false })
      .order('sort')
      .order('created_at'),
    db.from('categories').select('id, name').eq('user_id', userId).order('name'),
  ])
  if (commitments.error) throw commitments.error
  if (categories.error) throw categories.error
  return {
    commitments: (commitments.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      kind: c.kind as CommitmentInput['kind'],
      amountCents: c.amount_cents == null ? null : Number(c.amount_cents),
      percent: c.percent == null ? null : Number(c.percent),
      percentBase: c.percent_base as CommitmentInput['percentBase'],
      categoryId: (c.category_id as string | null) ?? null,
      matchCounterparty: (c.match_counterparty as string | null) ?? null,
      active: c.active as boolean,
      sort: Number(c.sort),
    })),
    categories: (categories.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
  }
}
