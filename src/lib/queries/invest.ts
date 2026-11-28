import { pickSalaries, type IncomeRow } from '@/lib/cycle/salary'
import type { Flow, Snapshot } from '@/lib/invest'
import { createServerSupabase } from '@/lib/supabase/server'
import { INCOME_SOURCE_COLUMNS, incomeSourceFromDb } from './salary'

/** Tabela ainda não criada (migração não aplicada): PostgREST `PGRST205` ou Postgres `42P01`. */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PGRST205' || error.code === '42P01')
}

/** Soma fotos de várias caixinhas por dia, em ordem de data. */
export function sumByDate(snaps: Snapshot[]): Snapshot[] {
  const m = new Map<string, number>()
  for (const s of snaps) m.set(s.date, (m.get(s.date) ?? 0) + s.balanceCents)
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, balanceCents]) => ({ date, balanceCents }))
}

/** % do CDI médio ponderado pelo saldo; 100 quando nenhuma caixinha informa. */
export function weightedCdiPercent(boxes: { balanceCents: number; cdiPercent: number | null }[]): number {
  let w = 0
  let s = 0
  for (const b of boxes) {
    if (b.cdiPercent == null || b.balanceCents <= 0) continue
    w += b.balanceCents
    s += b.balanceCents * b.cdiPercent
  }
  return w > 0 ? s / w : 100
}

export type BoxRow = { id: string; accountId: string; name: string | null; balanceCents: number; cdiPercent: number | null }
export type BoxSnapshotRow = Snapshot & { boxId: string }
export type AccountFlow = Flow & { accountId: string }

const boxFromDb = (b: Record<string, unknown>): BoxRow => ({
  id: b.id as string,
  accountId: b.account_id as string,
  name: (b.name as string | null) ?? null,
  balanceCents: Number(b.balance_cents),
  cdiPercent: b.cdi_percent == null ? null : Number(b.cdi_percent),
})

/** Caixinhas, todas as fotos e os aportes/resgates das contas delas (RLS + filtro por usuário). */
export async function loadInvestData(userId: string): Promise<{ boxes: BoxRow[]; snapshots: BoxSnapshotRow[]; flows: AccountFlow[] }> {
  const db = await createServerSupabase()
  const [boxes, snaps] = await Promise.all([
    db.from('savings_boxes').select('id, account_id, name, balance_cents, cdi_percent').eq('user_id', userId).order('balance_cents', { ascending: false }),
    db.from('savings_box_snapshots').select('box_id, date, balance_cents').eq('user_id', userId).order('date'),
  ])
  if (boxes.error) throw boxes.error
  if (snaps.error) throw snaps.error
  const rows = (boxes.data ?? []).map(boxFromDb)
  const snapshots = (snaps.data ?? []).map((s) => ({ boxId: s.box_id as string, date: s.date as string, balanceCents: Number(s.balance_cents) }))
  const accountIds = [...new Set(rows.map((b) => b.accountId))]
  const first = snapshots[0]?.date
  let flows: AccountFlow[] = []
  if (accountIds.length > 0) {
    let q = db
      .from('transactions')
      .select('account_id, date, amount_cents, kind')
      .eq('user_id', userId)
      .in('account_id', accountIds)
      .in('kind', ['investment_in', 'investment_out'])
      .is('deleted_at', null)
    if (first) q = q.gte('date', first)
    const { data, error } = await q.order('date').limit(5000)
    if (error) throw error
    flows = (data ?? []).map((t) => ({
      accountId: t.account_id as string,
      date: t.date as string,
      amountCents: Number(t.amount_cents),
      kind: t.kind as Flow['kind'],
    }))
  }
  return { boxes: rows, snapshots, flows }
}

/**
 * Lançamentos atribuíveis a uma caixinha: só quando ela é a única caixinha da conta
 * (aportes não dizem para qual caixinha foram).
 */
export function flowsForBox(box: BoxRow, boxes: BoxRow[], flows: AccountFlow[]): Flow[] | null {
  if (boxes.filter((b) => b.accountId === box.accountId).length > 1) return null
  return flows.filter((f) => f.accountId === box.accountId)
}

export type GoalRow = {
  id: string
  name: string
  targetCents: number | null
  targetDate: string | null
  plannedMinCents: number | null
  plannedMaxCents: number | null
  includeFgts: boolean
  boxIds: string[]
}

const numOrNull = (v: unknown) => (v == null ? null : Number(v))

/** Metas e as caixinhas de cada uma. `missing` quando a migração ainda não rodou. */
export async function loadGoals(userId: string): Promise<{ missing: true } | { missing: false; goals: GoalRow[] }> {
  const db = await createServerSupabase()
  const [goals, links] = await Promise.all([
    db.from('goals').select('id, name, target_cents, target_date, planned_min_cents, planned_max_cents, include_fgts').eq('user_id', userId).order('created_at'),
    db.from('goal_boxes').select('goal_id, box_id').eq('user_id', userId),
  ])
  if (isMissingTable(goals.error) || isMissingTable(links.error)) return { missing: true }
  if (goals.error) throw goals.error
  if (links.error) throw links.error
  return {
    missing: false,
    goals: (goals.data ?? []).map((g) => ({
      id: g.id as string,
      name: g.name as string,
      targetCents: numOrNull(g.target_cents),
      targetDate: (g.target_date as string | null) ?? null,
      plannedMinCents: numOrNull(g.planned_min_cents),
      plannedMaxCents: numOrNull(g.planned_max_cents),
      includeFgts: !!g.include_fgts,
      boxIds: (links.data ?? []).filter((l) => l.goal_id === g.id).map((l) => l.box_id as string),
    })),
  }
}

export type FgtsRow = { balanceCents: number; balanceDate: string; grossSalaryCents: number | null; referenceNetCents: number | null }

export async function loadFgts(userId: string): Promise<{ missing: true } | { missing: false; fgts: FgtsRow | null }> {
  const db = await createServerSupabase()
  const { data, error } = await db
    .from('fgts')
    .select('balance_cents, balance_date, gross_salary_cents, reference_net_cents')
    .eq('user_id', userId)
    .maybeSingle()
  if (isMissingTable(error)) return { missing: true }
  if (error) throw error
  return {
    missing: false,
    fgts: data
      ? {
          balanceCents: Number(data.balance_cents),
          balanceDate: data.balance_date as string,
          grossSalaryCents: numOrNull(data.gross_salary_cents),
          referenceNetCents: numOrNull(data.reference_net_cents),
        }
      : null,
  }
}

/** Salários reconhecidos (mesma regra do ciclo) a partir de `since`, em ordem de data. */
export async function loadRecognizedSalaries(userId: string, since: string): Promise<IncomeRow[]> {
  const db = await createServerSupabase()
  const [sources, banks] = await Promise.all([
    db.from('income_sources').select(INCOME_SOURCE_COLUMNS).eq('user_id', userId),
    db.from('accounts').select('id').eq('user_id', userId).eq('type', 'BANK'),
  ])
  if (sources.error) throw sources.error
  if (banks.error) throw banks.error
  const src = (sources.data ?? []).map((r) => incomeSourceFromDb(r as Record<string, unknown>))
  if (!src.some((s) => s.kind === 'salary')) return []
  const bankIds = (banks.data ?? []).map((a) => a.id as string)
  if (bankIds.length === 0) return []
  const { data, error } = await db
    .from('transactions')
    .select('id, date, amount_cents, income_source_id')
    .eq('user_id', userId)
    .in('account_id', bankIds)
    .eq('kind', 'income')
    .not('income_source_id', 'is', null)
    .is('deleted_at', null)
    .gte('date', since)
    .order('date')
    .limit(2000)
  if (error) throw error
  const incomes: IncomeRow[] = (data ?? []).map((t) => ({
    id: t.id as string,
    date: t.date as string,
    amountCents: Number(t.amount_cents),
    incomeSourceId: (t.income_source_id as string | null) ?? null,
  }))
  return pickSalaries(incomes, src)
}
