import type { SupabaseClient } from '@supabase/supabase-js'
import { rechargeExternalId, rechargesDue } from '@/lib/benefit/benefit'

export const VR_ACCOUNT_EXTERNAL_ID = 'vr'

export type BenefitAccount = {
  id: string
  name: string
  monthlyCents: number | null
  day: number | null
  since: string | null
  balanceCents: number
}

/** Migração ainda não aplicada: coluna inexistente (`42703` no Postgres, `PGRST204` no PostgREST). */
const isMissingColumn = (e: { code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204')

/** Contas VR do usuário com saldo = recargas − saídas (lançamentos não apagados). `missing` sem a migração. */
export async function loadBenefitAccounts(db: SupabaseClient, userId: string): Promise<{ missing: true } | { missing: false; accounts: BenefitAccount[] }> {
  const { data, error } = await db
    .from('accounts')
    .select('id, name, benefit_monthly_cents, benefit_day, benefit_since')
    .eq('user_id', userId)
    .eq('type', 'BENEFIT')
    .order('name')
  if (isMissingColumn(error)) return { missing: true }
  if (error) throw error
  const rows = data ?? []
  const balances = new Map<string, number>()
  if (rows.length) {
    const { data: txs, error: tErr } = await db
      .from('transactions')
      .select('account_id, amount_cents')
      .eq('user_id', userId)
      .in('account_id', rows.map((r) => r.id as string))
      .is('deleted_at', null)
      .limit(10_000)
    if (tErr) throw tErr
    for (const t of txs ?? []) balances.set(t.account_id as string, (balances.get(t.account_id as string) ?? 0) + Number(t.amount_cents))
  }
  return {
    missing: false,
    accounts: rows.map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? 'VR',
      monthlyCents: r.benefit_monthly_cents == null ? null : Number(r.benefit_monthly_cents),
      day: (r.benefit_day as number | null) ?? null,
      since: (r.benefit_since as string | null) ?? null,
      balanceCents: balances.get(r.id as string) ?? 0,
    })),
  }
}

/**
 * Lança as recargas devidas (uma por conta e mês). Idempotente: o id externo `vr:<conta>:<AAAA-MM>` é único por
 * usuário, e uma recarga apagada pelo usuário não volta.
 */
export async function ensureRecharges(db: SupabaseClient, userId: string, accounts: BenefitAccount[], today: string): Promise<number> {
  const rows = accounts.flatMap((a) =>
    a.monthlyCents && a.day && a.since
      ? rechargesDue({ day: a.day, since: a.since, today }).map((r) => ({
          user_id: userId,
          account_id: a.id,
          external_id: rechargeExternalId(a.id, r.month),
          source: 'manual',
          date: r.date,
          occurred_at: `${r.date}T12:00:00Z`,
          amount_cents: a.monthlyCents!,
          description_raw: `Recarga ${a.name}`,
          kind: 'income',
          classified_by: 'user',
          reconciled: true,
        }))
      : [],
  )
  if (rows.length === 0) return 0
  // Só as linhas novas voltam no `select`; as já existentes são ignoradas.
  const { data, error } = await db.from('transactions').upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true }).select('id')
  if (error) throw error
  return data?.length ?? 0
}

/** Carrega as contas VR e lança as recargas que faltam; devolve os saldos já com elas. */
export async function loadBenefitWithRecharges(db: SupabaseClient, userId: string, today: string) {
  const first = await loadBenefitAccounts(db, userId)
  if (first.missing || first.accounts.length === 0) return first
  const added = await ensureRecharges(db, userId, first.accounts, today)
  return added > 0 ? loadBenefitAccounts(db, userId) : first
}
