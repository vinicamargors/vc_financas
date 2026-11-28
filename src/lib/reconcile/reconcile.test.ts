import { describe, expect, it } from 'vitest'
import { isMissingFromBank, reconcileManuals, similarDescription, type ManualRow, type ReconcileCandidate } from './reconcile'

const manual = (p: Partial<ManualRow> = {}): ManualRow => ({
  id: 'm1', accountId: 'nu-card', bankKey: 'nu', date: '2026-11-27', amountCents: -4_590, createdAt: '2026-11-27T15:00:00Z',
  occurredAt: '2026-11-27T14:55:00Z', description: 'Padaria Real', merchantId: 'mer', categoryId: 'food', kind: 'expense',
  classifiedBy: 'user', reconcileCandidateId: null, ...p,
})
const cand = (p: Partial<ReconcileCandidate> = {}): ReconcileCandidate => ({
  id: 'p1', accountId: 'nu-card', bankKey: 'nu', date: '2026-11-27', amountCents: -4_590, createdAt: '2026-11-28T09:00:00Z',
  occurredAt: null, description: 'PADARIA REAL LTDA', ...p,
})

describe('similarDescription', () => {
  it('palavras em comum ou contidas, sem acento e caixa', () => {
    expect(similarDescription('Padaria Real', 'PADARIA REAL LTDA')).toBe(true)
    expect(similarDescription('Açaí do Zé', 'ACAI DO ZE SP')).toBe(true)
    expect(similarDescription('Uber', 'Posto Ipiranga')).toBe(false)
  })
})

describe('reconcileManuals', () => {
  it('certeza: 1 candidato, mesma conta e valor, descrição parecida → funde com a classificação do usuário', () => {
    const r = reconcileManuals([manual()], [cand()], new Set())
    expect(r.merges).toEqual([{ shortcut: expect.objectContaining({ id: 'm1', categoryId: 'food', classifiedBy: 'user' }), pluggyId: 'p1' }])
    expect(r.doubts).toEqual([])
  })

  it('certeza também pela hora: descrição diferente, mas até 2 h de diferença', () => {
    const r = reconcileManuals([manual({ description: 'pão' })], [cand({ occurredAt: '2026-11-27T16:40:00Z' })], new Set())
    expect(r.merges.map((m) => m.pluggyId)).toEqual(['p1'])
  })

  it('dúvida: dois candidatos iguais', () => {
    const r = reconcileManuals([manual()], [cand({ id: 'p1' }), cand({ id: 'p2', date: '2026-11-28' })], new Set())
    expect(r.merges).toEqual([])
    expect(r.doubts).toEqual([{ manualId: 'm1', candidateId: 'p1' }])
  })

  it('dúvida: valor diferente em até 5% (gorjeta), mesma conta', () => {
    const r = reconcileManuals([manual({ amountCents: -10_000 })], [cand({ amountCents: -10_450 }), cand({ id: 'p9', amountCents: -10_600 })], new Set())
    expect(r.doubts).toEqual([{ manualId: 'm1', candidateId: 'p1' }])
  })

  it('dúvida: mesmo valor em outra conta do mesmo banco; banco diferente não conta', () => {
    expect(reconcileManuals([manual()], [cand({ accountId: 'nu-bank' })], new Set()).doubts).toEqual([{ manualId: 'm1', candidateId: 'p1' }])
    const other = reconcileManuals([manual()], [cand({ accountId: 'itau-card', bankKey: 'itau' })], new Set())
    expect(other).toEqual({ merges: [], doubts: [] })
  })

  it('dúvida: candidato único sem descrição parecida nem hora próxima', () => {
    const r = reconcileManuals([manual({ description: 'pão' })], [cand({ occurredAt: '2026-11-27T20:00:00Z' })], new Set())
    expect(r.doubts).toEqual([{ manualId: 'm1', candidateId: 'p1' }])
  })

  it('sem par: compra antiga, já ligada, fora da janela ou de sinal oposto não casa', () => {
    const r = reconcileManuals(
      [manual()],
      [
        cand({ id: 'old', createdAt: '2026-11-27T14:00:00Z' }),
        cand({ id: 'taken' }),
        cand({ id: 'far', date: '2026-11-29' }),
        cand({ id: 'in', amountCents: 4_590 }),
      ],
      new Set(['taken']),
    )
    expect(r).toEqual({ merges: [], doubts: [] })
  })

  it('cada linha da Pluggy funde uma vez só', () => {
    const r = reconcileManuals([manual({ id: 'm1' }), manual({ id: 'm2' })], [cand()], new Set())
    expect(r.merges.map((m) => m.shortcut.id)).toEqual(['m1'])
    expect(r.doubts).toEqual([])
  })

  it('dúvida já gravada com o mesmo candidato não é regravada', () => {
    const r = reconcileManuals([manual({ reconcileCandidateId: 'p1' })], [cand({ id: 'p1' }), cand({ id: 'p2' })], new Set())
    expect(r.doubts).toEqual([])
  })
})

describe('isMissingFromBank', () => {
  const row = { source: 'manual', reconciled: false, deletedAt: null, linkedTransactionId: null, reconcileCandidateId: null, accountType: 'CREDIT', date: '2026-11-24' }
  it('manual sem par depois de 3 dias', () => {
    expect(isMissingFromBank(row, '2026-11-27')).toBe(false)
    expect(isMissingFromBank(row, '2026-11-28')).toBe(true)
  })
  it('não marca conferido, em dúvida, VR nem lançamento da Pluggy', () => {
    expect(isMissingFromBank({ ...row, reconciled: true }, '2026-12-28')).toBe(false)
    expect(isMissingFromBank({ ...row, reconcileCandidateId: 'p' }, '2026-12-28')).toBe(false)
    expect(isMissingFromBank({ ...row, accountType: 'BENEFIT' }, '2026-12-28')).toBe(false)
    expect(isMissingFromBank({ ...row, source: 'pluggy' }, '2026-12-28')).toBe(false)
  })
})
