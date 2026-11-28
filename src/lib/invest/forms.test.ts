import { describe, expect, it } from 'vitest'
import { parseFgtsForm, parseGoalForm } from './forms'

const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-11-28'
const getter = (o: Record<string, string>) => (k: string) => o[k] ?? null

describe('parseGoalForm', () => {
  it('aceita meta completa', () => {
    const r = parseGoalForm(getter({ name: ' Casa ', target: '100.000,00', targetDate: '2028-01-31', min: '1.000', max: '2.000', fgts: 'on' }), [B1, B1, B2], TODAY)
    expect(r).toEqual({
      ok: true,
      value: { name: 'Casa', targetCents: 10_000_000, targetDate: '2028-01-31', plannedMinCents: 100_000, plannedMaxCents: 200_000, includeFgts: true, boxIds: [B1, B2] },
    })
  })
  it('campos opcionais vazios viram null', () => {
    const r = parseGoalForm(getter({ name: 'Viagem' }), [], TODAY)
    expect(r).toMatchObject({ ok: true, value: { targetCents: null, targetDate: null, plannedMinCents: null, plannedMaxCents: null, includeFgts: false } })
  })
  it('erros', () => {
    expect(parseGoalForm(getter({ name: '' }), [], TODAY)).toEqual({ ok: false, error: 'nome' })
    expect(parseGoalForm(getter({ name: 'x', target: 'abc' }), [], TODAY)).toEqual({ ok: false, error: 'alvo' })
    expect(parseGoalForm(getter({ name: 'x', targetDate: '2028-02-30' }), [], TODAY)).toEqual({ ok: false, error: 'data' })
    expect(parseGoalForm(getter({ name: 'x', min: '-1' }), [], TODAY)).toEqual({ ok: false, error: 'aporte' })
    expect(parseGoalForm(getter({ name: 'x', min: '3.000', max: '2.000' }), [], TODAY)).toEqual({ ok: false, error: 'faixa' })
    expect(parseGoalForm(getter({ name: 'x', targetDate: '2026-11-27' }), [], TODAY)).toEqual({ ok: false, error: 'data' })
    expect(parseGoalForm(getter({ name: 'x' }), ['nao-e-uuid'], TODAY)).toEqual({ ok: false, error: 'caixinha' })
  })
})

describe('parseFgtsForm', () => {
  it('aceita saldo zero e campos opcionais', () => {
    expect(parseFgtsForm(getter({ balance: '0', balanceDate: '2026-11-01' }), '2026-11-28')).toEqual({
      ok: true,
      value: { balanceCents: 0, balanceDate: '2026-11-01', grossSalaryCents: null, referenceNetCents: null },
    })
    expect(parseFgtsForm(getter({ balance: '30.000,00', balanceDate: '2026-11-01', gross: '10.000', net: '7.500' }), '2026-11-28')).toMatchObject({
      ok: true,
      value: { balanceCents: 3_000_000, grossSalaryCents: 1_000_000, referenceNetCents: 750_000 },
    })
  })
  it('erros', () => {
    expect(parseFgtsForm(getter({ balance: 'x', balanceDate: '2026-11-01' }), '2026-11-28')).toEqual({ ok: false, error: 'saldo' })
    expect(parseFgtsForm(getter({ balance: '1', balanceDate: '2026-12-01' }), '2026-11-28')).toEqual({ ok: false, error: 'data' })
    expect(parseFgtsForm(getter({ balance: '1', balanceDate: '2026-11-01', gross: '1.000' }), '2026-11-28')).toEqual({ ok: false, error: 'salario' })
  })
})
