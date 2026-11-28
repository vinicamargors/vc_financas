import { describe, expect, it } from 'vitest'
import { makeCycleAt } from './cycles'

describe('makeCycleAt', () => {
  const salaries = ['2026-08-28', '2026-09-29', '2026-10-29', '2026-11-26']
  const cycleAt = makeCycleAt({ salaryDates: salaries, rule: 'penultimate_business_day', fixedDay: null })
  it('ciclo passado vai de salário a véspera do seguinte', () => {
    expect(cycleAt('2026-10-10')).toEqual({ start: '2026-09-29', end: '2026-10-28' })
  })
  it('salário adiantado corta o fim do ciclo anterior', () => {
    // previsto para 27/11; caiu em 26/11
    expect(cycleAt('2026-11-20')).toEqual({ start: '2026-10-29', end: '2026-11-25' })
  })
  it('ciclo atual', () => expect(cycleAt('2026-11-27').start).toBe('2026-11-26'))
  it('sem regra: mês do calendário', () => {
    expect(makeCycleAt({ salaryDates: [], rule: null, fixedDay: null })('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})
