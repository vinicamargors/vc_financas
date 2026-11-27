import { describe, expect, it } from 'vitest'
import { bankColor } from './bank-dot'

describe('bankColor', () => {
  it('cores conhecidas', () => {
    expect(bankColor('Bradesco')).toBe('#CC092F')
    expect(bankColor('Mercado Pago')).toBe('#00B1EA')
    expect(bankColor('Itaú Unibanco')).toBe('#EC7000')
    expect(bankColor('Banco Inter')).toBe('#FF7A00')
  })
  it('Nubank, C6 e desconhecidos ficam neutros', () => {
    expect(bankColor('Nubank')).toBe('var(--muted)')
    expect(bankColor('C6 Bank')).toBe('var(--muted)')
    expect(bankColor('Interbank Qualquer')).toBe('var(--muted)')
  })
})
