import { describe, expect, it } from 'vitest'
import { placesSince } from './review'
import { oldestBankData } from './balances'

describe('placesSince', () => {
  const g = (pattern: string, ids: string[]) => ({ pattern, displayName: pattern, count: ids.length, totalCents: 0, ids })
  it('mantém só lugares com ocorrência depois da conexão', () => {
    const out = placesSince([g('antigo', ['a1', 'a2']), g('voltou', ['n1', 'a3'])], new Set(['n1']))
    expect(out.map((x) => x.pattern)).toEqual(['voltou'])
  })
})

describe('oldestBankData', () => {
  const c = (status: string, bankDataAt: string | null) => ({ id: 'x', connectorName: 'B', status, consentExpiresAt: null, lastSyncedAt: null, bankDataAt })
  it('usa a busca mais antiga entre conexões saudáveis', () => {
    expect(oldestBankData([c('UPDATED', '2026-11-28T10:00:00Z'), c('UPDATED', '2026-11-27T21:04:00Z'), c('LOGIN_ERROR', '2026-01-01T00:00:00Z')])).toBe(
      '2026-11-27T21:04:00Z',
    )
  })
  it('sem dado: nulo', () => {
    expect(oldestBankData([c('UPDATED', null)])).toBeNull()
  })
})
