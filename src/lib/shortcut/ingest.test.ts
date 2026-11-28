import { describe, expect, it, vi } from 'vitest'
import { hashToken } from './token'
import { ingestShortcut, pickAccount, RATE_LIMIT_PER_HOUR, type IngestRepo, type ShortcutInsert } from './ingest'

interface Acc { id: string; userId: string; type: 'BANK' | 'CREDIT' | 'MANUAL' | 'BENEFIT'; name: string; institution: string }

function memory(accounts: Acc[] = []) {
  const tokens = new Map<string, string>([[hashToken('tok-a'), 'A'], [hashToken('tok-b'), 'B']])
  const inserted: ShortcutInsert[] = []
  const accs = [...accounts]
  const classify = vi.fn(async () => {})
  const repo: IngestRepo = {
    async findUserByTokenHash(h) { return tokens.get(h) ?? null },
    async countShortcutsSince(userId, since) {
      return inserted.filter((t) => t.userId === userId && t.occurredAt >= since).length
    },
    async listCreditAccounts(userId) {
      return accs.filter((a) => a.userId === userId && a.type === 'CREDIT').map(({ id, name, institution }) => ({ id, name, institution }))
    },
    async findBenefitAccount(userId) {
      return accs.find((a) => a.userId === userId && a.type === 'BENEFIT')?.id ?? null
    },
    async ensureManualAccount(userId) {
      let a = accs.find((x) => x.userId === userId && x.type === 'MANUAL')
      if (!a) accs.push((a = { id: `man-${userId}`, userId, type: 'MANUAL', name: 'Atalho', institution: 'Atalho' }))
      return a.id
    },
    async insertTransaction(row) { inserted.push(row) },
    classify,
  }
  return { repo, inserted, accs, classify }
}

const now = () => new Date('2026-11-28T02:30:00Z') // 27/11 23:30 em SP
const req = (body: unknown, auth = 'Bearer tok-a') => ({ authorization: auth, body })

describe('ingestShortcut', () => {
  it('401 sem token ou com token inválido', async () => {
    const m = memory()
    expect((await ingestShortcut(m.repo, req({ amount: 9, merchant: 'X' }, ''), now)).status).toBe(401)
    expect((await ingestShortcut(m.repo, req({ amount: 9, merchant: 'X' }, 'Bearer nope'), now)).status).toBe(401)
    expect((await ingestShortcut(m.repo, req({ amount: 9, merchant: 'X' }, 'tok-a'), now)).status).toBe(401)
    expect(m.inserted).toHaveLength(0)
  })

  it('400 com corpo inválido', async () => {
    const m = memory()
    for (const body of [null, 'x', { amount: 'abc', merchant: 'X' }, { amount: 9, merchant: '' }, { amount: 9, merchant: 'x'.repeat(121) }, { amount: 9, merchant: 'X', card: 'y'.repeat(61) }, { amount: 9, merchant: 'X', card: 3 }]) {
      const r = await ingestShortcut(m.repo, req(body), now)
      expect(r.status).toBe(400)
      expect(typeof (r.body as { error: string }).error).toBe('string')
    }
    expect(m.inserted).toHaveLength(0)
  })

  it('grava saída na conta manual Atalho com data de SP e classifica', async () => {
    const m = memory()
    const r = await ingestShortcut(m.repo, req({ amount: 'R$ 1.234,56', merchant: '  Padaria  ' }), now)
    expect(r).toEqual({ status: 201, body: { ok: true } })
    expect(m.inserted).toEqual([
      { userId: 'A', accountId: 'man-A', date: '2026-11-27', occurredAt: '2026-11-28T02:30:00.000Z', amountCents: -123456, descriptionRaw: 'Padaria' },
    ])
    expect(m.classify).toHaveBeenCalledWith('A', '2026-11-27')
  })

  it('usa o cartão cujo nome contém a dica', async () => {
    const m = memory([
      { id: 'c1', userId: 'A', type: 'CREDIT', name: 'Nubank Mastercard', institution: 'Nubank' },
      { id: 'c2', userId: 'A', type: 'CREDIT', name: 'Itaú Visa', institution: 'Itaú' },
    ])
    await ingestShortcut(m.repo, req({ amount: 9, merchant: 'X', card: 'itaú' }), now)
    expect(m.inserted[0].accountId).toBe('c2')
    // sem dica e com dois cartões: conta manual
    await ingestShortcut(m.repo, req({ amount: 9, merchant: 'X' }), now)
    expect(m.inserted[1].accountId).toBe('man-A')
  })

  it('casa por palavra em comum nos dois sentidos e ignora dica curta', () => {
    const accs = [
      { id: 'c1', name: 'Mastercard Black', institution: 'Nubank' },
      { id: 'c2', name: 'Visa Infinite', institution: 'Itaú Unibanco' },
    ]
    expect(pickAccount(accs, 'Itaú Visa Infinite')).toBe('c2')
    expect(pickAccount(accs, 'NUBANK')).toBe('c1')
    expect(pickAccount(accs, 'Cartão Nubank Ultravioleta')).toBe('c1')
    expect(pickAccount(accs, 'it')).toBeNull()
    expect(pickAccount(accs, 'Inter')).toBeNull()
  })

  it('usa o único cartão quando não há dica', async () => {
    const m = memory([{ id: 'c1', userId: 'A', type: 'CREDIT', name: 'Cartão', institution: 'Nubank' }])
    await ingestShortcut(m.repo, req({ amount: 9, merchant: 'X', card: 'Inter' }), now)
    expect(m.inserted[0].accountId).toBe('c1')
  })

  it('token de A nunca grava em B', async () => {
    const m = memory([{ id: 'cb', userId: 'B', type: 'CREDIT', name: 'Cartão B', institution: 'Banco B' }])
    await ingestShortcut(m.repo, req({ amount: 9, merchant: 'X', card: 'Cartão B' }), now)
    expect(m.inserted).toHaveLength(1)
    expect(m.inserted[0]).toMatchObject({ userId: 'A', accountId: 'man-A' })
    expect(m.accs.filter((a) => a.userId === 'B')).toHaveLength(1)
  })

  it('limita a 60 por hora por usuário', async () => {
    const m = memory()
    for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) expect((await ingestShortcut(m.repo, req({ amount: 1, merchant: 'X' }), now)).status).toBe(201)
    expect((await ingestShortcut(m.repo, req({ amount: 1, merchant: 'X' }), now)).status).toBe(429)
    // outro usuário não é afetado
    expect((await ingestShortcut(m.repo, req({ amount: 1, merchant: 'X' }, 'Bearer tok-b'), now)).status).toBe(201)
    // uma hora depois libera
    const later = () => new Date('2026-11-28T03:31:00Z')
    expect((await ingestShortcut(m.repo, req({ amount: 1, merchant: 'X' }), later)).status).toBe(201)
  })

  it('falha na classificação não impede a gravação', async () => {
    const m = memory()
    m.classify.mockRejectedValueOnce(new Error('x'))
    const log = vi.fn()
    expect((await ingestShortcut(m.repo, req({ amount: 1, merchant: 'X' }), now, log)).status).toBe(201)
    expect(log).toHaveBeenCalledWith('atalho: classificação falhou')
  })

  it('cartão de benefício vai para a conta VR do usuário', async () => {
    const m = memory([
      { id: 'c1', userId: 'A', type: 'CREDIT', name: 'Nubank', institution: 'Nubank' },
      { id: 'vr-a', userId: 'A', type: 'BENEFIT', name: 'VR', institution: 'VR' },
      { id: 'vr-b', userId: 'B', type: 'BENEFIT', name: 'VR', institution: 'VR' },
    ])
    await ingestShortcut(m.repo, req({ amount: 30, merchant: 'Restaurante', card: 'Alelo Refeição' }), now)
    expect(m.inserted[0].accountId).toBe('vr-a')
    // Sem conta VR, segue a regra normal (único cartão).
    const n = memory([{ id: 'c1', userId: 'A', type: 'CREDIT', name: 'Nubank', institution: 'Nubank' }])
    await ingestShortcut(n.repo, req({ amount: 30, merchant: 'Restaurante', card: 'Ticket' }), now)
    expect(n.inserted[0].accountId).toBe('c1')
  })
})
