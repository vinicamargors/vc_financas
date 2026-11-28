/** Cálculos puros de investimento: rendimento real, projeção com IR e FGTS. Valores em centavos inteiros. */

export type Snapshot = { date: string; balanceCents: number }
export type Flow = { date: string; kind: 'investment_in' | 'investment_out'; amountCents: number }
export type ProjectionPoint = {
  month: number
  investedCents: number
  grossCents: number
  gainCents: number
  irCents: number
  netCents: number
}

const DAYS_PER_MONTH = 30
const FGTS_ANNUAL_PCT = 3 // + TR, assumida 0
const FGTS_DEPOSIT = 0.08
const FGTS_REMINDER_DAYS = 90

/** Taxa mensal equivalente: (1 + anual)^(1/12) − 1. `annualRatePct` já é CDI × % do CDI (ex.: 15,645). */
export function monthlyRate(annualRatePct: number): number {
  return Math.pow(1 + annualRatePct / 100, 1 / 12) - 1
}

/** IR regressivo sobre o ganho, pelo prazo em dias. */
export function irRate(days: number): number {
  if (days <= 180) return 0.225
  if (days <= 360) return 0.2
  if (days <= 720) return 0.175
  return 0.15
}

/** Rendimento real = saldo mais recente − primeira foto + resgates − aportes no período. `null` sem fotos. */
export function realYield(snapshots: Snapshot[], flows: Flow[]): { sinceDate: string; yieldCents: number } | null {
  if (snapshots.length === 0) return null
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  let net = 0
  for (const f of flows) {
    if (f.date <= first.date || f.date > last.date) continue
    const amt = Math.abs(f.amountCents)
    net += f.kind === 'investment_in' ? amt : -amt
  }
  return { sinceDate: first.date, yieldCents: last.balanceCents - first.balanceCents - net }
}

/** Juros compostos mensais, aporte no fim de cada mês, arredondando ao centavo a cada mês. IR pelo prazo (30 dias/mês). */
export function projectMonthly(p: { startCents: number; monthlyCents: number; annualRatePct: number; months: number }): ProjectionPoint[] {
  const i = monthlyRate(p.annualRatePct)
  const out: ProjectionPoint[] = []
  let gross = p.startCents
  let invested = p.startCents
  for (let m = 1; m <= p.months; m++) {
    gross = Math.round(gross * (1 + i)) + p.monthlyCents
    invested += p.monthlyCents
    const gainCents = gross - invested
    const irCents = gainCents > 0 ? Math.round(gainCents * irRate(m * DAYS_PER_MONTH)) : 0
    out.push({ month: m, investedCents: invested, grossCents: gross, gainCents, irCents, netCents: gross - irCents })
  }
  return out
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * Estimativa do FGTS a partir do último saldo informado: a cada mês rende 3% a.a. (TR = 0) e recebe
 * 8% × (líquido do ciclo × razão bruto/líquido). `monthlyNetSalaries` = líquidos dos ciclos desde `balanceDate`.
 */
export function fgtsEstimate(p: {
  balanceCents: number
  balanceDate: string
  today: string
  monthlyNetSalaries: number[]
  grossToNetRatio: number
}): { estimateCents: number; reminderDue: boolean } {
  const i = monthlyRate(FGTS_ANNUAL_PCT)
  let bal = p.balanceCents
  for (const net of p.monthlyNetSalaries) {
    bal = Math.round(bal * (1 + i)) + Math.round(FGTS_DEPOSIT * net * p.grossToNetRatio)
  }
  return { estimateCents: bal, reminderDue: daysBetween(p.balanceDate, p.today) >= FGTS_REMINDER_DAYS }
}

/** Três cenários: ritmo atual, aporte planejado mínimo e máximo (`null` quando o aporte não existe). */
export function scenarios(p: {
  startCents: number
  annualRatePct: number
  months: number
  currentPaceCents: number | null
  plannedMinCents: number | null
  plannedMaxCents: number | null
}): { current: ProjectionPoint[] | null; min: ProjectionPoint[] | null; max: ProjectionPoint[] | null } {
  const run = (monthlyCents: number | null) =>
    monthlyCents == null ? null : projectMonthly({ startCents: p.startCents, monthlyCents, annualRatePct: p.annualRatePct, months: p.months })
  return { current: run(p.currentPaceCents), min: run(p.plannedMinCents), max: run(p.plannedMaxCents) }
}
