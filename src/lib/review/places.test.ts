import { describe, expect, it } from 'vitest'
import { classify, type ClassifyTx } from '@/lib/classify/classify'
import { groupNewPlaces, patternFor } from './places'

describe('patternFor', () => {
  it('normaliza e tira data, documento e parcela', () => {
    expect(patternFor('PADARIA SÃO JOÃO 12/11')).toBe('padaria sao joao')
    expect(patternFor('Mercado Bom - Docto: 123456')).toBe('mercado bom')
    expect(patternFor('LOJA XPTO PARC 3/10')).toBe('loja xpto')
    expect(patternFor('Mp*Uber Trip 2/3')).toBe('uber trip')
  })
  it('devolve null quando sobra menos de 3 letras', () => {
    expect(patternFor('12/11 99')).toBeNull()
    expect(patternFor('ab')).toBeNull()
  })
  it('o padrão casa com a própria descrição no classificador', () => {
    const raw = 'IFOOD *RESTAURANTE 01/12'
    const tx = { id: 't', accountId: 'a', date: '2026-11-20', amountCents: -3000, descriptionRaw: raw, pluggyCategory: null, counterpartyName: null, counterpartyDoc: null, paymentMethod: null, kind: null, classifiedBy: 'auto', linkedTransactionId: null } satisfies ClassifyTx
    const r = classify([tx], { ownerDocs: [], ownerNames: [], accounts: [{ id: 'a', type: 'BANK' }], rules: [{ matchField: 'description', pattern: patternFor(raw)!, merchantId: 'm1', categoryId: 'c1', kind: null }], merchantsById: {} })
    expect(r.decisions[0]).toMatchObject({ merchantId: 'm1', categoryId: 'c1' })
  })
})

describe('groupNewPlaces', () => {
  const row = (id: string, description: string, amountCents: number, date = '2026-11-20') => ({ id, description, amountCents, date })
  it('agrupa por padrão, ordena por frequência e soma o total', () => {
    const g = groupNewPlaces([
      row('1', 'PADARIA X 10/11', -1000),
      row('2', 'Uber Trip', -2000),
      row('3', 'PADARIA X 12/11', -500, '2026-11-25'),
      row('4', '12', -1),
    ])
    expect(g).toHaveLength(2)
    expect(g[0]).toMatchObject({ pattern: 'padaria x', count: 2, totalCents: -1500, ids: ['3', '1'], displayName: 'Padaria X' })
    expect(g[1]).toMatchObject({ pattern: 'uber trip', count: 1 })
  })
  it('limita aos 20 mais frequentes', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(String(i), `Loja ${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`, -100))
    expect(groupNewPlaces(rows)).toHaveLength(20)
  })
})
