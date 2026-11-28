import { afterEach, describe, expect, it, vi } from 'vitest'
import { dailyYieldCents, getCdiAnnual, parseSgs } from './cdi'

describe('parseSgs', () => {
  it('lê data e vírgula decimal', () => {
    expect(parseSgs([{ data: '27/11/2026', valor: '14,90' }])).toEqual({ date: '2026-11-27', annualPct: 14.9 })
  })
  it('rejeita formatos inválidos', () => {
    expect(parseSgs([])).toBeNull()
    expect(parseSgs({})).toBeNull()
    expect(parseSgs([{ data: '2026-11-27', valor: '14,90' }])).toBeNull()
    expect(parseSgs([{ data: '27/11/2026', valor: 'abc' }])).toBeNull()
  })
})

describe('dailyYieldCents', () => {
  it('120% de CDI 14,90% sobre R$ 10.000', () => {
    // (1 + 0.1788)^(1/252) - 1 ≈ 0.000653 → ≈ R$ 6,53
    expect(dailyYieldCents(1_000_000, 14.9, 120)).toBe(653)
  })
  it('zero para saldo ou taxa nulos', () => {
    expect(dailyYieldCents(0, 14.9, 120)).toBe(0)
    expect(dailyYieldCents(1000, 0, 120)).toBe(0)
  })
})

describe('getCdiAnnual', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('retorna o valor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ data: '27/11/2026', valor: '14,90' }]))))
    expect(await getCdiAnnual()).toBe(14.9)
  })
  it('null em falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await getCdiAnnual()).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    expect(await getCdiAnnual()).toBeNull()
  })
})
