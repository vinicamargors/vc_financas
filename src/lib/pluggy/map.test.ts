import type { Account } from 'pluggy-sdk'
import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from './fixtures'
import { mapAccount, mapTransaction } from './map'

const bank = { userId: 'u1', accountRowId: 'row-1', accountType: 'BANK' as const }
const card = { ...bank, accountType: 'CREDIT' as const }

describe('mapTransaction', () => {
  it('débito em conta é negativo', () => {
    expect(mapTransaction(makeTransaction({ type: 'DEBIT', amount: -9 }), bank).amountCents).toBe(-900)
  })

  it('compra no cartão é negativa', () => {
    expect(mapTransaction(makeTransaction({ type: 'DEBIT', amount: 9 }), card).amountCents).toBe(-900)
  })

  it('pagamento recebido no cartão é positivo', () => {
    expect(mapTransaction(makeTransaction({ type: 'CREDIT', amount: -1360 }), card).amountCents).toBe(136000)
  })

  it('arredonda centavos sem erro de ponto flutuante', () => {
    expect(mapTransaction(makeTransaction({ type: 'CREDIT', amount: 19.99 }), bank).amountCents).toBe(1999)
  })

  it('pix recebido usa o pagador como contraparte', () => {
    const t = makeTransaction({
      type: 'CREDIT',
      amount: 300,
      paymentData: {
        payer: { name: 'Fulano', documentNumber: { type: 'CPF', value: '123.456.789-09' } },
        receiver: { name: 'Eu', documentNumber: { type: 'CPF', value: '111.111.111-11' } },
        paymentMethod: 'PIX',
        boletoMetadata: null,
      },
    })
    const r = mapTransaction(t, bank)
    expect(r.amountCents).toBe(30000)
    expect(r.counterpartyName).toBe('Fulano')
    expect(r.counterpartyDoc).toBe('12345678909')
    expect(r.paymentMethod).toBe('PIX')
  })

  it('pix enviado usa o recebedor como contraparte, doc só dígitos', () => {
    const t = makeTransaction({
      type: 'DEBIT',
      amount: -50,
      paymentData: {
        payer: { name: 'Eu' },
        receiver: { name: 'Loja', documentNumber: { type: 'CNPJ', value: '12.345.678/0001-90' } },
        boletoMetadata: null,
      },
    })
    const r = mapTransaction(t, bank)
    expect(r.counterpartyName).toBe('Loja')
    expect(r.counterpartyDoc).toBe('12345678000190')
  })

  it('sem paymentData a contraparte é nula', () => {
    const r = mapTransaction(makeTransaction(), bank)
    expect(r.counterpartyName).toBeNull()
    expect(r.counterpartyDoc).toBeNull()
  })

  it('converte a data para o dia local de São Paulo', () => {
    const r = mapTransaction(makeTransaction({ date: new Date('2026-11-28T02:30:00Z') }), bank)
    expect(r.date).toBe('2026-11-27')
  })

  it('mapeia metadados de parcelas e cartão', () => {
    const t = makeTransaction({
      creditCardMetadata: { installmentNumber: 3, totalInstallments: 12, cardNumber: '1234' },
    })
    const r = mapTransaction(t, card)
    expect(r.installmentNumber).toBe(3)
    expect(r.installmentTotal).toBe(12)
    expect(r.cardLast4).toBe('1234')
  })

  it('campos de identidade e origem', () => {
    const t = makeTransaction({ id: 'abc', description: 'Desc', descriptionRaw: null, category: 'Food' })
    const r = mapTransaction(t, bank)
    expect(r.externalId).toBe('abc')
    expect(r.source).toBe('pluggy')
    expect(r.userId).toBe('u1')
    expect(r.accountId).toBe('row-1')
    expect(r.descriptionRaw).toBe('Desc')
    expect(r.pluggyCategory).toBe('Food')
    expect(r.raw).toBe(t)
    expect(mapTransaction(makeTransaction({ descriptionRaw: 'RAW' }), bank).descriptionRaw).toBe('RAW')
  })
})

describe('mapAccount', () => {
  const ctx = { userId: 'u1', connectionId: 'c1', institution: 'Banco X' }

  it('converte saldo em centavos', () => {
    const r = mapAccount(makeAccount({ balance: 300.5 }), ctx)
    expect(r.balanceCents).toBe(30050)
    expect(r.externalId).toBe('acc-1')
    expect(r.institution).toBe('Banco X')
    expect(r.connectionId).toBe('c1')
    expect(r.closingDay).toBeNull()
    expect(r.dueDay).toBeNull()
  })

  it('cartão: limite e dias de fechamento/vencimento', () => {
    const r = mapAccount(
      makeAccount({
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        creditData: {
          balanceCloseDate: new Date('2026-12-05T00:00:00Z'),
          balanceDueDate: new Date('2026-12-12T00:00:00Z'),
          creditLimit: 5000,
        } as Account['creditData'],
      }),
      ctx,
    )
    expect(r.type).toBe('CREDIT')
    expect(r.closingDay).toBe(5)
    expect(r.dueDay).toBe(12)
    expect(r.creditLimitCents).toBe(500000)
  })
})
