import { describe, expect, it } from 'vitest'
import { groupByDay, statementYield } from './statement'

const tx = (date: string, amountCents: number, deletedAt: string | null = null) => ({ date, amountCents, deletedAt })

describe('groupByDay', () => {
  it('ignora apagadas e soma o total do dia', () => {
    const r = groupByDay([tx('2026-11-26', -500), tx('2026-11-26', 200), tx('2026-11-26', -9999, '2026-11-27T00:00:00Z')])
    expect(r).toHaveLength(1)
    expect(r[0].totalCents).toBe(-300)
    expect(r[0].items).toHaveLength(2)
  })
  it('ordena dias desc', () => {
    expect(groupByDay([tx('2026-11-01', 1), tx('2026-11-20', 1), tx('2026-11-10', 1)]).map((g) => g.date)).toEqual([
      '2026-11-20', '2026-11-10', '2026-11-01',
    ])
  })
  it('vazio', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('statementYield', () => {
  it('kind gravado na sincronização vence', () => {
    expect(statementYield({ kind: 'savings_yield', description_raw: 'Qualquer' }, false)).toBe(true)
  })
  it('linhas antigas: descrição + conta com caixinha', () => {
    expect(statementYield({ kind: null, description_raw: 'Rendimento' }, true)).toBe(true)
    expect(statementYield({ kind: null, description_raw: 'Rendimento' }, false)).toBe(false)
    expect(statementYield({ kind: null, description_raw: 'Pix recebido' }, true)).toBe(false)
  })
})
