import { getCdiAnnual } from '@/lib/cdi'
import { toLocalDate } from '@/lib/format/date'
import { fgtsEstimate, realYieldByBoxes } from '@/lib/invest'
import { FGTS_DEPOSIT_RATE } from '@/lib/invest/goal'
import { averageMonthlyNet, salariesSince } from '@/lib/invest/plan'
import { minusDays } from '@/lib/sync/classification'
import { safeErrorMessage } from '@/lib/sync/safe-error'
import { loadFgts, loadInvestData, loadRecognizedSalaries, type FgtsRow } from './invest'

const PACE_WINDOW_DAYS = 120

/** Tudo o que /caixinhas, /metas e o Início precisam sobre caixinhas, ritmo e FGTS. */
export async function loadInvestView(userId: string) {
  const today = toLocalDate(new Date())
  const [data, cdi, fgtsRes] = await Promise.all([
    loadInvestData(userId),
    getCdiAnnual(),
    loadFgts(userId).catch((e: unknown) => {
      console.error(`carregar FGTS falhou: ${safeErrorMessage(e)}`)
      return { missing: false as const, fgts: null }
    }),
  ])
  const fgtsRow = fgtsRes.missing ? null : fgtsRes.fgts
  // Janela do ritmo (3 ciclos) ou, se mais antiga, a data do saldo do FGTS.
  const windowStart = minusDays(today, PACE_WINDOW_DAYS)
  const since = fgtsRow && fgtsRow.balanceDate < windowStart ? fgtsRow.balanceDate : windowStart
  const salaries = await loadRecognizedSalaries(userId, since).catch((e: unknown) => {
    console.error(`carregar salários falhou: ${safeErrorMessage(e)}`)
    return []
  })
  const accountOf = new Map(data.boxes.map((b) => [b.id, b.accountId]))
  const totalYield = realYieldByBoxes(
    data.snapshots.flatMap((s) => (accountOf.has(s.boxId) ? [{ ...s, accountId: accountOf.get(s.boxId)! }] : [])),
    data.flows,
  )
  const paceCents = averageMonthlyNet(data.flows, salaries.map((s) => s.date), today)
  return {
    today,
    cdi,
    ...data,
    totalCents: data.boxes.reduce((s, b) => s + b.balanceCents, 0),
    totalYield,
    paceCents,
    salaries,
    fgtsMissing: fgtsRes.missing,
    fgts: fgtsRow ? fgtsView(fgtsRow, salaries, today) : null,
  }
}

/** Estimativa do FGTS hoje e o depósito mensal previsto. Só salários depois da data do saldo entram. */
export function fgtsView(row: FgtsRow, salaries: { date: string; amountCents: number }[], today: string) {
  const ratio = row.grossSalaryCents && row.referenceNetCents ? row.grossSalaryCents / row.referenceNetCents : null
  const est = fgtsEstimate({
    balanceCents: row.balanceCents,
    balanceDate: row.balanceDate,
    today,
    monthlyNetSalaries: ratio ? salariesSince(salaries, row.balanceDate) : [],
    grossToNetRatio: ratio ?? 0,
  })
  const lastNet = salaries.length ? salaries[salaries.length - 1].amountCents : row.referenceNetCents
  const monthlyDepositCents = ratio && lastNet ? Math.round(FGTS_DEPOSIT_RATE * lastNet * ratio) : 0
  return { ...row, estimateCents: est.estimateCents, reminderDue: est.reminderDue, monthlyDepositCents, hasRatio: ratio != null }
}
