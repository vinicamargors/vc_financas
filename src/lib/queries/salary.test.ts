import { describe, expect, it } from 'vitest'
import { groupPayers, SALARY_MIN_CENTS } from './salary'

const r = (p: Partial<Parameters<typeof groupPayers>[0][number]>) => ({
  date: '2026-11-27', amountCents: 500_000, counterpartyDoc: null, counterpartyName: null, descriptionRaw: 'TED RECEBIDA', ...p,
})

describe('groupPayers', () => {
  it('agrupa por documento, depois nome da contraparte (sem nenhum, fica fora); ignora abaixo de R$ 1.000 e fontes já salvas', () => {
    const rows = [
      r({ counterpartyDoc: '12.345.678/0001-90', counterpartyName: 'ACME LTDA', date: '2026-10-29', amountCents: 800_000 }),
      r({ counterpartyDoc: '12345678000190', counterpartyName: 'Acme', date: '2026-11-27', amountCents: 850_000 }),
      r({ counterpartyName: 'Beta Serviços', amountCents: 120_000 }),
      r({ descriptionRaw: 'PIX RECEBIDO', amountCents: SALARY_MIN_CENTS - 1 }),
      r({ descriptionRaw: 'TED RECEBIDA EMPRESA X', amountCents: 900_000 }),
      r({ counterpartyName: 'Gama', amountCents: 300_000 }),
    ]
    const groups = groupPayers(rows, [{ payerDoc: null, payerName: 'gama' }])
    expect(groups).toEqual([
      { key: '12345678000190', label: 'Acme', payerDoc: '12345678000190', payerName: 'Acme', count: 2, lastDate: '2026-11-27', lastAmountCents: 850_000 },
      { key: 'beta servicos', label: 'Beta Serviços', payerDoc: null, payerName: 'Beta Serviços', count: 1, lastDate: '2026-11-27', lastAmountCents: 120_000 },
    ])
  })
})
