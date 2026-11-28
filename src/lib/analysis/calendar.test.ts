import { describe, expect, it } from 'vitest'
import { buildBars, dailySpend, heat, monthGrid, parseMonth, weeklyInOut } from './calendar'
import { parseRange } from './period'

describe('parseMonth', () => {
  it('padrão e inválidos viram o mês de hoje; futuro também', () => {
    expect(parseMonth(undefined, '2026-11-12')).toBe('2026-11')
    expect(parseMonth('2026-13', '2026-11-12')).toBe('2026-11')
    expect(parseMonth('2027-01', '2026-11-12')).toBe('2026-11')
    expect(parseMonth('2026-02', '2026-11-12')).toBe('2026-02')
  })
})

describe('monthGrid', () => {
  it('semanas de segunda a domingo, com vazios nas pontas', () => {
    const g = monthGrid('2026-11')
    expect(g[0]).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(g[1][0]).toBe('2026-11-02')
    expect(g.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null])
    expect(g.flat().filter(Boolean)).toHaveLength(30)
  })
})

describe('dailySpend e heat', () => {
  const txs = [
    { date: '2026-11-02', amountCents: -1000, kind: 'expense', accountId: 'a' },
    { date: '2026-11-02', amountCents: 200, kind: 'refund', accountId: 'a' },
    { date: '2026-11-02', amountCents: -5000, kind: 'transfer', accountId: 'a' },
    { date: '2026-11-03', amountCents: -400, kind: 'expense', accountId: 'a' },
  ]
  it('gasto por dia = despesa − estorno', () => expect(Object.fromEntries(dailySpend(txs))).toEqual({ '2026-11-02': 800, '2026-11-03': 400 }))
  it('intensidade proporcional ao maior dia', () => {
    expect(heat(800, 800)).toBe(1)
    expect(heat(400, 800)).toBe(0.5)
    expect(heat(0, 800)).toBe(0)
    expect(heat(-10, 800)).toBe(0)
    expect(heat(10, 0)).toBe(0)
  })
})

describe('weeklyInOut', () => {
  it('entradas (fora do VR) e gasto por semana do mês', () => {
    const types = new Map([
      ['bank', 'BANK' as const],
      ['vr', 'BENEFIT' as const],
    ])
    const txs = [
      { date: '2026-11-01', amountCents: 500000, kind: 'income', accountId: 'bank' },
      { date: '2026-11-01', amountCents: 80000, kind: 'income', accountId: 'vr' },
      { date: '2026-11-01', amountCents: -3000, kind: 'expense', accountId: 'vr' },
      { date: '2026-11-04', amountCents: -2000, kind: 'expense', accountId: 'bank' },
      { date: '2026-11-04', amountCents: 100, kind: 'savings_yield', accountId: 'bank' },
    ]
    const r = weeklyInOut(txs, monthGrid('2026-11'), types)
    expect(r[0]).toEqual({ start: '2026-11-01', end: '2026-11-01', inCents: 500000, outCents: 3000 })
    expect(r[1]).toEqual({ start: '2026-11-02', end: '2026-11-08', inCents: 0, outCents: 2000 })
    expect(r).toHaveLength(6)
  })
})

describe('buildBars', () => {
  const box = { width: 300, height: 150, padTop: 10, padBottom: 20, padLeft: 40, padRight: 10 }
  it('escala começa em zero e a altura é proporcional', () => {
    const b = buildBars([{ inCents: 100000, outCents: 50000 }, { inCents: 0, outCents: 25000 }], box)
    expect(b.yMax).toBe(100000)
    expect(b.ticks).toEqual([0, 25000, 50000, 75000, 100000])
    const plotH = 150 - 10 - 20
    expect(b.groups[0].in.h).toBe(plotH)
    expect(b.groups[0].out.h).toBe(plotH / 2)
    expect(b.groups[1].in.h).toBe(0)
    expect(b.groups[0].out.y + b.groups[0].out.h).toBe(150 - 20)
  })
  it('sem dados não divide por zero', () => {
    const b = buildBars([{ inCents: 0, outCents: 0 }], box)
    expect(b.groups[0].in.h).toBe(0)
    expect(b.yMax).toBeGreaterThan(0)
  })
})

describe('parseRange', () => {
  it('aceita intervalo válido', () => expect(parseRange('2026-11-01', '2026-11-30')).toEqual({ start: '2026-11-01', end: '2026-11-30' }))
  it('recusa invertido, inválido ou longo demais', () => {
    expect(parseRange('2026-11-30', '2026-11-01')).toBeNull()
    expect(parseRange('2026-11-31', '2026-12-01')).toBeNull()
    expect(parseRange('2000-01-01', '2026-01-01')).toBeNull()
    expect(parseRange(1, '2026-01-01')).toBeNull()
  })
})
