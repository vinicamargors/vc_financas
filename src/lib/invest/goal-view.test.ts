import { describe, expect, it } from 'vitest'
import { buildGoalView } from './goal-view'

const goal = { id: 'g', name: 'Casa', targetCents: null, targetDate: null, plannedMinCents: 100_000, plannedMaxCents: 200_000, includeFgts: true, boxIds: ['a'] }

describe('buildGoalView', () => {
  it('só caixinhas da meta; data-alvo padrão jan/2028; FGTS somado ao potencial', () => {
    const v = buildGoalView(goal, {
      boxes: [{ id: 'a', balanceCents: 1_840_000, cdiPercent: 105 }, { id: 'b', balanceCents: 999, cdiPercent: 100 }],
      cdi: 14.9,
      today: '2026-11-28',
      paceCents: 150_000,
      fgts: { estimateCents: 1_000_000, monthlyDepositCents: 80_000 },
    })
    expect(v.boxesCents).toBe(1_840_000)
    expect(v.fgtsCents).toBe(1_000_000)
    expect(v.potentialCents).toBe(2_840_000)
    expect(v.targetDate).toBe('2028-01-31')
    expect(v.months).toBe(14)
    expect(v.scenarios.map((s) => s.monthlyCents)).toEqual([150_000, 100_000, 200_000])
  })
  it('sem FGTS na meta, ignora o FGTS', () => {
    const v = buildGoalView({ ...goal, includeFgts: false }, { boxes: [], cdi: null, today: '2026-11-28', paceCents: -5, fgts: { estimateCents: 1, monthlyDepositCents: 1 } })
    expect(v.fgtsCents).toBeNull()
    expect(v.potentialCents).toBe(0)
  })
})
