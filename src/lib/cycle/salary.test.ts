import { describe, expect, it } from 'vitest'
import { pickSalaries, splitCycleIncome, type IncomeRow, type SalarySource } from './salary'

const acme: SalarySource = { id: 'acme', kind: 'salary', dateRule: 'penultimate_business_day', fixedDay: null }
const row = (id: string, date: string, amountCents: number, incomeSourceId: string | null = 'acme'): IncomeRow => ({ id, date, amountCents, incomeSourceId })

describe('pickSalaries', () => {
  it('salário e PLR do mesmo pagador: o maior perto do previsto é o salário', () => {
    // Previsto de novembro/2026: 27/11. PLR maior, mas longe (10/11): renda extra.
    const incomes = [row('plr', '2026-11-10', 900_000), row('sal', '2026-11-27', 850_000), row('adiant', '2026-11-25', 100_000)]
    expect(pickSalaries(incomes, [acme]).map((s) => s.id)).toEqual(['sal'])
  })

  it('±5 dias do previsto; um salário por mês; ignora outras fontes e fontes extra', () => {
    const extra: SalarySource = { id: 'freela', kind: 'extra', dateRule: 'last_business_day', fixedDay: null }
    const incomes = [
      row('out', '2026-10-29', 800_000),
      row('nov', '2026-12-02', 800_000), // 5 dias depois de 27/11
      row('longe', '2026-12-08', 999_000),
      row('fr', '2026-11-30', 500_000, 'freela'),
      row('sem', '2026-11-27', 500_000, null),
    ]
    expect(pickSalaries(incomes, [acme, extra]).map((s) => s.id)).toEqual(['out', 'nov'])
  })
})

describe('splitCycleIncome', () => {
  it('salário do ciclo e o resto da renda do ciclo como extra', () => {
    const incomes = [row('sal', '2026-11-27', 850_000), row('plr', '2026-12-10', 300_000), row('pix', '2026-12-01', 5_000, null), row('velho', '2026-11-10', 1_000)]
    const salaries = pickSalaries(incomes, [acme])
    expect(splitCycleIncome(incomes, salaries, { start: '2026-11-27', end: '2026-12-29' })).toEqual({
      salaryCents: 850_000, extrasCents: 305_000, salaryIds: ['sal'],
    })
  })
})
