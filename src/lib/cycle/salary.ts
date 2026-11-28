import { daysBetween, expectedPayday, parseYmd, type DateRule } from './businessDays'

export type IncomeRow = { id: string; date: string; amountCents: number; incomeSourceId: string | null }
export type SalarySource = { id: string; kind: 'salary' | 'extra'; dateRule: DateRule; fixedDay: number | null }

const PAYDAY_TOLERANCE_DAYS = 5

/** Datas previstas do salário no mês da entrada e nos vizinhos. */
function nearbyPaydays(date: string, src: SalarySource): string[] {
  const [y, m] = parseYmd(date)
  return [-1, 0, 1].map((d) => {
    const idx = y * 12 + (m - 1) + d
    return expectedPayday(Math.floor(idx / 12), (idx % 12) + 1, src.dateRule, src.fixedDay)
  })
}

/**
 * Salários reconhecidos: para cada fonte `salary` e cada data prevista, a maior entrada da fonte a até
 * 5 dias dela (empate: a mais cedo). As outras entradas do pagador são renda extra. Ordem por data.
 */
export function pickSalaries(incomes: IncomeRow[], sources: SalarySource[]): IncomeRow[] {
  const best = new Map<string, IncomeRow>()
  for (const src of sources) {
    if (src.kind !== 'salary') continue
    for (const r of incomes) {
      if (r.incomeSourceId !== src.id || r.amountCents <= 0) continue
      const payday = nearbyPaydays(r.date, src).find((p) => Math.abs(daysBetween(p, r.date)) <= PAYDAY_TOLERANCE_DAYS)
      if (!payday) continue
      const key = `${src.id}|${payday}`
      const cur = best.get(key)
      if (!cur || r.amountCents > cur.amountCents || (r.amountCents === cur.amountCents && r.date < cur.date)) best.set(key, r)
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** Salário do ciclo e o resto da renda do ciclo (extras). */
export function splitCycleIncome(
  incomes: IncomeRow[],
  salaries: IncomeRow[],
  cycle: { start: string; end: string },
): { salaryCents: number; extrasCents: number; salaryIds: string[] } {
  const inCycle = (d: string) => d >= cycle.start && d <= cycle.end
  const salaryIds = salaries.filter((s) => inCycle(s.date)).map((s) => s.id)
  const ids = new Set(salaryIds)
  let salaryCents = 0
  let extrasCents = 0
  for (const r of incomes) {
    if (!inCycle(r.date) || r.amountCents <= 0) continue
    if (ids.has(r.id)) salaryCents += r.amountCents
    else extrasCents += r.amountCents
  }
  return { salaryCents, extrasCents, salaryIds }
}
