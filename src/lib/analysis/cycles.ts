import { addDays, type DateRule } from '@/lib/cycle/businessDays'
import { currentCycle } from '@/lib/cycle/cycle'
import type { CycleAt } from './period'

export type CycleContext = { salaryDates: string[]; rule: DateRule | null; fixedDay: number | null }

/**
 * Ciclo que contém uma data qualquer, com a mesma regra do ciclo atual (`currentCycle` visto daquele dia).
 * Se o salário seguinte caiu antes do previsto, o ciclo termina na véspera dele (sem sobrepor o próximo).
 */
export function makeCycleAt(ctx: CycleContext): CycleAt {
  const sorted = [...ctx.salaryDates].sort()
  return (date) => {
    const c = currentCycle({ today: date, salaryDates: sorted.filter((d) => d <= date), rule: ctx.rule, fixedDay: ctx.fixedDay })
    const next = sorted.find((d) => d > c.start && d > date)
    const end = next && next <= c.end ? addDays(next, -1) : c.end
    return { start: c.start, end }
  }
}
