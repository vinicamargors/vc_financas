import type { Kind } from '@/lib/classify/classify'
import { computeFree, type CommitmentInput, type CommitmentResult, type FreeTx } from '@/lib/cycle/free'
import { splitCycleIncome, type IncomeRow } from '@/lib/cycle/salary'
import { realSpending } from '@/lib/queries/totals'
import { byCategory, byPlace, type CategoryInfo, type CategoryRow, type SpendTx } from './by-category'
import { periodDays, type Range } from './period'

export type ReportTx = SpendTx & {
  accountId: string
  kind: Kind | null
  descriptionRaw: string
  counterpartyName: string | null
  incomeSourceId: string | null
}

export type CycleReport = {
  salaryCents: number
  extrasCents: number
  /** Gasto pago direto do banco (despesa − estorno). Caixa + cartão + VR = gasto real. */
  cashOutCents: number
  /** Compras no cartão menos estornos (VR fora). */
  cardCents: number
  /** Compras no VR menos estornos. */
  benefitCents: number
  /** Faturas pagas pelo banco: saem do caixa, mas não são gasto (as compras já contam no cartão). */
  cardPaidCents: number
  spendingCents: number
  pendingCents: number
  topCategories: CategoryRow[]
  topPlaces: { place: string; totalCents: number; count: number }[]
  /** `days`: dias comparados deste ciclo; `previousDays`: dias reais da janela anterior (pode ser menor). */
  prev: { spendingCents: number; incomeCents: number; days: number; previousDays: number }
  /** Aportes − resgates das caixinhas. */
  savingsNetCents: number
  commitments: CommitmentResult[]
  commitmentsDone: number
}

const inRange = (d: string, r: Range) => d >= r.start && d <= r.end

/**
 * Relatório de um ciclo. `txs` cobre do início do ciclo anterior ao fim deste; `compare` são as janelas
 * equivalentes (mesmo número de dias). Compromissos usam a lista ativa de hoje.
 */
export function buildCycleReport(input: {
  cycle: Range
  prevCycle: Range
  compare: { current: Range; previous: Range }
  today: string
  txs: ReportTx[]
  accountTypes: Map<string, 'BANK' | 'CREDIT' | 'BENEFIT'>
  salaries: IncomeRow[]
  commitments: CommitmentInput[]
  categories: CategoryInfo[]
}): CycleReport {
  const { cycle, compare, accountTypes } = input
  const typeOf = (t: ReportTx) => accountTypes.get(t.accountId) ?? 'BANK'
  const cur = input.txs.filter((t) => inRange(t.date, cycle))
  const curWin = input.txs.filter((t) => inRange(t.date, compare.current))
  const prevWin = input.txs.filter((t) => inRange(t.date, compare.previous))

  const incomesOf = (txs: ReportTx[]): IncomeRow[] =>
    txs
      .filter((t) => t.kind === 'income' && t.amountCents > 0 && typeOf(t) === 'BANK')
      .map((t) => ({ id: t.id, date: t.date, amountCents: t.amountCents, incomeSourceId: t.incomeSourceId }))
  const split = splitCycleIncome(incomesOf(cur), input.salaries, cycle)
  const prevSplit = splitCycleIncome(incomesOf(prevWin), input.salaries, compare.previous)

  let cashOutCents = 0
  let cardCents = 0
  let benefitCents = 0
  let cardPaid = 0
  let savingsNetCents = 0
  for (const t of cur) {
    const type = typeOf(t)
    const spend = t.kind === 'expense' || t.kind === 'refund'
    if (type === 'BENEFIT') {
      if (spend) benefitCents -= t.amountCents
      continue
    }
    if (t.kind === 'investment_in' || t.kind === 'investment_out') savingsNetCents -= t.amountCents
    if (type === 'CREDIT') {
      if (spend) cardCents -= t.amountCents
    } else if (spend) cashOutCents -= t.amountCents
    else if (t.kind === 'card_payment' && t.amountCents < 0) cardPaid -= t.amountCents
  }

  const now = realSpending(cur)
  const cats = byCategory(curWin, prevWin, { categories: input.categories, periodDays: periodDays(cycle) })

  // Compromissos: o mesmo cálculo do livre, olhando este ciclo.
  const freeTxs: FreeTx[] = []
  let cardEstimateCents = 0
  let cardPaidCents = 0
  for (const t of input.txs) {
    const type = typeOf(t)
    if (type === 'BENEFIT') continue
    if (type === 'CREDIT' && (t.kind === 'expense' || t.kind === 'refund') && inRange(t.date, input.prevCycle)) cardEstimateCents -= t.amountCents
    if (!inRange(t.date, cycle)) continue
    if (type === 'BANK' && t.kind === 'card_payment' && t.amountCents < 0) cardPaidCents -= t.amountCents
    freeTxs.push({
      id: t.id, date: t.date, amountCents: t.amountCents, kind: t.kind, accountType: type,
      categoryId: t.categoryId, counterpartyName: t.counterpartyName, descriptionRaw: t.descriptionRaw,
    })
  }
  const free = computeFree({
    cycle,
    today: input.today < cycle.end ? input.today : cycle.end,
    salaryCents: split.salaryCents,
    extrasCents: split.extrasCents,
    commitments: input.commitments,
    txs: freeTxs,
    cardEstimateCents: Math.max(0, cardEstimateCents),
    cardPaidCents,
  })

  return {
    salaryCents: split.salaryCents,
    extrasCents: split.extrasCents,
    cashOutCents,
    cardCents,
    benefitCents,
    cardPaidCents: cardPaid,
    spendingCents: now.spendingCents,
    pendingCents: now.pendingCents,
    topCategories: cats.rows.filter((r) => r.totalCents > 0).slice(0, 5),
    topPlaces: byPlace(cur, 5),
    prev: {
      spendingCents: cats.prevTotalCents,
      incomeCents: prevSplit.salaryCents + prevSplit.extrasCents,
      days: periodDays(compare.current),
      previousDays: periodDays(compare.previous),
    },
    savingsNetCents,
    commitments: free.commitments,
    commitmentsDone: free.commitments.filter((c) => c.status === 'done').length,
  }
}
