import { describe, expect, it } from 'vitest'
import { moveCommitment, parseCommitmentForm, parseMoneyCents, parsePercent, showPaymentDay } from './form'

const f = (o: Record<string, string>) => (k: string) => o[k] ?? null

describe('parseMoneyCents', () => {
  it('aceita formatos brasileiros', () => {
    expect(parseMoneyCents('1.234,56')).toBe(123456)
    expect(parseMoneyCents('R$ 900')).toBe(90000)
    expect(parseMoneyCents('12,5')).toBe(1250)
    expect(parseMoneyCents('1500.75')).toBe(150075)
  })
  it('recusa vazio, zero, negativo e lixo', () => {
    for (const s of ['', '0', '-10', 'abc', '1,2,3']) expect(parseMoneyCents(s)).toBeNull()
  })
})

describe('parsePercent', () => {
  it('aceita de 0 a 100 com vírgula', () => {
    expect(parsePercent('10')).toBe(10)
    expect(parsePercent('2,5')).toBe(2.5)
  })
  it('recusa fora do intervalo', () => {
    expect(parsePercent('0')).toBeNull()
    expect(parsePercent('101')).toBeNull()
    expect(parsePercent('')).toBeNull()
  })
})

describe('parseCommitmentForm', () => {
  it('fixo: valor e contraparte', () => {
    expect(parseCommitmentForm(f({ name: ' Aluguel ', kind: 'fixed', amount: '1.500', match: ' Marli ' }))).toEqual({
      ok: true,
      value: { name: 'Aluguel', kind: 'fixed', amountCents: 150000, percent: null, percentBase: 'salary', categoryId: null, matchCounterparty: 'Marli' },
    })
  })
  it('orçamento: exige categoria', () => {
    expect(parseCommitmentForm(f({ name: 'Mercado', kind: 'category_budget', amount: '800' }))).toEqual({ ok: false, error: 'categoria' })
    const r = parseCommitmentForm(f({ name: 'Mercado', kind: 'category_budget', amount: '800', categoryId: 'c1', match: 'x' }))
    expect(r).toEqual({
      ok: true,
      value: { name: 'Mercado', kind: 'category_budget', amountCents: 80000, percent: null, percentBase: 'salary', categoryId: 'c1', matchCounterparty: null },
    })
  })
  it('percentual: percentual e base', () => {
    const r = parseCommitmentForm(f({ name: 'Dízimo', kind: 'percent_of_income', percent: '10', percentBase: 'all', match: 'Igreja' }))
    expect(r).toEqual({
      ok: true,
      value: { name: 'Dízimo', kind: 'percent_of_income', amountCents: null, percent: 10, percentBase: 'all', categoryId: null, matchCounterparty: 'Igreja' },
    })
  })
  it('erros por campo', () => {
    expect(parseCommitmentForm(f({ name: '', kind: 'fixed', amount: '1' }))).toEqual({ ok: false, error: 'nome' })
    expect(parseCommitmentForm(f({ name: 'x', kind: 'outro' }))).toEqual({ ok: false, error: 'tipo' })
    expect(parseCommitmentForm(f({ name: 'x', kind: 'fixed', amount: '' }))).toEqual({ ok: false, error: 'valor' })
    expect(parseCommitmentForm(f({ name: 'x', kind: 'percent_of_income', percent: '200' }))).toEqual({ ok: false, error: 'percentual' })
    expect(parseCommitmentForm(f({ name: 'x'.repeat(81), kind: 'fixed', amount: '1' }))).toEqual({ ok: false, error: 'nome' })
  })
})

describe('moveCommitment', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  it('sobe e renumera', () => {
    expect(moveCommitment(list, 'b', 'up')).toEqual([{ id: 'b', sort: 0 }, { id: 'a', sort: 1 }, { id: 'c', sort: 2 }])
  })
  it('desce', () => {
    expect(moveCommitment(list, 'b', 'down')).toEqual([{ id: 'a', sort: 0 }, { id: 'c', sort: 1 }, { id: 'b', sort: 2 }])
  })
  it('nas pontas ou id desconhecido não muda nada', () => {
    expect(moveCommitment(list, 'a', 'up')).toBeNull()
    expect(moveCommitment(list, 'c', 'down')).toBeNull()
    expect(moveCommitment(list, 'z', 'up')).toBeNull()
  })
})

describe('showPaymentDay', () => {
  const cycle = { start: '2026-11-27', source: 'salary' as const }
  it('nos 3 dias a partir do salário', () => {
    expect(showPaymentDay(cycle, '2026-11-27')).toBe(true)
    expect(showPaymentDay(cycle, '2026-11-29')).toBe(true)
    expect(showPaymentDay(cycle, '2026-11-30')).toBe(false)
  })
  it('só quando o salário caiu', () => {
    expect(showPaymentDay({ ...cycle, source: 'expected' }, '2026-11-27')).toBe(false)
    expect(showPaymentDay({ ...cycle, source: 'calendar' }, '2026-11-27')).toBe(false)
  })
})
