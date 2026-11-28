import { projectMonthly } from './index'

export const FGTS_ANNUAL_PCT = 3
export const FGTS_DEPOSIT_RATE = 0.08

export type ScenarioKey = 'current' | 'min' | 'max'
export const SCENARIO_LABEL: Record<ScenarioKey, string> = { current: 'Ritmo atual', min: 'Planejado mín.', max: 'Planejado máx.' }

export type ScenarioOutlook = {
  key: ScenarioKey
  label: string
  monthlyCents: number
  /** Valor bruto mês a mês, começando por hoje (índice 0). */
  values: number[]
  grossCents: number
  irCents: number
  netCents: number
}

/**
 * Potencial de hoje (caixinhas + FGTS) e os cenários até a data-alvo. As caixinhas rendem CDI × % do CDI com IR
 * regressivo; o FGTS rende 3% a.a. (TR = 0), recebe o depósito mensal e não paga IR.
 */
export function goalOutlook(p: {
  boxesCents: number
  cdiAnnualPct: number | null
  cdiPercent: number
  months: number
  pace: { currentCents: number; minCents: number | null; maxCents: number | null }
  fgts: { balanceCents: number; monthlyDepositCents: number } | null
}): { potentialCents: number; scenarios: ScenarioOutlook[] } {
  const potentialCents = p.boxesCents + (p.fgts?.balanceCents ?? 0)
  if (p.cdiAnnualPct == null) return { potentialCents, scenarios: [] }
  const rate = (p.cdiAnnualPct * p.cdiPercent) / 100
  const fgtsSeries = p.fgts
    ? projectMonthly({ startCents: p.fgts.balanceCents, monthlyCents: p.fgts.monthlyDepositCents, annualRatePct: FGTS_ANNUAL_PCT, months: p.months }).map((x) => x.grossCents)
    : null
  const fgtsAt = (i: number) => (p.fgts ? (i === 0 ? p.fgts.balanceCents : fgtsSeries![i - 1]) : 0)

  const entries: [ScenarioKey, number | null][] = [
    ['current', p.pace.currentCents],
    ['min', p.pace.minCents],
    ['max', p.pace.maxCents],
  ]
  const scenarios = entries
    .filter((e): e is [ScenarioKey, number] => e[1] != null)
    .map(([key, monthlyCents]) => {
      const s = projectMonthly({ startCents: p.boxesCents, monthlyCents, annualRatePct: rate, months: p.months })
      const last = s[s.length - 1]
      const fgtsEnd = fgtsAt(p.months)
      return {
        key,
        label: SCENARIO_LABEL[key],
        monthlyCents,
        values: [p.boxesCents, ...s.map((x) => x.grossCents)].map((v, i) => v + fgtsAt(i)),
        grossCents: last.grossCents + fgtsEnd,
        irCents: last.irCents,
        netCents: last.netCents + fgtsEnd,
      }
    })
  return { potentialCents, scenarios }
}
