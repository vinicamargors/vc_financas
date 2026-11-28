import { describe, expect, it } from 'vitest'
import { goalOutlook } from './goal'
import { projectMonthly } from './index'

describe('goalOutlook', () => {
  const base = { boxesCents: 1_840_000, cdiAnnualPct: 14.9, cdiPercent: 105, months: 14, pace: { currentCents: 150_000, minCents: 100_000, maxCents: 200_000 } }

  it('sem FGTS: cenários iguais à projeção das caixinhas', () => {
    const o = goalOutlook({ ...base, fgts: null })
    expect(o.potentialCents).toBe(1_840_000)
    expect(o.scenarios.map((s) => s.key)).toEqual(['current', 'min', 'max'])
    const cur = o.scenarios[0]
    expect(cur.values).toHaveLength(15) // hoje + 14 meses
    expect(cur.values[0]).toBe(1_840_000)
    expect(cur.grossCents).toBe(4_454_780)
    expect(cur.netCents).toBe(projectMonthly({ startCents: 1_840_000, monthlyCents: 150_000, annualRatePct: 15.645, months: 14 })[13].netCents)
  })

  it('com FGTS: soma o FGTS (3% a.a. + depósito, sem IR) ao potencial e a cada cenário', () => {
    const o = goalOutlook({ ...base, fgts: { balanceCents: 1_000_000, monthlyDepositCents: 80_000 } })
    expect(o.potentialCents).toBe(2_840_000)
    const fgtsEnd = projectMonthly({ startCents: 1_000_000, monthlyCents: 80_000, annualRatePct: 3, months: 14 })[13].grossCents
    expect(o.scenarios[0].grossCents).toBe(4_454_780 + fgtsEnd)
    expect(o.scenarios[0].netCents - o.scenarios[0].grossCents).toBe(-o.scenarios[0].irCents)
  })

  it('cenário sem aporte definido fica de fora; sem CDI → null', () => {
    expect(goalOutlook({ ...base, fgts: null, pace: { currentCents: 0, minCents: null, maxCents: null } }).scenarios.map((s) => s.key)).toEqual(['current'])
    expect(goalOutlook({ ...base, cdiAnnualPct: null, fgts: null }).scenarios).toEqual([])
  })
})
