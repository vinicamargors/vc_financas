import { describe, expect, it } from 'vitest'
import { fgtsEstimate, irRate, monthlyRate, projectMonthly, realYield, scenarios } from './index'

describe('irRate', () => {
  it('segue a tabela regressiva', () => {
    expect(irRate(0)).toBe(0.225)
    expect(irRate(180)).toBe(0.225)
    expect(irRate(181)).toBe(0.2)
    expect(irRate(360)).toBe(0.2)
    expect(irRate(361)).toBe(0.175)
    expect(irRate(720)).toBe(0.175)
    expect(irRate(721)).toBe(0.15)
  })
})

describe('projectMonthly — caso de referência: 18.400 a 105% do CDI de 14,9%, 1.500/mês, 14 meses', () => {
  const annual = 14.9 * 1.05 // 15,645% a.a.
  const series = projectMonthly({ startCents: 1_840_000, monthlyCents: 150_000, annualRatePct: annual, months: 14 })

  it('taxa mensal = (1,15645)^(1/12) − 1 ≈ 1,2187% a.m.', () => {
    expect(monthlyRate(annual)).toBeCloseTo(0.0121866, 6)
  })

  it('mês 1 conferido à mão: 18.400 × 1,0121866 = 18.624,23 (+1.500 = 20.124,23)', () => {
    expect(series[0]).toMatchObject({ month: 1, investedCents: 1_990_000, grossCents: 2_012_423 })
  })

  it('mês 14 bate com a fórmula fechada FV = P(1+i)^n + A((1+i)^n − 1)/i (±2 centavos de arredondamento)', () => {
    const i = Math.pow(1 + annual / 100, 1 / 12) - 1
    const f = Math.pow(1 + i, 14)
    const closed = 1_840_000 * f + (150_000 * (f - 1)) / i
    const last = series[13]
    expect(series).toHaveLength(14)
    expect(Math.abs(last.grossCents - closed)).toBeLessThanOrEqual(2)
    expect(last.grossCents).toBe(4_454_780) // R$ 44.547,80; fórmula fechada dá 44.547,81
    expect(last.investedCents).toBe(1_840_000 + 14 * 150_000)
    expect(last.gainCents).toBe(last.grossCents - last.investedCents)
    // 14 meses ≈ 420 dias → 17,5%
    expect(last.irCents).toBe(Math.round(last.gainCents * 0.175))
    expect(last.netCents).toBe(last.grossCents - last.irCents)
  })

  it('alíquota cai com o prazo: mês 6 (180 dias) paga 22,5%', () => {
    expect(series[5].irCents).toBe(Math.round(series[5].gainCents * 0.225))
  })

  it('sem taxa e sem aporte, nada muda', () => {
    const s = projectMonthly({ startCents: 1000, monthlyCents: 0, annualRatePct: 0, months: 2 })
    expect(s[1]).toMatchObject({ grossCents: 1000, gainCents: 0, irCents: 0, netCents: 1000 })
  })
})

describe('realYield', () => {
  it('saldo final − primeira foto + resgates − aportes', () => {
    const r = realYield(
      [
        { date: '2026-11-01', balanceCents: 100_000 },
        { date: '2026-11-28', balanceCents: 130_500 },
        { date: '2026-11-10', balanceCents: 999 },
      ],
      [
        { date: '2026-11-05', kind: 'investment_in', amountCents: 50_000 },
        { date: '2026-11-20', kind: 'investment_out', amountCents: -20_000 },
        { date: '2026-10-30', kind: 'investment_in', amountCents: 77_777 }, // antes da 1ª foto: ignorado
      ],
    )
    expect(r).toEqual({ sinceDate: '2026-11-01', yieldCents: 500 })
  })
  it('sem fotos → null', () => {
    expect(realYield([], [])).toBeNull()
  })
})

describe('fgtsEstimate', () => {
  it('8% do bruto estimado por mês, rendendo 3% a.a. (TR = 0)', () => {
    const r = fgtsEstimate({
      balanceCents: 1_000_000,
      balanceDate: '2026-09-01',
      today: '2026-11-28',
      monthlyNetSalaries: [500_000, 500_000],
      grossToNetRatio: 1.25,
    })
    // i = 1,03^(1/12) − 1 ≈ 0,0024663; depósito = 8% × 6.250 = 500,00
    // mês 1: 10.000 × 1,0024663 = 10.024,66 + 500 = 10.524,66
    // mês 2: 10.524,66 × 1,0024663 = 10.550,62 + 500 = 11.050,62
    expect(r.estimateCents).toBe(1_105_062)
    expect(r.reminderDue).toBe(false) // 88 dias
  })
  it('lembrete a cada 90 dias', () => {
    const r = fgtsEstimate({ balanceCents: 1, balanceDate: '2026-08-30', today: '2026-11-28', monthlyNetSalaries: [], grossToNetRatio: 1 })
    expect(r).toEqual({ estimateCents: 1, reminderDue: true })
  })
})

describe('scenarios', () => {
  it('ritmo atual, mínimo e máximo planejados', () => {
    const s = scenarios({ startCents: 1_840_000, annualRatePct: 15.645, months: 14, currentPaceCents: 150_000, plannedMinCents: 100_000, plannedMaxCents: null })
    expect(s.current?.at(-1)?.grossCents).toBe(4_454_780)
    expect(s.min?.at(-1)?.investedCents).toBe(1_840_000 + 14 * 100_000)
    expect(s.max).toBeNull()
  })
})
