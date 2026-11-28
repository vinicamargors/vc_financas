import { describe, expect, it } from 'vitest'
import { formatCdiPercent, summarizeSavings, type SavingsBox } from './savings'

const box = (id: string, balanceCents: number, cdiPercent: number | null = 120): SavingsBox => ({
  id,
  name: null,
  balanceCents,
  cdiPercent,
  institution: 'Mercado Pago',
  logoUrl: null,
})

describe('summarizeSavings', () => {
  it('soma total e rendimento diário', () => {
    const r = summarizeSavings([box('a', 1_000_000), box('b', 500, null)], [], 14.9)
    expect(r.totalCents).toBe(1_000_500)
    expect(r.dailyYieldCents).toBe(653)
    expect(r.change).toBeNull()
  })
  it('sem CDI não estima', () => expect(summarizeSavings([box('a', 100)], [], null).dailyYieldCents).toBeNull())
  it('variação entre primeiro e último dia', () => {
    const r = summarizeSavings(
      [box('a', 0)],
      [
        { date: '2026-11-28', balanceCents: 700 },
        { date: '2026-11-20', balanceCents: 300 },
        { date: '2026-11-20', balanceCents: 200 },
        { date: '2026-11-28', balanceCents: 100 },
      ],
      null,
    )
    expect(r.change).toEqual({ sinceDate: '2026-11-20', cents: 300 })
  })
})

describe('formatCdiPercent', () => {
  it('arredonda', () => {
    expect(formatCdiPercent(119.9983)).toBe('120% do CDI')
    expect(formatCdiPercent(122.999)).toBe('123% do CDI')
    expect(formatCdiPercent(102.5)).toBe('102,5% do CDI')
  })
})
