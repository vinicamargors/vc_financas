import { describe, expect, it } from 'vitest'
import { isMissingTable, sumByDate, weightedCdiPercent } from './invest'

describe('isMissingTable', () => {
  it('reconhece tabela ausente (PostgREST e Postgres)', () => {
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable({ code: '23503' })).toBe(false)
    expect(isMissingTable(null)).toBe(false)
  })
})

describe('sumByDate', () => {
  it('soma as fotos de várias caixinhas por dia', () => {
    expect(sumByDate([{ date: '2026-11-02', balanceCents: 1 }, { date: '2026-11-01', balanceCents: 2 }, { date: '2026-11-02', balanceCents: 3 }])).toEqual([
      { date: '2026-11-01', balanceCents: 2 },
      { date: '2026-11-02', balanceCents: 4 },
    ])
  })
})

describe('weightedCdiPercent', () => {
  it('média do % do CDI ponderada pelo saldo; sem dado → 100', () => {
    expect(weightedCdiPercent([{ balanceCents: 100, cdiPercent: 100 }, { balanceCents: 300, cdiPercent: 120 }])).toBe(115)
    expect(weightedCdiPercent([{ balanceCents: 100, cdiPercent: null }])).toBe(100)
    expect(weightedCdiPercent([])).toBe(100)
  })
})
