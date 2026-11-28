import { describe, expect, it } from 'vitest'
import { countsInDayTotal, realSpending, recentWindowStart, sumRealSpending } from './totals'

const r = (kind: string | null, amountCents: number) => ({ kind, amountCents })

describe('realSpending', () => {
  it('gasto = despesas menos estornos', () => {
    expect(realSpending([r('expense', -10000), r('expense', -2500), r('refund', 3000)])).toEqual({ spendingCents: 9500, pendingCents: 0 })
  })
  it('transferência, fatura, aporte, resgate, rendimento, entrada e kind nulo ficam fora', () => {
    const rows = [
      r('transfer', -50000),
      r('card_payment', -90000),
      r('investment_in', -30000),
      r('investment_out', 30000),
      r('savings_yield', 120),
      r('income', 800000),
      r(null, -777),
      r('expense', -1000),
    ]
    expect(realSpending(rows)).toEqual({ spendingCents: 1000, pendingCents: 0 })
  })
  it('a confirmar soma só saídas (negativas), em valor absoluto, fora do gasto', () => {
    expect(realSpending([r('expense', -1000), r('pending_review', -4000), r('pending_review', 500)])).toEqual({
      spendingCents: 1000,
      pendingCents: 4000,
    })
  })
  it('vazio', () => expect(realSpending([])).toEqual({ spendingCents: 0, pendingCents: 0 }))
})

describe('countsInDayTotal', () => {
  it('só despesa, entrada e estorno', () => {
    for (const k of ['expense', 'income', 'refund']) expect(countsInDayTotal(k)).toBe(true)
    for (const k of ['transfer', 'card_payment', 'investment_in', 'investment_out', 'savings_yield', 'pending_review', null])
      expect(countsInDayTotal(k)).toBe(false)
  })
})

describe('recentWindowStart', () => {
  it('30 dias com hoje incluso', () => {
    expect(recentWindowStart('2026-11-30')).toBe('2026-11-01')
    expect(recentWindowStart('2026-03-01')).toBe('2026-01-31')
  })
})

describe('sumRealSpending (paginado)', () => {
  it('soma todas as 2500 linhas, de 1000 em 1000', async () => {
    const all = Array.from({ length: 2500 }, () => r('expense', -100))
    const calls: [number, number][] = []
    const out = await sumRealSpending(async (from, to) => {
      calls.push([from, to])
      return all.slice(from, to + 1)
    })
    expect(out).toEqual({ spendingCents: 250000, pendingCents: 0 })
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it('página cheia seguida de vazia termina', async () => {
    const all = Array.from({ length: 1000 }, () => r('expense', -1))
    const out = await sumRealSpending(async (from, to) => all.slice(from, to + 1))
    expect(out.spendingCents).toBe(1000)
  })
})
