import { describe, expect, it } from 'vitest'
import { byCategory, byPlace, type SpendTx } from './by-category'

let n = 0
const tx = (amountCents: number, categoryId: string | null, place = 'Loja', kind: string | null = amountCents < 0 ? 'expense' : 'refund'): SpendTx => ({
  id: `t${++n}`,
  date: '2026-11-10',
  amountCents,
  kind,
  categoryId,
  place,
})
const categories = [
  { id: 'mer', name: 'Mercado', monthlyLimitCents: 100000 },
  { id: 'laz', name: 'Lazer', monthlyLimitCents: null },
  { id: 'sau', name: 'Saúde', monthlyLimitCents: 50000 },
  { id: 'edu', name: 'Educação', monthlyLimitCents: null },
]

describe('byCategory', () => {
  it('soma gasto (despesa − estorno) por categoria, em ordem decrescente', () => {
    const r = byCategory([tx(-5000, 'laz'), tx(-30000, 'mer', 'Zaffari'), tx(-20000, 'mer', 'Carrefour'), tx(2000, 'mer', 'Zaffari')], [], { categories, periodDays: 30 })
    expect(r.rows.map((x) => [x.key, x.totalCents, x.count])).toEqual([
      ['mer', 48000, 2],
      ['laz', 5000, 1],
      ['sau', 0, 0],
    ])
    expect(r.totalCents).toBe(53000)
  })
  it('fora: transferência, fatura, aporte, resgate, rendimento, entrada; a confirmar aparece à parte', () => {
    const r = byCategory(
      [tx(-1000, 'mer', 'x', 'transfer'), tx(-1000, 'mer', 'x', 'card_payment'), tx(-1000, null, 'x', 'investment_in'), tx(1000, null, 'x', 'investment_out'), tx(50, null, 'x', 'savings_yield'), tx(9000, null, 'x', 'income'), tx(-700, null, 'x', 'pending_review'), tx(-300, null, 'x', null), tx(400, null, 'x', 'pending_review')],
      [],
      { categories: [], periodDays: 30 },
    )
    expect(r.rows).toEqual([])
    expect(r.totalCents).toBe(0)
    expect(r.pendingCents).toBe(1000)
  })
  it('sem categoria vira "Sem categoria"; categoria desconhecida também', () => {
    const r = byCategory([tx(-1000, null), tx(-500, 'sumiu')], [], { categories, periodDays: 30 })
    expect(r.rows[0]).toMatchObject({ key: 'sem', id: null, name: 'Sem categoria', totalCents: 1500, count: 2 })
  })
  it('variação contra o período anterior', () => {
    const r = byCategory([tx(-15000, 'mer'), tx(-1000, 'laz')], [tx(-10000, 'mer'), tx(-2000, 'edu')], { categories, periodDays: 30 })
    const by = Object.fromEntries(r.rows.map((x) => [x.key, x]))
    expect(by.mer).toMatchObject({ prevCents: 10000, deltaPct: 50 })
    expect(by.laz).toMatchObject({ prevCents: 0, deltaPct: null })
    expect(by.edu).toMatchObject({ totalCents: 0, prevCents: 2000, deltaPct: -100 })
    expect(r.prevTotalCents).toBe(12000)
  })
  it('maior estabelecimento pelo valor somado', () => {
    const r = byCategory([tx(-3000, 'mer', 'Zaffari'), tx(-3000, 'mer', 'Zaffari'), tx(-5000, 'mer', 'Carrefour')], [], { categories, periodDays: 30 })
    expect(r.rows[0].topPlace).toBe('Zaffari')
  })
  it('limite proporcional e nível da barra', () => {
    const warn = byCategory([tx(-85000, 'mer')], [], { categories, periodDays: 30 }).rows.find((x) => x.key === 'mer')!
    expect(warn).toMatchObject({ limitCents: 100000, usagePct: 85, level: 'warn' })
    const over = byCategory([tx(-30000, 'mer')], [], { categories, periodDays: 7 }).rows.find((x) => x.key === 'mer')!
    expect(over.limitCents).toBe(Math.round((100000 * 7 * 12) / 365.25))
    expect(over.level).toBe('over')
    const ok = byCategory([tx(-80000, 'mer')], [], { categories, periodDays: 30 }).rows.find((x) => x.key === 'mer')!
    expect(ok.level).toBe('ok')
    const none = byCategory([tx(-80000, 'laz')], [], { categories, periodDays: 30 }).rows.find((x) => x.key === 'laz')!
    expect(none).toMatchObject({ limitCents: null, usagePct: null, level: 'ok' })
  })
  it('empate ordena por nome', () => {
    const r = byCategory([tx(-1000, 'sau'), tx(-1000, 'laz')], [], { categories: categories.map((c) => ({ ...c, monthlyLimitCents: null })), periodDays: 30 })
    expect(r.rows.map((x) => x.name)).toEqual(['Lazer', 'Saúde'])
  })
})

describe('byPlace', () => {
  it('top estabelecimentos por gasto líquido', () => {
    const r = byPlace([tx(-3000, 'mer', 'Zaffari'), tx(1000, 'mer', 'Zaffari'), tx(-2500, 'laz', 'Cinema'), tx(-100, null, 'Padaria'), tx(-9000, null, 'X', 'transfer')], 2)
    expect(r).toEqual([
      { place: 'Cinema', totalCents: 2500, count: 1 },
      { place: 'Zaffari', totalCents: 2000, count: 1 },
    ])
  })
})
