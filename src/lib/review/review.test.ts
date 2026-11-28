import type { Transaction } from 'pluggy-sdk'
import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '@/lib/pluggy/fixtures'
import type { PluggySource } from '@/lib/pluggy/source'
import { reclassifyAll } from '@/lib/sync/classification'
import { createMemoryRepo } from '@/lib/sync/memory-repo'
import { syncItem } from '@/lib/sync/sync-item'
import { confirmPendingCore, teachPlaceCore, type ReviewStore } from './review'

const U = 'user-1'
const today = '2026-11-27'
const now = () => new Date('2026-11-27T15:00:00Z')

/** ReviewStore sobre o repositório em memória, com o classificador de verdade. */
function setup(txs: Record<string, Transaction[]>) {
  const repo = createMemoryRepo()
  const merchants: { id: string; name: string; categoryId: string | null }[] = []
  const rules: unknown[] = []
  const store: ReviewStore = {
    async getTransaction(userId, id) {
      const t = repo.dump().transactions.find((x) => x.id === id && x.userId === userId)
      return t ? { id: t.id, descriptionRaw: t.descriptionRaw, linkedTransactionId: t.linkedTransactionId } : null
    },
    async patchTransactions(userId, ids, patch, opts) {
      let n = 0
      for (const t of repo.dump().transactions) {
        if (t.userId !== userId || !ids.includes(t.id)) continue
        if (opts?.onlyAutoExpense && (t.kind !== 'expense' || t.classifiedBy !== 'auto')) continue
        repo.patch(t.id, patch)
        n += 1
      }
      return n
    },
    async findOrCreateMerchant(_u, name, categoryId) {
      const m = merchants.find((x) => x.name.toLowerCase() === name.toLowerCase())
      if (m) return m.id
      merchants.push({ id: `m${merchants.length + 1}`, name, categoryId })
      repo.seed({ merchants: [{ id: `m${merchants.length}`, userId: U, categoryId }] })
      return `m${merchants.length}`
    },
    async upsertRule(userId, rule) {
      rules.push(rule)
      repo.seed({ rules: [{ ...rule, userId }] })
    },
    async reclassify(userId) {
      await reclassifyAll({ repo, today }, userId)
    },
  }
  const source = {
    fetchItem: async () => ({ id: 'item-1', connector: { name: 'Banco' }, status: 'UPDATED', executionStatus: 'SUCCESS', error: null, consentExpiresAt: null }),
    fetchAccounts: async () => Object.keys(txs).map((id) => makeAccount({ id })),
    fetchTransactions: async (id: string) => txs[id] ?? [],
  } as unknown as PluggySource
  const byExt = () => new Map(repo.dump().transactions.map((t) => [t.externalId, t]))
  return { repo, store, merchants, rules, byExt, sync: () => syncItem({ source, repo, today, now }, U, 'item-1') }
}

async function pendingPair() {
  const s = setup({
    'acc-1': [makeTransaction({ id: 'o', description: 'Envio X', amount: 500, date: new Date('2026-11-20T15:00:00Z') })],
    'acc-2': [makeTransaction({ id: 'i', description: 'Recebido Y', type: 'CREDIT', amount: 500, date: new Date('2026-11-20T15:00:00Z') })],
  })
  await s.sync()
  const o = s.byExt().get('o')!
  const i = s.byExt().get('i')!
  s.repo.patch(o.id, { kind: 'pending_review', linkedTransactionId: i.id })
  s.repo.patch(i.id, { kind: 'pending_review', linkedTransactionId: o.id })
  return { ...s, o: o.id, i: i.id }
}

describe('confirmPendingCore com par ligado', () => {
  it.each(['transfer', 'loan'] as const)('%s: as duas linhas viram transferência do usuário e o par fica', async (choice) => {
    const s = await pendingPair()
    await confirmPendingCore(s.store, U, s.o, choice)
    expect(s.byExt().get('o')).toMatchObject({ kind: 'transfer', classifiedBy: 'user', categoryId: null, linkedTransactionId: s.i })
    expect(s.byExt().get('i')).toMatchObject({ kind: 'transfer', classifiedBy: 'user', categoryId: null, linkedTransactionId: s.o })
  })
  it('gasto: desfaz o par, a linha vira gasto do usuário e o parceiro volta para a classificação automática', async () => {
    const s = await pendingPair()
    await confirmPendingCore(s.store, U, s.o, 'expense')
    expect(s.byExt().get('o')).toMatchObject({ kind: 'expense', classifiedBy: 'user', linkedTransactionId: null })
    const partner = s.byExt().get('i')!
    expect(partner).toMatchObject({ classifiedBy: 'auto', linkedTransactionId: null })
  })
  it('outro: gasto com a categoria escolhida', async () => {
    const s = await pendingPair()
    await confirmPendingCore(s.store, U, s.o, 'other', 'c1')
    expect(s.byExt().get('o')).toMatchObject({ kind: 'expense', categoryId: 'c1', classifiedBy: 'user', linkedTransactionId: null })
    expect(s.byExt().get('i')).toMatchObject({ classifiedBy: 'auto', linkedTransactionId: null })
  })
  it('outro sem categoria e escolha inválida são recusados', async () => {
    const s = await pendingPair()
    await expect(confirmPendingCore(s.store, U, s.o, 'other')).rejects.toThrow()
    await expect(confirmPendingCore(s.store, U, s.o, 'xx' as never)).rejects.toThrow()
    await expect(confirmPendingCore(s.store, U, 'nao-existe', 'expense')).rejects.toThrow()
  })
})

describe('teachPlaceCore', () => {
  async function places() {
    const s = setup({
      'acc-1': [
        makeTransaction({ id: 'p1', description: 'PADARIA X 25/11', amount: 10, date: new Date('2026-11-25T15:00:00Z') }),
        makeTransaction({ id: 'p2', description: 'PADARIA X 20/11', amount: 12, date: new Date('2026-11-20T15:00:00Z') }),
        makeTransaction({ id: 'p3', description: 'PADARIA X 18/11', amount: 8, date: new Date('2026-11-18T15:00:00Z') }),
      ],
    })
    await s.sync()
    const ids = ['p1', 'p2', 'p3'].map((e) => s.byExt().get(e)!.id)
    return { ...s, ids }
  }

  it('lembrar: grava a regra com o padrão do servidor, marca só a linha editada e reclassifica o resto', async () => {
    const s = await places()
    // Linha já do usuário fica intacta.
    s.repo.patch(s.ids[2], { classifiedBy: 'user', kind: 'expense', categoryId: 'outra' })
    await teachPlaceCore(s.store, U, { ids: s.ids, displayName: ' Padaria do X ', categoryId: 'c1', remember: true })
    expect(s.rules).toEqual([{ matchField: 'description', pattern: 'padaria x', merchantId: 'm1', categoryId: 'c1', kind: null }])
    expect(s.byExt().get('p1')).toMatchObject({ classifiedBy: 'user', merchantId: 'm1', categoryId: 'c1' })
    expect(s.byExt().get('p2')).toMatchObject({ classifiedBy: 'auto', merchantId: 'm1', categoryId: 'c1', kind: 'expense' })
    expect(s.byExt().get('p3')).toMatchObject({ classifiedBy: 'user', categoryId: 'outra', merchantId: null })
  })
  it('sem lembrar: sem regra, marca só as linhas do grupo ainda automáticas e de gasto', async () => {
    const s = await places()
    s.repo.patch(s.ids[2], { classifiedBy: 'user', kind: 'transfer' })
    await teachPlaceCore(s.store, U, { ids: s.ids, displayName: 'Padaria', categoryId: 'c1', remember: false })
    expect(s.rules).toEqual([])
    expect(s.byExt().get('p1')).toMatchObject({ classifiedBy: 'user', merchantId: 'm1' })
    expect(s.byExt().get('p2')).toMatchObject({ classifiedBy: 'user', merchantId: 'm1' })
    expect(s.byExt().get('p3')).toMatchObject({ kind: 'transfer', merchantId: null })
  })
  it('reaproveita o estabelecimento com o mesmo nome', async () => {
    const s = await places()
    await teachPlaceCore(s.store, U, { ids: [s.ids[0]], displayName: 'Padaria', categoryId: 'c1', remember: false })
    await teachPlaceCore(s.store, U, { ids: [s.ids[1]], displayName: 'PADARIA', categoryId: 'c1', remember: false })
    expect(s.merchants).toHaveLength(1)
  })
  it('recusa: nome vazio, ids vazios, nenhuma linha afetada, descrição genérica', async () => {
    const s = await places()
    await expect(teachPlaceCore(s.store, U, { ids: s.ids, displayName: ' ', categoryId: 'c1', remember: true })).rejects.toThrow()
    await expect(teachPlaceCore(s.store, U, { ids: [], displayName: 'X', categoryId: 'c1', remember: true })).rejects.toThrow()
    s.repo.patch(s.ids[0], { classifiedBy: 'user' })
    await expect(teachPlaceCore(s.store, U, { ids: [s.ids[0]], displayName: 'X', categoryId: 'c1', remember: false })).rejects.toThrow()
    s.repo.patch(s.ids[1], { descriptionRaw: 'Pix enviado' })
    await expect(teachPlaceCore(s.store, U, { ids: [s.ids[1]], displayName: 'X', categoryId: 'c1', remember: true })).rejects.toThrow()
  })
  it('recusa transferência para pessoa mesmo que o cliente a envie', async () => {
    const s = await places()
    s.repo.patch(s.ids[0], { descriptionRaw: 'Pix enviado para Maria da Silva Santos' })
    await expect(teachPlaceCore(s.store, U, { ids: [s.ids[0]], displayName: 'Maria', categoryId: 'c1', remember: true })).rejects.toThrow(/pessoa/i)
    expect(s.rules).toEqual([])
    expect(s.merchants).toHaveLength(0)
  })
})
