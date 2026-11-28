import { describe, expect, it } from 'vitest'
import { detectInstitution, inheritInstitution } from './institution'

describe('detectInstitution', () => {
  it('conector normal: usa o nome do conector', () => {
    expect(detectInstitution({ name: 'Conta Corrente' }, 'Bradesco')).toBe('Bradesco')
  })
  it('Meu Pluggy: banco pelo nome do produto', () => {
    expect(detectInstitution({ name: 'Nubank Ultravioleta Mastercard' }, 'MeuPluggy')).toBe('Nubank')
    expect(detectInstitution({ name: 'CONTA', marketingName: 'Bradesco Visa Platinum' }, 'MeuPluggy')).toBe('Bradesco')
  })
  it('Meu Pluggy: banco pelo código COMPE do número de transferência', () => {
    expect(detectInstitution({ name: 'CONTA CORRENTE', bankData: { transferNumber: '237/1234/56789-0' } }, 'MeuPluggy')).toBe('Bradesco')
    expect(detectInstitution({ name: 'Conta', bankData: { transferNumber: '323/0001/123' } }, 'Meu Pluggy')).toBe('Mercado Pago')
  })
  it('Meu Pluggy sem pista: usa o nome do produto', () => {
    expect(detectInstitution({ name: 'Conta Pagamento', bankData: { transferNumber: null } }, 'MeuPluggy')).toBe('Conta Pagamento')
  })
})

describe('inheritInstitution', () => {
  it('cartão sem banco herda o único banco da conexão', () => {
    expect(inheritInstitution(['Bradesco', 'Bradesco', 'VISA INFINITE'])).toEqual(['Bradesco', 'Bradesco', 'Bradesco'])
  })
  it('dois bancos diferentes: não adivinha', () => {
    expect(inheritInstitution(['Bradesco', 'Nubank', 'VISA INFINITE'])).toEqual(['Bradesco', 'Nubank', 'VISA INFINITE'])
  })
  it('detecta "Banco Bradesco" pelo nome da conta', () => {
    expect(detectInstitution({ name: 'Banco Bradesco' }, 'MeuPluggy')).toBe('Bradesco')
  })
})
