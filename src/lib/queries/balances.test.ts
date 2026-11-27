import { describe, expect, it } from 'vitest'
import { summarizeCheckingBalances } from './balances'

const acc = (institution: string, type: string, subtype: string, balanceCents: number, updatedAt = '2026-11-27T10:00:00Z') => ({
  institution, type, subtype, balanceCents, updatedAt,
})

describe('summarizeCheckingBalances', () => {
  it('soma só contas correntes, ignora cartão e poupança', () => {
    const r = summarizeCheckingBalances([
      acc('Bradesco', 'BANK', 'CHECKING_ACCOUNT', 30000),
      acc('Nubank', 'BANK', 'CHECKING_ACCOUNT', 30000),
      acc('Nubank', 'CREDIT', 'CREDIT_CARD', -136000),
      acc('Nubank', 'BANK', 'SAVINGS_ACCOUNT', 5000),
    ])
    expect(r.totalCents).toBe(60000)
    expect(r.byInstitution).toHaveLength(2)
  })
  it('soma contas do mesmo banco numa linha e ordena por saldo desc', () => {
    const r = summarizeCheckingBalances([
      acc('A', 'BANK', 'CHECKING_ACCOUNT', 1000),
      acc('B', 'BANK', 'CHECKING_ACCOUNT', 9000),
      acc('A', 'BANK', 'CHECKING_ACCOUNT', 2000),
    ])
    expect(r.byInstitution).toEqual([
      { institution: 'B', balanceCents: 9000 },
      { institution: 'A', balanceCents: 3000 },
    ])
  })
  it('updatedAt é o mais antigo', () => {
    const r = summarizeCheckingBalances([
      acc('A', 'BANK', 'CHECKING_ACCOUNT', 1, '2026-11-27T10:00:00Z'),
      acc('B', 'BANK', 'CHECKING_ACCOUNT', 1, '2026-11-27T08:00:00Z'),
    ])
    expect(r.updatedAt).toBe('2026-11-27T08:00:00Z')
  })
  it('lista vazia', () => {
    expect(summarizeCheckingBalances([])).toEqual({ totalCents: 0, byInstitution: [], updatedAt: null })
  })
})
