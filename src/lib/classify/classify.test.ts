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
    expect(pluggyCategoryToName('Pet supplies')).toBe('Pets')
    expect(pluggyCategoryToName('Competition')).toBeNull()
    expect(pluggyCategoryToName('Rent')).toBe('Moradia')
    expect(pluggyCategoryToName('Car rental')).toBeNull()
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
    const out = tx({ accountId: 'brad', amountCents: -200000, date: '2026-11-27', descriptionRaw: 'TED ENVIADA - DES: X', counterpartyDoc: OWNER_CPF })
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

  it('cada linha entra em no máximo um par; escolhe a data mais próxima', () => {
    const accts = { ...ctx, accounts: [...ctx.accounts, { id: 'mp', type: 'BANK' as const }] }
    const out = tx({ id: 'o1', accountId: 'brad', amountCents: -10000, date: '2026-11-27', descriptionRaw: 'TRANSFERENCIA PIX' })
    const far = tx({ id: 'a1', accountId: 'nu', amountCents: 10000, date: '2026-11-28', descriptionRaw: 'Transferência recebida' })
    const near = tx({ id: 'b1', accountId: 'mp', amountCents: 10000, date: '2026-11-27', descriptionRaw: 'Pix recebido' })
    const r = classify([out, far, near], accts)
    expect(r.links).toEqual([{ id: 'o1', linkedId: 'b1' }, { id: 'b1', linkedId: 'o1' }])
    expect(r.decisions.find((d) => d.id === 'a1')?.kind).toBe('income')
  })

  it('cartão: saída nunca pareia; crédito só se parecer pagamento de fatura', () => {
    const cardOut = tx({ accountId: 'nucard', amountCents: -10000, descriptionRaw: 'Mlp *Loja' })
    const bankIn = tx({ accountId: 'brad', amountCents: 10000, descriptionRaw: 'PIX RECEBIDO - REM: Fulano' })
    const bankOut = tx({ accountId: 'nu', amountCents: -20000, descriptionRaw: 'Transferência enviada pelo Pix' })
    const cardIn = tx({ accountId: 'nucard', amountCents: 20000, descriptionRaw: 'Estorno Loja' })
    const r = classify([cardOut, bankIn, bankOut, cardIn], ctx)
    expect(r.links).toEqual([])
    expect(r.decisions.find((d) => d.id === cardIn.id)?.kind).toBe('refund')
  })

  it('par sem sinal de dinheiro próprio → pending_review: Pix soltos, salário vs aluguel', () => {
    const o = tx({ accountId: 'brad', amountCents: -80000, descriptionRaw: 'PIX ENVIADO - DES: Fulano', counterpartyDoc: '98765432100' })
    const i = tx({ accountId: 'nu', amountCents: 80000, descriptionRaw: 'Transferência recebida pelo Pix - Beltrano', counterpartyDoc: '11122233344' })
    expect(classify([o, i], ctx).decisions.map((d) => d.kind)).toEqual(['pending_review', 'pending_review'])
    const rent = tx({ accountId: 'nu', amountCents: -450000, descriptionRaw: 'Transferência enviada pelo Pix - Locador' })
    const salary = tx({ accountId: 'brad', amountCents: 450000, descriptionRaw: 'PIX RECEBIDO - REM: ACME LTDA', counterpartyDoc: '12345678000199' })
    const r = classify([rent, salary], ctx)
    expect(r.decisions.map((d) => d.kind)).toEqual(['pending_review', 'pending_review'])
    expect(r.links).toHaveLength(2)
  })

  it('Pluggy mesma titularidade num lado basta para o par virar transfer', () => {
    const o = tx({ accountId: 'brad', amountCents: -70000, descriptionRaw: 'TRANSFERENCIA PIX', pluggyCategory: 'Same person transfer - PIX' })
    const i = tx({ accountId: 'nu', amountCents: 70000, descriptionRaw: 'Pix recebido' })
    const r = classify([o, i], ctx)
    expect(r.decisions.map((d) => d.kind)).toEqual(['transfer', 'transfer'])
    expect(r.links).toHaveLength(2)
  })

  it('ligação exige mão dupla e aceita parceiro pending_review; relink sai de unlinked', () => {
    const a = tx({ id: 'pa', accountId: 'brad', amountCents: -5000, linkedTransactionId: 'pb', kind: 'pending_review' })
    const b = tx({ id: 'pb', accountId: 'nu', amountCents: 5000, linkedTransactionId: 'pa', kind: 'pending_review' })
    const r1 = classify([a, b], ctx)
    expect(r1.decisions.map((d) => d.kind)).toEqual(['pending_review', 'pending_review'])
    expect(r1.unlinked).toEqual([])
    // Só um lado aponta: ligação velha; as duas voltam ao pareamento e se religam.
    const c = tx({ id: 'pc', accountId: 'brad', amountCents: -5000, linkedTransactionId: 'pd', kind: 'transfer' })
    const d = tx({ id: 'pd', accountId: 'nu', amountCents: 5000, linkedTransactionId: null, kind: 'transfer' })
    const r2 = classify([c, d], ctx)
    expect(r2.links.map((l) => l.id).sort()).toEqual(['pc', 'pd'])
    expect(r2.unlinked).toEqual([])
    for (const id of r2.unlinked) expect(r2.links.some((l) => l.id === id)).toBe(false)
  })

  it('par sem nenhum sinal de transferência → pending_review nos dois', () => {
    const out = tx({ accountId: 'brad', amountCents: -12345, descriptionRaw: 'SAUDE EMPRESA' })
    const inn = tx({ accountId: 'nu', amountCents: 12345, descriptionRaw: 'Recebimento ACME' })
    const r = classify([out, inn], ctx)
    expect(r.decisions.map((d) => d.kind)).toEqual(['pending_review', 'pending_review'])
    expect(r.links).toHaveLength(2)
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

  it('par já ligado continua transfer só se o parceiro segue válido', () => {
    const a = tx({ id: 'la', accountId: 'brad', amountCents: -5000, linkedTransactionId: 'lb', kind: 'transfer' })
    const b = tx({ id: 'lb', accountId: 'nu', amountCents: 5000, linkedTransactionId: 'la', kind: 'transfer' })
    expect(classify([a, b], ctx).decisions.map((d) => d.kind)).toEqual(['transfer', 'transfer'])
    const stale = tx({ id: 'ls', amountCents: -5000, linkedTransactionId: 'zz', kind: 'transfer', descriptionRaw: 'COMPRA' })
    const r = classify([stale], ctx)
    expect(r.decisions[0].kind).toBe('expense')
    expect(r.unlinked).toEqual(['ls'])
    const userPartner = tx({ id: 'lu', accountId: 'nu', amountCents: 5000, classifiedBy: 'user', kind: 'income' })
    const c = tx({ id: 'lc', amountCents: -5000, linkedTransactionId: 'lu', kind: 'transfer', descriptionRaw: 'COMPRA' })
    expect(classify([c, userPartner], ctx).decisions[0].kind).toBe('expense')
  })

  it('regra sem tipo não sobrepõe o tipo estrutural', () => {
    const c: ClassifyContext = {
      ...ctx,
      merchantsById: { mn: { categoryId: 'cat-x' } },
      rules: [{ matchField: 'description', pattern: 'nubank', merchantId: 'mn', categoryId: null, kind: null }],
    }
    expect(one(tx({ descriptionRaw: 'PAGTO CARTAO NUBANK', amountCents: -150000 }), c)).toMatchObject({ kind: 'card_payment', merchantId: 'mn' })
    expect(one(tx({ descriptionRaw: 'NUBANK ASSINATURA', amountCents: -1500, pluggyCategory: 'Shopping' }), c)).toEqual({
      id: expect.any(String), kind: 'expense', merchantId: 'mn', categoryId: 'cat-x',
    })
  })

  it('pending_review em formatos Nubank, Bradesco e Mercado Pago, com doc mascarado', () => {
    const cases = [
      'Transferência enviada pelo Pix - Fulano de Tal - •••.456.789-•• - BCO X',
      'TRANSFERENCIA PIX - DES: Fulano',
      'Pix enviado para Fulano',
      'TRANSF CC P/ CC - Fulano',
      'TED DIF.TITULAR - Fulano',
    ]
    for (const d of cases) {
      expect(one(tx({ descriptionRaw: d, amountCents: -300000, counterpartyDoc: '***.456.789-**' }))?.kind, d).toBe('pending_review')
    }
    expect(one(tx({ descriptionRaw: 'PIX ENVIADO - DES: Fulano', amountCents: -300000, counterpartyDoc: '456789' }))?.kind).toBe('pending_review')
    expect(one(tx({ descriptionRaw: 'Transferência enviada pelo Pix - Loja', amountCents: -300000, counterpartyDoc: '12345678000199' }))?.kind).toBe('expense')
  })

  it('categorias Pluggy: mesma titularidade e investimentos', () => {
    expect(one(tx({ descriptionRaw: 'XYZ', amountCents: -50000, pluggyCategory: 'Same person transfer - PIX' }))?.kind).toBe('transfer')
    expect(one(tx({ descriptionRaw: 'XYZ', amountCents: -50000, pluggyCategory: 'Investments' }))?.kind).toBe('investment_in')
    expect(one(tx({ descriptionRaw: 'XYZ', amountCents: 50000, pluggyCategory: 'Fixed income' }))?.kind).toBe('investment_out')
    expect(one(tx({ descriptionRaw: 'XYZ', amountCents: -500000, pluggyCategory: 'Transfer - PIX' }))?.kind).toBe('expense')
  })

  it('nome do dono exige 2 palavras e 12 letras', () => {
    const c = { ...ctx, ownerNames: ['Ana Souza Lima'] }
    expect(one(tx({ descriptionRaw: 'PIX ENVIADO - DES: Ana', amountCents: -300000, paymentMethod: 'PIX' }), c)?.kind).toBe('pending_review')
    expect(one(tx({ descriptionRaw: 'PIX ENVIADO - DES: Ana Souza Li', amountCents: -300000, paymentMethod: 'PIX' }), c)?.kind).toBe('transfer')
  })

  it('é determinístico independente da ordem', () => {
    const base = { date: '2026-11-27', pluggyCategory: null, counterpartyName: null, counterpartyDoc: null, paymentMethod: null, kind: null, classifiedBy: 'auto' as const, linkedTransactionId: null }
    const rows: ClassifyTx[] = [
      { ...base, id: 'd1', accountId: 'brad', amountCents: -10000, descriptionRaw: 'TRANSFERENCIA PIX' },
      { ...base, id: 'd2', accountId: 'nu', amountCents: 10000, descriptionRaw: 'Pix recebido A' },
      { ...base, id: 'd3', accountId: 'nu', amountCents: 10000, descriptionRaw: 'Pix recebido B' },
      { ...base, id: 'd4', accountId: 'brad', amountCents: -300000, descriptionRaw: 'PIX ENVIADO - DES: X' },
    ]
    const norm = (r: ReturnType<typeof classify>) => ({
      kinds: Object.fromEntries(r.decisions.map((d) => [d.id, d.kind])),
      links: r.links.map((l) => `${l.id}>${l.linkedId}`).sort(),
    })
    expect(norm(classify([...rows].reverse(), ctx))).toEqual(norm(classify(rows, ctx)))
    expect(norm(classify(rows, ctx)).links).toEqual(['d1>d2', 'd2>d1'])
  })

  it('regra de descrição casa palavras inteiras, em ordem', () => {
    const tx = (id: string, d: string): ClassifyTx => ({ id, accountId: 'a', date: '2026-11-20', amountCents: -1000, descriptionRaw: d, pluggyCategory: null, counterpartyName: null, counterpartyDoc: null, paymentMethod: null, kind: null, classifiedBy: 'auto', linkedTransactionId: null })
    const r = classify([tx('1', 'UBER TRIP SP'), tx('2', 'SUBER TRIPS'), tx('3', 'TRIP UBER')], {
      ownerDocs: [], ownerNames: [], accounts: [{ id: 'a', type: 'BANK' }], merchantsById: {},
      rules: [{ matchField: 'description', pattern: 'uber trip', merchantId: 'm', categoryId: null, kind: null }],
    })
    const m = new Map(r.decisions.map((d) => [d.id, d.merchantId]))
    expect([m.get('1'), m.get('2'), m.get('3')]).toEqual(['m', undefined, undefined])
  })
})

describe('caixinha do Mercado Pago', () => {
  const acc = [{ id: 'mp', type: 'BANK' as const }]
  const base = { accountId: 'mp', date: '2026-11-27', classifiedBy: 'auto' as const, kind: null, linkedTransactionId: null, counterpartyDoc: null, counterpartyName: null, pluggyCategory: null, paymentMethod: null }
  it('"Dinheiro reservado Casa" é aporte, não gasto', () => {
    const r = classify([{ ...base, id: 'r1', amountCents: -500000, descriptionRaw: 'Dinheiro reservado Casa' }], { ownerDocs: [], ownerNames: [], accounts: acc, rules: [], merchantsById: {} })
    expect(r.decisions.find((d) => d.id === 'r1')?.kind).toBe('investment_in')
  })
  it('"Dinheiro retirado Casa" é resgate', () => {
    const r = classify([{ ...base, id: 'r2', amountCents: 100000, descriptionRaw: 'Dinheiro retirado Casa' }], { ownerDocs: [], ownerNames: [], accounts: acc, rules: [], merchantsById: {} })
    expect(r.decisions.find((d) => d.id === 'r2')?.kind).toBe('investment_out')
  })
})

describe('fatura paga por Pix QR', () => {
  const accs = [{ id: 'brad', type: 'BANK' as const }, { id: 'nucard', type: 'CREDIT' as const }]
  const base = { date: '2026-11-27', classifiedBy: 'auto' as const, kind: null, linkedTransactionId: null, counterpartyDoc: null, counterpartyName: null, pluggyCategory: null, paymentMethod: null }
  const ctx = { ownerDocs: [], ownerNames: [], accounts: accs, rules: [], merchantsById: {} }
  it('texto do Bradesco sozinho já é fatura', () => {
    const r = classify([{ ...base, id: 'q1', accountId: 'brad', amountCents: -101762, descriptionRaw: 'PIX QR CODE DINAMICO - DES: RECEBTO PAGTO ANTEC G 27/11 - DOCTO: 1' }], ctx)
    expect(r.decisions.find((d) => d.id === 'q1')?.kind).toBe('card_payment')
  })
  it('par com "Pagamento recebido" no cartão vira fatura mesmo sem texto de fatura no banco', () => {
    const r = classify(
      [
        { ...base, id: 'o', accountId: 'brad', amountCents: -50000, descriptionRaw: 'PIX QR CODE DINAMICO - DES: NU PAGAMENTOS 27/11' },
        { ...base, id: 'i', accountId: 'nucard', amountCents: 50000, descriptionRaw: 'Pagamento recebido' },
      ],
      ctx,
    )
    expect(r.decisions.find((d) => d.id === 'o')?.kind).toBe('card_payment')
    expect(r.decisions.find((d) => d.id === 'i')?.kind).toBe('card_payment')
  })
})


describe('fontes de renda', () => {
  const EMPRESA = '12.345.678/0001-90'
  const withSources: ClassifyContext = {
    ...ctx,
    incomeSources: [
      { id: 'src-acme', payerDoc: '12345678000190', payerName: null },
      { id: 'src-beta', payerDoc: null, payerName: 'Beta Servicos' },
    ],
  }

  it('salário e PLR do mesmo pagador (CNPJ) viram income com a fonte', () => {
    const salario = tx({ amountCents: 850_000, descriptionRaw: 'TED RECEBIDA', counterpartyDoc: EMPRESA, date: '2026-11-27' })
    const plr = tx({ amountCents: 320_000, descriptionRaw: 'CREDITO PLR', counterpartyDoc: EMPRESA, date: '2026-11-10' })
    const r = classify([salario, plr], withSources).decisions
    expect(r.find((d) => d.id === salario.id)).toEqual({ id: salario.id, kind: 'income', incomeSourceId: 'src-acme' })
    expect(r.find((d) => d.id === plr.id)).toEqual({ id: plr.id, kind: 'income', incomeSourceId: 'src-acme' })
  })

  it('reconhece pelo nome na contraparte ou na descrição (normalizados)', () => {
    expect(one(tx({ amountCents: 500_000, counterpartyName: 'BETA SERVIÇOS LTDA' }), withSources)).toMatchObject({ incomeSourceId: 'src-beta' })
    expect(one(tx({ amountCents: 500_000, descriptionRaw: 'PIX RECEBIDO BETA SERVICOS' }), withSources)).toMatchObject({ incomeSourceId: 'src-beta' })
  })

  it('saída para o pagador não vira renda; entrada de outro pagador fica sem fonte', () => {
    expect(one(tx({ amountCents: -5000, counterpartyDoc: EMPRESA }), withSources)?.incomeSourceId).toBeUndefined()
    expect(one(tx({ amountCents: 5000, counterpartyDoc: '99.999.999/0001-99' }), withSources)).toEqual(expect.not.objectContaining({ incomeSourceId: expect.anything() }))
  })

  it('salário não vira par de transferência com saída de mesmo valor', () => {
    const salario = tx({ accountId: 'brad', amountCents: 850_000, counterpartyDoc: EMPRESA })
    const saida = tx({ accountId: 'nu', amountCents: -850_000, descriptionRaw: 'PAGAMENTO BOLETO' })
    const r = classify([salario, saida], withSources)
    expect(r.links).toEqual([])
    expect(r.decisions.find((d) => d.id === salario.id)).toMatchObject({ kind: 'income', incomeSourceId: 'src-acme' })
  })
})
