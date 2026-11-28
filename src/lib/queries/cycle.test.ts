import { describe, expect, it } from 'vitest'
import { assembleCycleData, type RawCycleTx } from './cycle'
import { computeFree } from '@/lib/cycle/free'
import type { IncomeSourceRow } from './salary'

const acme: IncomeSourceRow = { id: 'acme', kind: 'salary', payerDoc: '1', payerName: null, dateRule: 'penultimate_business_day', fixedDay: null }
let seq = 0
const tx = (p: Partial<RawCycleTx>): RawCycleTx => ({
  id: `t${++seq}`, accountId: 'bank', date: '2026-12-01', amountCents: -1000, kind: 'expense', categoryId: null,
  counterpartyName: null, descriptionRaw: 'X', incomeSourceId: null, freeCounted: false, ...p,
})
const accounts = [{ id: 'bank', type: 'BANK' as const }, { id: 'card', type: 'CREDIT' as const }]

describe('assembleCycleData', () => {
  it('ciclo pelo salário, extras, estimativa da fatura pelo ciclo anterior e fatura paga no ciclo', () => {
    const txs = [
      tx({ id: 'sal-out', date: '2026-10-29', amountCents: 800_000, kind: 'income', incomeSourceId: 'acme' }),
      tx({ id: 'sal', date: '2026-11-27', amountCents: 850_000, kind: 'income', incomeSourceId: 'acme' }),
      tx({ id: 'plr', date: '2026-12-05', amountCents: 300_000, kind: 'income', incomeSourceId: 'acme' }),
      tx({ id: 'pix', date: '2026-12-02', amountCents: 10_000, kind: 'income' }),
      tx({ id: 'prev-card', accountId: 'card', date: '2026-11-10', amountCents: -120_000 }),
      tx({ id: 'prev-refund', accountId: 'card', date: '2026-11-12', amountCents: 20_000, kind: 'refund' }),
      tx({ id: 'cur-card', accountId: 'card', date: '2026-12-03', amountCents: -50_000 }),
      tx({ id: 'paid', date: '2026-12-08', amountCents: -90_000, kind: 'card_payment' }),
      tx({ id: 'card-side', accountId: 'card', date: '2026-12-08', amountCents: 90_000, kind: 'card_payment' }),
      tx({ id: 'tr', date: '2026-12-04', amountCents: -5_000, kind: 'transfer' }),
      tx({ id: 'mkt', date: '2026-12-04', amountCents: -7_000 }),
    ]
    const d = assembleCycleData({ today: '2026-12-10', sources: [acme], commitments: [], accounts, txs })
    expect(d.cycle).toMatchObject({ start: '2026-11-27', end: '2026-12-29', source: 'salary' })
    expect(d).toMatchObject({ salaryCents: 850_000, extrasCents: 310_000, cardEstimateCents: 100_000, cardPaidCents: 90_000, hasSalarySource: true })
    expect(d.txs.map((t) => t.id).sort()).toEqual(['card-side', 'cur-card', 'mkt', 'paid', 'pix', 'plr', 'sal'])
    expect(d.txs.find((t) => t.id === 'cur-card')?.accountType).toBe('CREDIT')
  })

  it('sem fonte de salário: mês do calendário, toda renda é extra', () => {
    const d = assembleCycleData({ today: '2026-12-10', sources: [], commitments: [], accounts, txs: [tx({ date: '2026-12-05', amountCents: 500_000, kind: 'income' })] })
    expect(d.cycle).toMatchObject({ start: '2026-12-01', end: '2026-12-31', source: 'calendar' })
    expect(d).toMatchObject({ salaryCents: 0, extrasCents: 500_000, hasSalarySource: false })
  })

  it('VR fica fora do livre: recarga não é renda e compras não saem do caixa', () => {
    const accs = [...accounts, { id: 'vr', type: 'BENEFIT' as const }]
    const d = assembleCycleData({
      today: '2026-12-10', sources: [], commitments: [], accounts: accs,
      txs: [
        tx({ id: 'recarga', accountId: 'vr', date: '2026-12-05', amountCents: 80_000, kind: 'income' }),
        tx({ id: 'almoco', accountId: 'vr', date: '2026-12-06', amountCents: -4_000 }),
        tx({ id: 'prev-vr', accountId: 'vr', date: '2026-11-10', amountCents: -4_000 }),
        tx({ id: 'mkt', date: '2026-12-04', amountCents: -7_000 }),
      ],
    })
    expect(d.extrasCents).toBe(0)
    expect(d.cardEstimateCents).toBe(0)
    expect(d.txs.map((t) => t.id)).toEqual(['mkt'])
  })

  it('fonte salary + fonte extra: só o salário vira salário; a renda extra é listada e fica fora do livre até ser marcada', () => {
    const ferias: IncomeSourceRow = { id: 'ferias', kind: 'extra', payerDoc: null, payerName: 'Pagamento Ferias', dateRule: 'penultimate_business_day', fixedDay: null }
    const txs = [
      tx({ id: 'sal', date: '2026-11-27', amountCents: 617_598, kind: 'income', incomeSourceId: 'acme' }),
      tx({ id: 'fer', date: '2026-11-28', amountCents: 156_675, kind: 'income', incomeSourceId: 'ferias', counterpartyName: 'Pagamento Ferias Func' }),
      tx({ id: 'pix', date: '2026-12-02', amountCents: 10_000, kind: 'income' }),
    ]
    const d = assembleCycleData({ today: '2026-12-10', sources: [acme, ferias], commitments: [], accounts, txs })
    expect(d.salaryCents).toBe(617_598)
    expect(d.extraIncomes).toEqual([{ id: 'fer', date: '2026-11-28', amountCents: 156_675, label: 'Pagamento Ferias Func', freeCounted: false }])
    expect(computeFree({ ...d, today: '2026-12-10' }).freeCents).toBe(617_598)
    const on = assembleCycleData({ today: '2026-12-10', sources: [acme, ferias], commitments: [], accounts, txs: txs.map((t) => (t.id === 'fer' ? { ...t, freeCounted: true } : t)) })
    expect(on.extraIncomes[0].freeCounted).toBe(true)
    expect(computeFree({ ...on, today: '2026-12-10' }).freeCents).toBe(617_598 + 156_675)
  })
})
