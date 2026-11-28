import { addDays, daysBetween, expectedPayday, lastDayOfMonth, parseYmd, ymd, type DateRule } from './businessDays'

export type Cycle = {
  start: string
  end: string
  nextPayday: string | null
  source: 'salary' | 'expected' | 'calendar'
  /** O salário previsto (nextPayday) já chegou e não caiu. */
  late: boolean
}

export type CycleInput = {
  today: string
  salaryDates: string[]
  rule: DateRule | null
  fixedDay?: number | null
}

const LATE_CAP_DAYS = 45
const EARLY_TOLERANCE_DAYS = 10

function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const idx = year * 12 + (month - 1) + delta
  return [Math.floor(idx / 12), (idx % 12) + 1]
}

/**
 * Ciclo atual: começa no último salário e termina na véspera do próximo salário previsto.
 * Um salário pertence ao mês M se cai a partir de 10 dias antes do previsto de M e antes de (previsto de M+1 − 10 dias).
 * Se o previsto seguinte já chegou sem salário, o ciclo é marcado `late` e se estende como se ele fosse cair
 * (fim = véspera do previsto do mês depois). Sem salário há mais de 45 dias é o mês do calendário, ainda `late`; sem regra, mês do calendário.
 * Sem nenhum salário registrado, começa na data prevista do mês (ou do mês anterior, se ainda não chegou).
 */
export function currentCycle({ today, salaryDates, rule, fixedDay }: CycleInput): Cycle {
  const [ty, tm] = parseYmd(today)
  const calendar: Cycle = {
    start: ymd(ty, tm, 1), end: ymd(ty, tm, lastDayOfMonth(ty, tm)), nextPayday: null, source: 'calendar', late: false,
  }
  if (!rule) return calendar
  const payday = (y: number, m: number) => expectedPayday(y, m, rule, fixedDay)

  const lastSalary = salaryDates.filter((d) => d <= today).sort().at(-1)

  if (lastSalary) {
    if (daysBetween(lastSalary, today) > LATE_CAP_DAYS) return { ...calendar, late: true }
    const [sy, sm] = parseYmd(lastSalary)
    const [my, mm] = [1, 0, -1]
      .map((delta) => shiftMonth(sy, sm, delta))
      .find((m) => addDays(payday(...m), -EARLY_TOLERANCE_DAYS) <= lastSalary)!
    const next = payday(...shiftMonth(my, mm, 1))
    if (next <= today) {
      const after = payday(...shiftMonth(my, mm, 2))
      return { start: lastSalary, end: addDays(after, -1), nextPayday: next, source: 'salary', late: true }
    }
    return { start: lastSalary, end: addDays(next, -1), nextPayday: next, source: 'salary', late: false }
  }

  const thisMonth = payday(ty, tm)
  const [sy, sm] = thisMonth <= today ? [ty, tm] : shiftMonth(ty, tm, -1)
  const next = payday(...shiftMonth(sy, sm, 1))
  return { start: payday(sy, sm), end: addDays(next, -1), nextPayday: next, source: 'expected', late: false }
}
