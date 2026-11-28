import type { Account } from 'pluggy-sdk'
import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from './fixtures'
import { isSavingsYield, mapAccount, mapReservedBalances, mapTransaction } from './map'

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

describe('mapReservedBalances', () => {
  const rem = (p: number) => ({ indexer: 'CDI', rateType: 'EXPONENCIAL', calculation: 'DIAS_UTEIS', ratePeriodicity: 'ANUAL', postFixedIndexerPercentage: p })
  const mp = makeAccount({
    id: 'mp-1',
    name: 'Mercado Pago',
    balance: 0,
    bankData: {
      transferNumber: '323/0001/x',
      automaticallyInvestedBalance: 0,
      hasReservedBalance: true,
      reservedBalances: [
        { identification: '1c7a531f', availableAmounts: [{ amount: 6016.99, currencyCode: 'BRL', remuneration: rem(1.199983) }] },
        { name: 'Cofrinho da virada', identification: 'c8b08104', availableAmounts: [{ amount: 5025.37, currencyCode: 'BRL', remuneration: rem(1.22999) }] },
        { name: 'Cofrinho Mercado Livre', identification: 'eb2a8825', availableAmounts: [{ amount: 0, currencyCode: 'BRL', remuneration: rem(1.4) }] },
      ],
    },
  } as never)

  it('mapeia as caixinhas do Mercado Pago', () => {
    const rows = mapReservedBalances(mp, { userId: 'u', accountRowId: 'row-1' })
    expect(rows).toEqual([
      { userId: 'u', accountId: 'row-1', externalId: '1c7a531f', name: null, balanceCents: 601699, cdiPercent: 119.9983 },
      { userId: 'u', accountId: 'row-1', externalId: 'c8b08104', name: 'Cofrinho da virada', balanceCents: 502537, cdiPercent: 122.999 },
      { userId: 'u', accountId: 'row-1', externalId: 'eb2a8825', name: 'Cofrinho Mercado Livre', balanceCents: 0, cdiPercent: 140 },
    ])
  })

  it('soma vários valores em BRL e ignora outras moedas', () => {
    const a = makeAccount({
      bankData: { reservedBalances: [{ identification: 'x', availableAmounts: [{ amount: 1.1, currencyCode: 'BRL' }, { amount: 2.2, currencyCode: 'BRL' }, { amount: 9, currencyCode: 'USD' }] }] },
    } as never)
    expect(mapReservedBalances(a, { userId: 'u', accountRowId: 'r' })).toMatchObject([{ balanceCents: 330, cdiPercent: null }])
  })

  it('sem reservedBalances devolve vazio', () => {
    expect(mapReservedBalances(makeAccount(), { userId: 'u', accountRowId: 'r' })).toEqual([])
    expect(mapReservedBalances(makeAccount({ bankData: { reservedBalances: 'x' } } as never), { userId: 'u', accountRowId: 'r' })).toEqual([])
  })
})

describe('isSavingsYield', () => {
  it.each(['Rendimento', 'REND PAGO APLIC AUT', 'Rend. pago', 'Remuneração da conta', 'REMUNERACAO'])('%s é rendimento', (d) => {
    expect(isSavingsYield(d, true)).toBe(true)
  })
  it('exige caixinhas e descrição compatível', () => {
    expect(isSavingsYield('Rendimento', false)).toBe(false)
    expect(isSavingsYield('Pix recebido', true)).toBe(false)
    expect(isSavingsYield(null, true)).toBe(false)
  })
})
