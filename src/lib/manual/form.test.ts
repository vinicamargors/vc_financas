import { describe, expect, it } from 'vitest'
import { parseManualForm } from './form'

const ACC = '11111111-1111-4111-8111-111111111111'
const CAT = '22222222-2222-4222-8222-222222222222'
const g = (o: Record<string, string>) => (k: string) => o[k] ?? null
const now = new Date('2026-11-28T15:00:00Z') // 12:00 em SP

describe('parseManualForm', () => {
  it('gasto: valor negativo, data/hora de São Paulo convertida', () => {
    expect(parseManualForm(g({ kind: 'expense', account: ACC, amount: '45,90', description: ' Padaria ', category: CAT, at: '2026-11-27T21:30' }), now)).toEqual({
      ok: true,
      value: { kind: 'expense', accountId: ACC, amountCents: -4_590, description: 'Padaria', categoryId: CAT, date: '2026-11-27', occurredAt: '2026-11-28T00:30:00.000Z' },
    })
  })
  it('entrada positiva; sem data usa agora; sem categoria → null', () => {
    expect(parseManualForm(g({ kind: 'income', account: ACC, amount: '100', description: 'Pix' }), now)).toEqual({
      ok: true,
      value: { kind: 'income', accountId: ACC, amountCents: 10_000, description: 'Pix', categoryId: null, date: '2026-11-28', occurredAt: '2026-11-28T15:00:00.000Z' },
    })
  })
  it('erros', () => {
    const ok = { kind: 'expense', account: ACC, amount: '1', description: 'x' }
    expect(parseManualForm(g({ ...ok, kind: 'transfer' }), now)).toEqual({ ok: false, error: 'tipo' })
    expect(parseManualForm(g({ ...ok, account: 'abc' }), now)).toEqual({ ok: false, error: 'conta' })
    expect(parseManualForm(g({ ...ok, amount: '0' }), now)).toEqual({ ok: false, error: 'valor' })
    expect(parseManualForm(g({ ...ok, description: '' }), now)).toEqual({ ok: false, error: 'descricao' })
    expect(parseManualForm(g({ ...ok, category: 'x' }), now)).toEqual({ ok: false, error: 'categoria' })
    expect(parseManualForm(g({ ...ok, at: '2026-13-01T10:00' }), now)).toEqual({ ok: false, error: 'data' })
    expect(parseManualForm(g({ ...ok, at: '2026-12-10T10:00' }), now)).toEqual({ ok: false, error: 'data' })
  })
})
