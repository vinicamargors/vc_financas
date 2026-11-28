import { describe, expect, it } from 'vitest'
import { averageMonthlyNet, cycleSaved, defaultTargetDate, monthsUntil, salariesSince } from './plan'

describe('datas', () => {
  it('alvo padrão: janeiro do ano seguinte + 1', () => {
    expect(defaultTargetDate('2026-11-28')).toBe('2028-01-31')
  })
  it('meses inteiros até a data-alvo (mínimo 1)', () => {
    expect(monthsUntil('2026-11-28', '2028-01-31')).toBe(14)
    expect(monthsUntil('2026-11-28', '2026-12-10')).toBe(1)
    expect(monthsUntil('2026-11-28', '2026-01-01')).toBe(1)
  })
})

describe('averageMonthlyNet', () => {
  it('média dos aportes líquidos nos 3 ciclos', () => {
    const flows = [
      { date: '2026-09-05', kind: 'investment_in' as const, amountCents: -150_000 },
      { date: '2026-10-05', kind: 'investment_in' as const, amountCents: -150_000 },
      { date: '2026-11-05', kind: 'investment_out' as const, amountCents: 30_000 },
      { date: '2026-08-01', kind: 'investment_in' as const, amountCents: -999_999 },
    ]
    expect(averageMonthlyNet(flows, ['2026-08-28', '2026-09-29', '2026-10-30'], '2026-11-28')).toBe(90_000)
  })
  it('sem ciclos conhecidos usa os últimos 90 dias', () => {
    expect(averageMonthlyNet([{ date: '2026-11-01', kind: 'investment_in', amountCents: -30_000 }], [], '2026-11-28')).toBe(10_000)
  })
})

describe('cycleSaved / salariesSince', () => {
  it('soma aportes líquidos no ciclo', () => {
    expect(cycleSaved([{ date: '2026-11-01', kind: 'investment_in', amountCents: -50_000 }, { date: '2026-10-29', kind: 'investment_in', amountCents: -1 }], '2026-10-30', '2026-11-28')).toBe(50_000)
  })
  it('só salários depois da data do saldo', () => {
    expect(salariesSince([{ date: '2026-10-30', amountCents: 1 }, { date: '2026-11-01', amountCents: 2 }, { date: '2026-11-28', amountCents: 3 }], '2026-11-01')).toEqual([3])
  })
})

describe('monthLabel', () => {
  it('jan/2028', async () => {
    const { monthLabel } = await import('./plan')
    expect(monthLabel('2028-01-31')).toBe('jan/2028')
    expect(monthLabel('2026-11-28')).toBe('nov/2026')
  })
})

describe('addMonths', () => {
  it('limita ao fim do mês', async () => {
    const { addMonths } = await import('./plan')
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28')
    expect(addMonths('2026-11-28', 12)).toBe('2027-11-28')
  })
})
