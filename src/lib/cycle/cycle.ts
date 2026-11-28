import { addDays, daysBetween, expectedPayday, lastDayOfMonth, parseYmd, ymd, type DateRule } from './businessDays'

export type Cycle = {
  start: string
  end: string
  nextPayday: string | null
  source: 'salary' | 'expected' | 'calendar'
}

export type CycleInput = {
  today: string
  salaryDates: string[]
  rule: DateRule | null
  fixedDay?: number | null
}

const SALARY_LOOKBACK_DAYS = 40

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const idx = year * 12 + (month - 1) + delta
  return [Math.floor(idx / 12), (idx % 12) + 1]
}

/**
 * Ciclo atual: começa no último salário (até 40 dias atrás) e termina na véspera do próximo salário previsto.
 * Sem salário recente, começa na data prevista do mês (ou do mês anterior, se ainda não chegou).
 * Sem regra, é o mês do calendário. Se o próximo salário já passou da data prevista sem cair (atrasado),
 * ele é esperado hoje e o ciclo vai até hoje.
 */
export function currentCycle({ today, salaryDates, rule, fixedDay }: CycleInput): Cycle {
  const [ty, tm] = parseYmd(today)
  if (!rule) {
    return { start: ymd(ty, tm, 1), end: ymd(ty, tm, lastDayOfMonth(ty, tm)), nextPayday: null, source: 'calendar' }
  }
  const payday = (y: number, m: number) => expectedPayday(y, m, rule, fixedDay)

  const lastSalary = salaryDates
    .filter((d) => d <= today && daysBetween(d, today) <= SALARY_LOOKBACK_DAYS)
    .sort()
    .at(-1)

  if (lastSalary) {
    // O salário pertence ao mês cuja data prevista é a mais próxima (cobre pagamento adiantado ou atrasado).
    const [sy, sm] = parseYmd(lastSalary)
    const [by, bm] = [-1, 0, 1]
      .map((delta) => shiftMonth(sy, sm, delta))
      .reduce((best, cand) =>
        Math.abs(daysBetween(lastSalary, payday(...cand))) < Math.abs(daysBetween(lastSalary, payday(...best))) ? cand : best)
    const next = payday(...shiftMonth(by, bm, 1))
    if (next <= today) return { start: lastSalary, end: today, nextPayday: today, source: 'salary' }
    return { start: lastSalary, end: addDays(next, -1), nextPayday: next, source: 'salary' }
  }

  const thisMonth = payday(ty, tm)
  const [sy, sm] = thisMonth <= today ? [ty, tm] : shiftMonth(ty, tm, -1)
  const next = payday(...shiftMonth(sy, sm, 1))
  return { start: payday(sy, sm), end: addDays(next, -1), nextPayday: next, source: 'expected' }
}
