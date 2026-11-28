import { describe, expect, it } from 'vitest'
import { filterDays, initials, rowDisplay } from './statement-filter'
import type { Kind } from '@/lib/classify/classify'
import type { DayGroup, StatementTx } from '@/lib/queries/statement'

const tx = (id: string, amountCents: number, cardLast4: string | null = null, kind: Kind | null = amountCents > 0 ? 'income' : 'expense'): StatementTx => ({
  kind,
  categoryName: null,
  id,
  logoUrl: null,
  occurredAt: null,
  date: '2026-11-27',
  amountCents,
  deletedAt: null,
  description: id,
  accountLabel: 'Banco',
  cardLast4,
  installmentNumber: null,
  installmentTotal: null,
  isYield: false,
})

const days: DayGroup<StatementTx>[] = [
  { date: '2026-11-27', totalCents: 400, items: [tx('a', 1000), tx('b', -600, '1234')] },
  { date: '2026-11-26', totalCents: -50, items: [tx('c', -50)] },
]

describe('filterDays', () => {
  it('tudo devolve como veio', () => expect(filterDays(days, 'tudo')).toBe(days))
  it('entradas recalcula total e tira dias vazios', () => {
    expect(filterDays(days, 'entradas')).toEqual([{ date: '2026-11-27', totalCents: 1000, items: [days[0].items[0]] }])
  })
  it('entradas exclui rendimento de caixinha', () => {
    const y = { ...tx('y', 123, null, 'savings_yield'), isYield: true }
    const r = filterDays([{ date: '2026-11-27', totalCents: 1123, items: [tx('a', 1000), y] }], 'entradas')
    expect(r[0].items.map((t) => t.id)).toEqual(['a'])
    expect(r[0].totalCents).toBe(1000)
  })
  it('saídas', () => {
    expect(filterDays(days, 'saidas').map((d) => d.totalCents)).toEqual([-600, -50])
  })
  it('saídas: só despesa; entradas: entrada e estorno', () => {
    const mix = [tx('e', -100), tx('t', -200, null, 'transfer'), tx('f', -300, null, 'card_payment'), tx('p', -400, null, 'pending_review'), tx('r', 50, null, 'refund'), tx('i', 900)]
    const d = [{ date: '2026-11-27', totalCents: 0, items: mix }]
    expect(filterDays(d, 'saidas')[0].items.map((t) => t.id)).toEqual(['e'])
    expect(filterDays(d, 'entradas')[0].items.map((t) => t.id)).toEqual(['r', 'i'])
    expect(filterDays(d, 'entradas')[0].totalCents).toBe(950)
  })
  it('cartão = tem final do cartão', () => {
    expect(filterDays(days, 'cartao').flatMap((d) => d.items.map((t) => t.id))).toEqual(['b'])
  })
})

describe('initials', () => {
  it('duas palavras', () => expect(initials('Posto Ipiranga')).toBe('PI'))
  it('uma palavra', () => expect(initials('Netflix')).toBe('NE'))
  it('ignora símbolos', () => expect(initials('*** pix - maria')).toBe('PM'))
  it('ignora preposições', () => expect(initials('Cantina do Tio Marcelo')).toBe('CT'))
  it('vazio', () => expect(initials('---')).toBe('·'))
})

describe('rowDisplay', () => {
  const d = (kind: Kind | null, categoryName: string | null = null, isYield = false) => rowDisplay({ kind, categoryName, isYield })
  it('transferência, fatura, caixinha e investimento: neutros, com rótulo', () => {
    expect(d('transfer', 'Outros')).toEqual({ neutral: true, label: 'Transferência', pending: false })
    expect(d('card_payment')).toMatchObject({ neutral: true, label: 'Pagamento de fatura' })
    expect(d('investment_in')).toMatchObject({ neutral: true, label: 'Caixinha' })
    expect(d('investment_out')).toMatchObject({ neutral: true, label: 'Investimento' })
  })
  it('gasto e entrada mostram a categoria; a confirmar ganha a etiqueta', () => {
    expect(d('expense', 'Mercado')).toEqual({ neutral: false, label: 'Mercado', pending: false })
    expect(d('pending_review')).toEqual({ neutral: false, label: null, pending: true })
    expect(d(null, null, true).neutral).toBe(true)
  })
})
