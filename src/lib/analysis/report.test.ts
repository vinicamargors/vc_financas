import { describe, expect, it } from 'vitest'
import { buildCycleReport, type ReportTx } from './report'

let n = 0
const tx = (date: string, amountCents: number, kind: string | null, accountId = 'bank', extra: Partial<ReportTx> = {}): ReportTx => ({
  id: `t${++n}`,
  date,
  amountCents,
  kind: kind as ReportTx['kind'],
  accountId,
  categoryId: null,
  place: 'Loja',
  descriptionRaw: 'x',
  counterpartyName: null,
  incomeSourceId: null,
  ...extra,
})
const accountTypes = new Map<string, 'BANK' | 'CREDIT' | 'BENEFIT'>([
  ['bank', 'BANK'],
  ['card', 'CREDIT'],
  ['vr', 'BENEFIT'],
])
const cycle = { start: '2026-10-29', end: '2026-11-25' }
const prevCycle = { start: '2026-09-29', end: '2026-10-28' }
const salary = tx('2026-10-29', 800000, 'income', 'bank', { incomeSourceId: 's1' })

function report(txs: ReportTx[], extra: Partial<Parameters<typeof buildCycleReport>[0]> = {}) {
  return buildCycleReport({
    cycle,
    prevCycle,
    compare: { current: cycle, previous: { start: prevCycle.start, end: '2026-10-26' } },
    today: '2026-11-28',
    txs,
    accountTypes,
    salaries: [{ id: salary.id, date: salary.date, amountCents: salary.amountCents, incomeSourceId: 's1' }],
    commitments: [],
    categories: [{ id: 'mer', name: 'Mercado', monthlyLimitCents: null }],
    ...extra,
  })
}

describe('buildCycleReport', () => {
  it('entradas: salário e extras no banco; recarga do VR fora', () => {
    const r = report([salary, tx('2026-11-10', 50000, 'income'), tx('2026-11-01', 90000, 'income', 'vr'), tx('2026-10-01', 70000, 'income')])
    expect(r.salaryCents).toBe(800000)
    expect(r.extrasCents).toBe(50000)
  })
  it('saídas no caixa, compras no cartão e gasto real', () => {
    const r = report([
      tx('2026-11-02', -10000, 'expense'),
      tx('2026-11-03', -30000, 'card_payment'),
      tx('2026-11-03', -2000, 'pending_review'),
      tx('2026-11-04', 1000, 'refund'),
      tx('2026-11-04', -50000, 'transfer'),
      tx('2026-11-05', -40000, 'investment_in'),
      tx('2026-11-06', -20000, 'expense', 'card'),
      tx('2026-11-06', 5000, 'refund', 'card'),
      tx('2026-11-07', -3000, 'expense', 'vr'),
    ])
    expect(r.cashOutCents).toBe(10000 - 1000)
    expect(r.cardCents).toBe(15000)
    expect(r.benefitCents).toBe(3000)
    expect(r.cashOutCents + r.cardCents + r.benefitCents).toBe(r.spendingCents)
    expect(r.spendingCents).toBe(10000 - 1000 + 15000 + 3000)
    expect(r.cardPaidCents).toBe(30000)
    expect(r.pendingCents).toBe(2000)
  })
  it('caixinhas: aportes − resgates (rendimento fora)', () => {
    const r = report([tx('2026-11-05', -40000, 'investment_in'), tx('2026-11-10', 15000, 'investment_out'), tx('2026-11-10', 300, 'savings_yield')])
    expect(r.savingsNetCents).toBe(25000)
  })
  it('top categorias e estabelecimentos; comparação com a janela anterior', () => {
    const r = report([
      tx('2026-11-02', -10000, 'expense', 'bank', { categoryId: 'mer', place: 'Zaffari' }),
      tx('2026-11-02', -4000, 'expense', 'card', { place: 'Cinema' }),
      tx('2026-10-10', -7000, 'expense', 'bank', { categoryId: 'mer' }),
      tx('2026-10-27', -9999, 'expense'),
    ])
    expect(r.topCategories.map((c) => [c.name, c.totalCents])).toEqual([
      ['Mercado', 10000],
      ['Sem categoria', 4000],
    ])
    expect(r.topPlaces[0]).toMatchObject({ place: 'Zaffari', totalCents: 10000 })
    expect(r.prev.spendingCents).toBe(7000)
    expect(r.prev).toMatchObject({ days: 28, previousDays: 28 })
    expect(r.spendingCents).toBe(14000)
  })
  it('compromissos do ciclo com status', () => {
    const r = report([salary, tx('2026-11-05', -30000, 'expense', 'bank', { counterpartyName: 'Marli' })], {
      commitments: [
        { id: 'c1', name: 'Mãe', kind: 'fixed', amountCents: 30000, percent: null, percentBase: 'salary', categoryId: null, matchCounterparty: 'marli' },
        { id: 'c2', name: 'Aluguel', kind: 'fixed', amountCents: 100000, percent: null, percentBase: 'salary', categoryId: null, matchCounterparty: 'imob' },
      ],
    })
    expect(r.commitments.map((c) => [c.name, c.status])).toEqual([
      ['Mãe', 'done'],
      ['Aluguel', 'todo'],
    ])
    expect(r.commitmentsDone).toBe(1)
  })
})

describe('janela anterior mais curta', () => {
  it('informa o tamanho real do anterior', () => {
    const r = report([], { compare: { current: cycle, previous: { start: prevCycle.start, end: '2026-10-08' } } })
    expect(r.prev).toMatchObject({ days: 28, previousDays: 10 })
  })
})
