import type { Kind } from '@/lib/classify/classify'
import { addDays } from '@/lib/cycle/businessDays'
import { currentCycle, type Cycle } from '@/lib/cycle/cycle'
import type { CommitmentInput, FreeTx } from '@/lib/cycle/free'
import { pickSalaries, splitCycleIncome, type IncomeRow } from '@/lib/cycle/salary'
import { toLocalDate } from '@/lib/format/date'
import { createServerSupabase } from '@/lib/supabase/server'
import { minusDays } from '@/lib/sync/classification'
import { classifierAccountType } from '@/lib/sync/repo'
import { INCOME_SOURCE_COLUMNS, incomeSourceFromDb, type IncomeSourceRow } from './salary'

/** Janela lida: cobre o ciclo atual (até 45 dias de atraso) e o anterior, para a estimativa da fatura. */
const WINDOW_DAYS = 120
const PAGE = 1000

export type RawCycleTx = {
  id: string
  accountId: string
  date: string
  amountCents: number
  kind: Kind | null
  categoryId: string | null
  counterpartyName: string | null
  descriptionRaw: string
  incomeSourceId: string | null
}

export type CycleData = {
  cycle: Cycle
  hasSalarySource: boolean
  salaryCents: number
  extrasCents: number
  salaryIds: string[]
  commitments: CommitmentInput[]
  /** Lançamentos do ciclo que o livre usa: saídas e estornos, fatura paga e compras no cartão. */
  txs: FreeTx[]
  /** Compras no cartão (menos estornos) do ciclo anterior. */
  cardEstimateCents: number
  /** Pagamentos de fatura saídos do banco no ciclo. */
  cardPaidCents: number
}

const FREE_KINDS = new Set<Kind | null>(['expense', 'pending_review', null, 'refund', 'card_payment'])

/** Monta, sem I/O, tudo o que `computeFree` precisa. */
export function assembleCycleData(raw: {
  today: string
  sources: IncomeSourceRow[]
  commitments: CommitmentInput[]
  accounts: { id: string; type: 'BANK' | 'CREDIT' }[]
  txs: RawCycleTx[]
}): CycleData {
  const { today, sources } = raw
  const typeOf = new Map(raw.accounts.map((a) => [a.id, a.type]))
  const accountType = (t: RawCycleTx): 'BANK' | 'CREDIT' => (typeOf.get(t.accountId) === 'CREDIT' ? 'CREDIT' : 'BANK')
  const salarySource = sources.find((s) => s.kind === 'salary')

  const incomes: IncomeRow[] = raw.txs
    .filter((t) => t.kind === 'income' && t.amountCents > 0 && accountType(t) === 'BANK')
    .map((t) => ({ id: t.id, date: t.date, amountCents: t.amountCents, incomeSourceId: t.incomeSourceId }))
  const salaries = pickSalaries(incomes, sources)
  const rule = salarySource?.dateRule ?? null
  const fixedDay = salarySource?.fixedDay ?? null
  const cycle = currentCycle({ today, salaryDates: salaries.map((s) => s.date), rule, fixedDay })
  const split = splitCycleIncome(incomes, salaries, cycle)

  const prevEnd = addDays(cycle.start, -1)
  const prev = currentCycle({ today: prevEnd, salaryDates: salaries.map((s) => s.date).filter((d) => d < cycle.start), rule, fixedDay })
  const inRange = (d: string, start: string, end: string) => d >= start && d <= end

  let cardEstimateCents = 0
  let cardPaidCents = 0
  const txs: FreeTx[] = []
  for (const t of raw.txs) {
    const type = accountType(t)
    if (type === 'CREDIT' && (t.kind === 'expense' || t.kind === 'refund') && inRange(t.date, prev.start, prevEnd)) cardEstimateCents -= t.amountCents
    if (!inRange(t.date, cycle.start, cycle.end) || !FREE_KINDS.has(t.kind)) continue
    if (type === 'BANK' && t.kind === 'card_payment' && t.amountCents < 0) cardPaidCents -= t.amountCents
    txs.push({
      id: t.id, date: t.date, amountCents: t.amountCents, kind: t.kind, accountType: type,
      categoryId: t.categoryId, counterpartyName: t.counterpartyName, descriptionRaw: t.descriptionRaw,
    })
  }

  return {
    cycle,
    hasSalarySource: !!salarySource,
    salaryCents: split.salaryCents,
    extrasCents: split.extrasCents,
    salaryIds: split.salaryIds,
    commitments: raw.commitments,
    txs,
    cardEstimateCents: Math.max(0, cardEstimateCents),
    cardPaidCents,
  }
}

/** Lê com o cliente do usuário (RLS) e monta os dados do ciclo atual. */
export async function loadCycleData(userId: string): Promise<CycleData> {
  const db = await createServerSupabase()
  const today = toLocalDate(new Date())
  const [sources, commitments, accounts] = await Promise.all([
    db.from('income_sources').select(INCOME_SOURCE_COLUMNS).eq('user_id', userId).order('created_at'),
    db
      .from('commitments')
      .select('id, name, kind, amount_cents, percent, percent_base, category_id, match_counterparty')
      .eq('user_id', userId)
      .eq('active', true)
      .order('sort')
      .order('created_at'),
    db.from('accounts').select('id, type, external_id').eq('user_id', userId),
  ])
  for (const r of [sources, commitments, accounts]) if (r.error) throw r.error

  const txs: RawCycleTx[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from('transactions')
      .select('id, account_id, date, amount_cents, kind, category_id, counterparty_name, description_raw, income_source_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('date', minusDays(today, WINDOW_DAYS))
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    for (const t of data ?? []) {
      txs.push({
        id: t.id as string,
        accountId: t.account_id as string,
        date: t.date as string,
        amountCents: Number(t.amount_cents),
        kind: (t.kind as Kind | null) ?? null,
        categoryId: (t.category_id as string | null) ?? null,
        counterpartyName: (t.counterparty_name as string | null) ?? null,
        descriptionRaw: (t.description_raw as string) ?? '',
        incomeSourceId: (t.income_source_id as string | null) ?? null,
      })
    }
    if ((data ?? []).length < PAGE) break
  }

  return assembleCycleData({
    today,
    sources: (sources.data ?? []).map(incomeSourceFromDb),
    commitments: (commitments.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      kind: c.kind as CommitmentInput['kind'],
      amountCents: c.amount_cents == null ? null : Number(c.amount_cents),
      percent: c.percent == null ? null : Number(c.percent),
      percentBase: c.percent_base as CommitmentInput['percentBase'],
      categoryId: (c.category_id as string | null) ?? null,
      matchCounterparty: (c.match_counterparty as string | null) ?? null,
    })),
    accounts: (accounts.data ?? []).map((a) => ({ id: a.id as string, type: classifierAccountType(a.type as string, a.external_id as string | null) })),
    txs,
  })
}
