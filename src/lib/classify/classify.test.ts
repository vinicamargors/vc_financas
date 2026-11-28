import { describe, expect, it } from 'vitest'
import { classify, type ClassifyContext, type ClassifyTx } from './classify'
import { normalizeText, onlyDigits } from './normalize'
import { pluggyCategoryToName } from './pluggy-categories'

const OWNER_CPF = '12345678901'
const ctx: ClassifyContext = {
  ownerDocs: [OWNER_CPF],
  accounts: [
    { id: 'brad', type: 'BANK' },
    { id: 'nu', type: 'BANK' },
    { id: 'nucard', type: 'CREDIT' },
  ],
  rules: [],
  merchantsById: {},
}

let seq = 0
function tx(p: Partial<ClassifyTx>): ClassifyTx {
  seq += 1
  return {
    id: `t${seq}`,
    accountId: 'brad',
    date: '2026-11-27',
    amountCents: -1000,
    descriptionRaw: 'COMPRA',
    pluggyCategory: null,
    counterpartyName: null,
    counterpartyDoc: null,
    paymentMethod: null,
    kind: null,
    classifiedBy: 'auto',
    linkedTransactionId: null,
    ...p,
  }
}
const one = (t: ClassifyTx, c: ClassifyContext = ctx) => classify([t], c).decisions.find((d) => d.id === t.id)

describe('normalize', () => {
  it('tira acento, caixa e espaços', () => {
    expect(normalizeText('  Ação   CAFÉ ')).toBe('acao cafe')
    expect(onlyDigits('123.456.789-01')).toBe('12345678901')
  })
})

describe('pluggyCategoryToName', () => {
  it('mapeia categorias principais', () => {
    expect(pluggyCategoryToName('Groceries')).toBe('Mercado')
    expect(pluggyCategoryToName('Gas stations')).toBe('Combustível')
    expect(pluggyCategoryToName('Food and drinks')).toBe('Alimentação')
    expect(pluggyCategoryToName('Food delivery')).toBe('Delivery')
    expect(pluggyCategoryToName('Digital services')).toBe('Assinaturas')
    expect(pluggyCategoryToName('Whatever')).toBeNull()
    expect(pluggyCategoryToName(null)).toBeNull()
  })
})

describe('classify', () => {
  it('Pix para o próprio CPF → transfer', () => {
    const t = tx({ descriptionRaw: 'PIX ENVIADO - DES: Vinicius Camargo Roch 27/11 - DOCTO: 123', amountCents: -50000, counterpartyDoc: '123.456.789-01', paymentMethod: 'PIX' })
    expect(one(t)?.kind).toBe('transfer')
  })

  it('Pix para o próprio nome (sem documento) → transfer', () => {
    const t = tx({ descriptionRaw: 'PIX ENVIADO - DES: Vinicius Camargo Roch 27/11 - DOCTO: 123', amountCents: -500000, paymentMethod: 'PIX' })
    expect(one(t, { ...ctx, ownerNames: ['Vinícius Camargo Rocha'] })?.kind).toBe('transfer')
  })

  it('par de R$ 2.000 entre Bradesco e Nubank → transfer ligado', () => {
    const out = tx({ accountId: 'brad', amountCents: -200000, date: '2026-11-27', descriptionRaw: 'TED ENVIADA - DES: X' })
    const inn = tx({ accountId: 'nu', amountCents: 200000, date: '2026-11-28', descriptionRaw: 'Transferência recebida' })
    const r = classify([out, inn], ctx)
    expect(r.decisions.map((d) => d.kind)).toEqual(['transfer', 'transfer'])
    expect(r.links).toEqual([{ id: out.id, linkedId: inn.id }, { id: inn.id, linkedId: out.id }])
  })

  it('não pareia na mesma conta nem com mais de 1 dia', () => {
    const a = tx({ accountId: 'brad', amountCents: -200000, descriptionRaw: 'COMPRA LOJA' })
    const b = tx({ accountId: 'brad', amountCents: 200000, descriptionRaw: 'DEPOSITO' })
    const c = tx({ accountId: 'nu', amountCents: 200000, date: '2026-11-30', descriptionRaw: 'DEPOSITO' })
    const r = classify([a, b, c], ctx)
    expect(r.links).toEqual([])
    expect(r.decisions.find((d) => d.id === b.id)?.kind).toBe('income')
  })

  it('cada linha entra em no máximo um par', () => {
    const out = tx({ accountId: 'brad', amountCents: -10000 })
    const i1 = tx({ accountId: 'nu', amountCents: 10000, descriptionRaw: 'X' })
    const i2 = tx({ accountId: 'nucard', amountCents: 10000, descriptionRaw: 'Y' })
    const r = classify([out, i1, i2], ctx)
    expect(r.links).toHaveLength(2)
    expect([i1, i2].map((t) => r.decisions.find((d) => d.id === t.id)?.kind).sort()).toEqual(['income', 'transfer'])
  })

  it('pagamento de fatura → card_payment (banco e cartão)', () => {
    expect(one(tx({ descriptionRaw: 'PAGTO CARTAO NUBANK', amountCents: -150000 }))?.kind).toBe('card_payment')
    expect(one(tx({ accountId: 'nucard', descriptionRaw: 'Pagamento recebido', amountCents: 150000 }))?.kind).toBe('card_payment')
    expect(one(tx({ pluggyCategory: 'Credit card payment', amountCents: -150000, descriptionRaw: 'NUBANK' }))?.kind).toBe('card_payment')
  })

  it('pagamento casado banco ↔ cartão vira card_payment ligado', () => {
    const out = tx({ accountId: 'brad', amountCents: -150000, descriptionRaw: 'PAGAMENTO FATURA NUBANK' })
    const inn = tx({ accountId: 'nucard', amountCents: 150000, descriptionRaw: 'Pagamento recebido' })
    const r = classify([out, inn], ctx)
    expect(r.decisions.map((d) => d.kind)).toEqual(['card_payment', 'card_payment'])
    expect(r.links).toHaveLength(2)
  })

  it('aporte, resgate, estorno, rendimento', () => {
    expect(one(tx({ descriptionRaw: 'APLICACAO CDB', amountCents: -100000 }))?.kind).toBe('investment_in')
    expect(one(tx({ descriptionRaw: 'Dinheiro guardado na Caixinha', amountCents: -100000 }))?.kind).toBe('investment_in')
    expect(one(tx({ descriptionRaw: 'RESGATE CDB', amountCents: 100000 }))?.kind).toBe('investment_out')
    expect(one(tx({ descriptionRaw: 'Estorno Kabum', amountCents: 5000 }))?.kind).toBe('refund')
    expect(one(tx({ descriptionRaw: 'Rendimento', amountCents: 12, kind: 'savings_yield' }))?.kind).toBe('savings_yield')
  })

  it('entrada comum → income; saída comum → expense com categoria Pluggy', () => {
    expect(one(tx({ descriptionRaw: 'PAGAMENTO FERIAS FUNC - DOCTO: 1', amountCents: 300000 }))?.kind).toBe('income')
    const d = one(tx({ accountId: 'nucard', descriptionRaw: 'Mlp *Kabum-Kabum 9/10', amountCents: -25000, pluggyCategory: 'Shopping' }))
    expect(d).toMatchObject({ kind: 'expense', categoryName: 'Compras' })
    expect(one(tx({ descriptionRaw: 'SAUDE EMPRESA - DOCTO: 9', amountCents: -40000 }))?.kind).toBe('expense')
  })

  it('Pix de R$ 3.000 para desconhecido → pending_review', () => {
    expect(one(tx({ descriptionRaw: 'PIX ENVIADO - DES: Fulano de Tal 27/11 - DOCTO: 1', amountCents: -300000, paymentMethod: 'PIX', counterpartyDoc: '98765432100' }))?.kind).toBe('pending_review')
    // pessoa jurídica ou QR de loja: despesa normal
    expect(one(tx({ descriptionRaw: 'PIX QR CODE DINAMICO - DES: Loja X', amountCents: -300000, paymentMethod: 'PIX', counterpartyDoc: '12345678000199' }))?.kind).toBe('expense')
    // abaixo de R$ 1.000: despesa
    expect(one(tx({ descriptionRaw: 'PIX ENVIADO - DES: Fulano', amountCents: -99999, paymentMethod: 'PIX' }))?.kind).toBe('expense')
  })

  it('regras do usuário vencem: descrição, documento, nome', () => {
    const c: ClassifyContext = {
      ...ctx,
      merchantsById: { m1: { categoryId: 'cat-saude' } },
      rules: [
        { matchField: 'description', pattern: 'Saúde Empresa', merchantId: 'm1', categoryId: null, kind: null },
        { matchField: 'counterparty_doc', pattern: '987.654.321-00', merchantId: null, categoryId: 'cat-aluguel', kind: 'expense' },
        { matchField: 'counterparty_name', pattern: 'joao', merchantId: null, categoryId: null, kind: 'transfer' },
      ],
    }
    expect(one(tx({ descriptionRaw: 'SAUDE EMPRESA - DOCTO: 9', amountCents: -40000 }), c)).toMatchObject({ kind: 'expense', merchantId: 'm1', categoryId: 'cat-saude' })
    expect(one(tx({ descriptionRaw: 'PIX ENVIADO - DES: Fulano', amountCents: -300000, paymentMethod: 'PIX', counterpartyDoc: '98765432100' }), c)).toMatchObject({ kind: 'expense', categoryId: 'cat-aluguel' })
    expect(one(tx({ counterpartyName: 'JOÃO SILVA', amountCents: -300000 }), c)?.kind).toBe('transfer')
  })

  it('linha do usuário fica intocada e não entra em par', () => {
    const u = tx({ accountId: 'brad', amountCents: -200000, classifiedBy: 'user', kind: 'expense' })
    const inn = tx({ accountId: 'nu', amountCents: 200000, descriptionRaw: 'DEPOSITO' })
    const r = classify([u, inn], ctx)
    expect(r.decisions.find((d) => d.id === u.id)).toBeUndefined()
    expect(r.links).toEqual([])
    expect(r.decisions.find((d) => d.id === inn.id)?.kind).toBe('income')
  })

  it('par já ligado continua transfer', () => {
    const a = tx({ amountCents: -5000, linkedTransactionId: 'zz' })
    expect(one(a)?.kind).toBe('transfer')
  })

  it('é determinístico independente da ordem', () => {
    const rows = [
      tx({ accountId: 'brad', amountCents: -10000 }),
      tx({ accountId: 'nu', amountCents: 10000, descriptionRaw: 'A' }),
      tx({ accountId: 'nucard', amountCents: 10000, descriptionRaw: 'B' }),
    ]
    const a = classify(rows, ctx)
    const b = classify([...rows].reverse(), ctx)
    expect(new Set(b.links.map((l) => `${l.id}>${l.linkedId}`))).toEqual(new Set(a.links.map((l) => `${l.id}>${l.linkedId}`)))
  })
})
