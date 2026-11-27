import { createServerSupabase } from '@/lib/supabase/server'

export type BalanceAccount = { institution: string; type: string; subtype: string; balanceCents: number; updatedAt: string }

export type CheckingSummary = {
  totalCents: number
  byInstitution: { institution: string; balanceCents: number }[]
  updatedAt: string | null
}

/** Soma só contas correntes (BANK / CHECKING_ACCOUNT), por instituição, saldo desc. */
export function summarizeCheckingBalances(accounts: BalanceAccount[]): CheckingSummary {
  const byName = new Map<string, number>()
  let updatedAt: string | null = null
  for (const a of accounts) {
    if (a.type !== 'BANK' || a.subtype !== 'CHECKING_ACCOUNT') continue
    byName.set(a.institution, (byName.get(a.institution) ?? 0) + a.balanceCents)
    if (updatedAt === null || new Date(a.updatedAt) < new Date(updatedAt)) updatedAt = a.updatedAt
  }
  const byInstitution = [...byName].map(([institution, balanceCents]) => ({ institution, balanceCents }))
  byInstitution.sort((x, y) => y.balanceCents - x.balanceCents)
  return { totalCents: byInstitution.reduce((s, i) => s + i.balanceCents, 0), byInstitution, updatedAt }
}

export type ConnectionRow = {
  id: string
  connectorName: string
  status: string
  consentExpiresAt: string | null
}

export async function loadHomeData(): Promise<{ connections: ConnectionRow[]; summary: CheckingSummary }> {
  const supabase = await createServerSupabase()
  const [conns, accs] = await Promise.all([
    supabase.from('connections').select('id, connector_name, status, consent_expires_at'),
    supabase.from('accounts').select('institution, type, subtype, balance_cents, updated_at'),
  ])
  if (conns.error) throw new Error('Falha ao carregar conexões')
  if (accs.error) throw new Error('Falha ao carregar contas')
  return {
    connections: (conns.data ?? []).map((c) => ({
      id: c.id,
      connectorName: c.connector_name,
      status: c.status,
      consentExpiresAt: c.consent_expires_at,
    })),
    summary: summarizeCheckingBalances(
      (accs.data ?? []).map((a) => ({
        institution: a.institution ?? 'Conta',
        type: a.type,
        subtype: a.subtype ?? '',
        balanceCents: Number(a.balance_cents),
        updatedAt: a.updated_at,
      })),
    ),
  }
}
