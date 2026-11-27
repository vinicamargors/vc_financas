import { describe, expect, it } from 'vitest'
import { formatBRL } from './money'

describe('formatBRL', () => {
  it('formata centavos em reais', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
  })
  it('formata negativos', () => {
    expect(formatBRL(-900)).toBe('-R$ 9,00')
  })
  it('modo sinal negativo', () => {
    expect(formatBRL(-900, { sign: true })).toBe('− 9,00')
  })
  it('modo sinal positivo', () => {
    expect(formatBRL(50000, { sign: true })).toBe('+ 500,00')
  })
  it('oculta o valor', () => {
    expect(formatBRL(123456, { hidden: true })).toBe('R$ •••')
  })
  it('aceita bigint', () => {
    expect(formatBRL(123456n)).toBe('R$ 1.234,56')
  })
  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00')
  })
})
