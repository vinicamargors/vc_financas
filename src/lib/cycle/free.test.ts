import { describe, expect, it } from 'vitest'
import { computeFree, type CommitmentInput, type FreeInput, type FreeTx } from './free'

const cycle = { start: '2026-11-27', end: '2026-12-29' }
const today = '2026-12-20' // 10 dias restantes, hoje incluso

let seq = 0
const tx = (p: Partial<FreeTx>): FreeTx => ({
  id: `t${++seq}`, date: '2026-12-01', amountCents: -1000, kind: 'expense', accountType: 'BANK',
  categoryId: null, counterpartyName: null, descriptionRaw: 'COMPRA', ...p,
})
const c = (p: Partial<CommitmentInput>): CommitmentInput => ({
  id: `c${++seq}`, name: 'C', kind: 'fixed', amountCents: null, percent: null, percentBase: 'salary', categoryId: null, matchCounterparty: null, ...p,
})
const base: FreeInput = { cycle, today, salaryCents: 1_000_000, extrasCents: 0, commitments: [], txs: [], cardEstimateCents: 0, cardPaidCents: 0 }

describe('computeFree', () => {
  it('sem nada: livre = salário + extras; por dia divide pelos dias restantes com hoje', () => {
    const r = computeFree({ ...base, extrasCents: 50_000 })
    expect(r).toMatchObject({ freeCents: 1_050_000, daysLeft: 10, freePerDayCents: 105_000, commitments: [], cardThisCycleCents: 0 })
  })

  it('fixed: pago casa pela contraparte ou descrição normalizada; reserva o maior entre esperado e pago', () => {
    const aluguel = c({ name: 'Aluguel', amountCents: 200_000, matchCounterparty: 'imobiliaria sol' })
    const luz = c({ name: 'Luz', amountCents: 20_000, matchCounterparty: 'ENEL' })
    const txs = [
      tx({ amountCents: -150_000, counterpartyName: 'Imobiliária Sol Ltda' }),
      tx({ amountCents: -25_000, descriptionRaw: 'PAGTO CONTA ENEL SP', kind: 'pending_review' }),
    ]
    const r = computeFree({ ...base, commitments: [aluguel, luz], txs })
    expect(r.commitments).toEqual([
      { id: aluguel.id, name: 'Aluguel', expectedCents: 200_000, paidCents: 150_000, status: 'partial' },
      { id: luz.id, name: 'Luz', expectedCents: 20_000, paidCents: 25_000, status: 'done' },
    ])
    // 1.000.000 − 200.000 − 25.000; as saídas casadas não contam de novo.
    expect(r.freeCents).toBe(775_000)
  })

  it('category_budget reserva o valor e o excesso sai do livre; só gasto no banco', () => {
    const mercado = c({ name: 'Mercado', kind: 'category_budget', amountCents: 100_000, categoryId: 'cat-m' })
    const r1 = computeFree({ ...base, commitments: [mercado], txs: [tx({ amountCents: -30_000, categoryId: 'cat-m' })] })
    expect(r1.commitments[0]).toMatchObject({ expectedCents: 100_000, paidCents: 30_000, status: 'partial' })
    expect(r1.freeCents).toBe(900_000)
    const r2 = computeFree({
      ...base, commitments: [mercado],
      txs: [tx({ amountCents: -130_000, categoryId: 'cat-m' }), tx({ amountCents: -40_000, categoryId: 'cat-m', accountType: 'CREDIT' })],
    })
    expect(r2.commitments[0]).toMatchObject({ paidCents: 130_000, status: 'done' })
    expect(r2.freeCents).toBe(870_000)
  })

  it('percent_of_income: do salário ou de toda a renda', () => {
    const dizimo = c({ name: 'Doação', kind: 'percent_of_income', percent: 10 })
    const todo = c({ name: 'Reserva', kind: 'percent_of_income', percent: 5, percentBase: 'all' })
    const r = computeFree({ ...base, extrasCents: 200_000, commitments: [dizimo, todo] })
    expect(r.commitments.map((x) => [x.expectedCents, x.status])).toEqual([[100_000, 'todo'], [60_000, 'todo']])
    expect(r.freeCents).toBe(1_200_000 - 160_000)
  })

  it('fatura: esperado = max(estimativa, pago), pago = pago; não conta duas vezes', () => {
    const pay = tx({ amountCents: -300_000, kind: 'card_payment' })
    const r1 = computeFree({ ...base, txs: [pay], cardEstimateCents: 400_000, cardPaidCents: 300_000 })
    expect(r1.commitments).toEqual([{ id: 'card', name: 'Fatura do cartão', expectedCents: 400_000, paidCents: 300_000, status: 'partial' }])
    expect(r1.freeCents).toBe(600_000)
    const r2 = computeFree({ ...base, txs: [pay], cardEstimateCents: 250_000, cardPaidCents: 300_000 })
    expect(r2.commitments[0]).toMatchObject({ expectedCents: 300_000, status: 'done' })
    expect(r2.freeCents).toBe(700_000)
  })

  it('compra no cartão não reduz o livre e aparece em cardThisCycleCents; transferência e aporte ficam fora', () => {
    const txs = [
      tx({ amountCents: -80_000, accountType: 'CREDIT' }),
      tx({ amountCents: 5_000, kind: 'refund', accountType: 'CREDIT' }),
      tx({ amountCents: -50_000, kind: 'transfer' }),
      tx({ amountCents: -70_000, kind: 'investment_in' }),
      tx({ amountCents: 20_000, kind: 'investment_out' }),
      tx({ amountCents: 300, kind: 'savings_yield' }),
      tx({ amountCents: -9_000, date: '2026-11-26' }), // ciclo anterior
    ]
    const r = computeFree({ ...base, txs })
    expect(r.cardThisCycleCents).toBe(75_000)
    expect(r.freeCents).toBe(1_000_000)
  })

  it('saídas no caixa fora de compromissos: expense no banco e pending_review de saída', () => {
    const txs = [tx({ amountCents: -12_000 }), tx({ amountCents: -100_000, kind: 'pending_review' }), tx({ amountCents: 40_000, kind: 'pending_review' })]
    expect(computeFree({ ...base, txs }).freeCents).toBe(888_000)
  })

  it('livre negativo: por dia é 0, sem dividir', () => {
    const r = computeFree({ ...base, salaryCents: 0, txs: [tx({ amountCents: -10_000 })] })
    expect(r).toMatchObject({ freeCents: -10_000, freePerDayCents: 0 })
  })

  it('último dia do ciclo conta 1 dia; por dia arredonda para baixo', () => {
    const r = computeFree({ ...base, today: '2026-12-29', salaryCents: 1001 })
    expect(r).toMatchObject({ daysLeft: 1, freePerDayCents: 1001 })
    expect(computeFree({ ...base, salaryCents: 1001 }).freePerDayCents).toBe(100)
  })
})
