import { describe, expect, it } from 'vitest'
import { connectionNotices } from './connection-status'

const now = new Date('2026-11-27T12:00:00Z')
const c = (status: string, consentExpiresAt: string | null = null) => ({ id: '1', connectorName: 'Banco X', status, consentExpiresAt })

describe('connectionNotices', () => {
  it('saudável não avisa', () => {
    expect(connectionNotices([c('UPDATED'), c('UPDATING')], now)).toEqual([])
  })
  it('status com problema pede reconexão', () => {
    expect(connectionNotices([c('LOGIN_ERROR')], now)[0].text).toBe('Banco X: reconecte seu banco')
    expect(connectionNotices([c('SYNC_ERROR')], now)).toHaveLength(1)
  })
  it('consentimento a menos de 30 dias avisa com dd/MM', () => {
    expect(connectionNotices([c('UPDATED', '2026-12-10T15:00:00Z')], now)[0].text).toBe('Banco X: renovar até 10/12')
  })
  it('consentimento distante não avisa', () => {
    expect(connectionNotices([c('UPDATED', '2027-03-01T00:00:00Z')], now)).toEqual([])
  })
})
