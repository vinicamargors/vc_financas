import { describe, expect, it } from 'vitest'
import { filterDays, initials } from './statement-filter'
import type { DayGroup, StatementTx } from '@/lib/queries/statement'

const tx = (id: string, amountCents: number, cardLast4: string | null = null): StatementTx => ({
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
  it('saídas', () => {
    expect(filterDays(days, 'saidas').map((d) => d.totalCents)).toEqual([-600, -50])
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
