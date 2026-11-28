import type { Account, Item, Transaction } from 'pluggy-sdk'
import { describe, expect, it, vi } from 'vitest'
import { makeAccount, makeTransaction } from '@/lib/pluggy/fixtures'
import type { PluggySource } from '@/lib/pluggy/source'
import { createMemoryRepo } from './memory-repo'
import { deleteTransactions, syncItem } from './sync-item'

const U = 'user-1'
const ITEM = 'item-1'

function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: ITEM,
    connector: { name: 'Banco Teste' },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    error: null,
    consentExpiresAt: null,
    ...over,
  } as Item
}

function fakeSource(opts: { item?: Item; txs?: Transaction[]; accounts?: Account[] } = {}) {
  const fetchTransactions = vi.fn(async () => opts.txs ?? [makeTransaction({ id: 't1' }), makeTransaction({ id: 't2', amount: 5 })])
  const fetchAccounts = vi.fn(async () => opts.accounts ?? [makeAccount({ id: 'acc-1', balance: 100.5 })])
  const source = {
    fetchItem: async () => opts.item ?? makeItem(),
    fetchAccounts,
    fetchTransactions,
  } as unknown as PluggySource
  return { source, fetchTransactions, fetchAccounts }
}

const today = '2026-11-27'
const now = () => new Date('2026-11-27T15:00:00Z')

describe('syncItem', () => {
  it('primeira sync busca 90 dias', async () => {
    const { source, fetchTransactions } = fakeSource()
    const repo = createMemoryRepo()
    const r = await syncItem({ source, repo, today, now }, U, ITEM)
    expect(fetchTransactions).toHaveBeenCalledWith('acc-1', '2026-08-29')
    expect(r).toEqual({ accounts: 1, transactions: 2, status: 'UPDATED' })
  })

  it('é idempotente', async () => {
    const { source } = fakeSource()
    const repo = createMemoryRepo()
    await syncItem({ source, repo, today, now }, U, ITEM)
    await syncItem({ source, repo, today, now }, U, ITEM)
    const d = repo.dump()
    expect(d.transactions).toHaveLength(2)
    expect(d.accounts).toHaveLength(1)
    expect(d.connections).toHaveLength(1)
  })

  it('transação alterada atualiza a mesma linha', async () => {
    const repo = createMemoryRepo()
    await syncItem({ source: fakeSource().source, repo, today, now }, U, ITEM)
    const changed = [makeTransaction({ id: 't1', amount: 20, status: 'POSTED' as Transaction['status'] }), makeTransaction({ id: 't2', amount: 5 })]
    await syncItem({ source: fakeSource({ txs: changed }).source, repo, today, now }, U, ITEM)
    const t1 = repo.dump().transactions.filter((t) => t.externalId === 't1')
    expect(t1).toHaveLength(1)
    expect(t1[0].amountCents).toBe(-2000)
    expect(t1[0].status).toBe('POSTED')
  })

  it('deleteTransactions marca só as indicadas', async () => {
    const repo = createMemoryRepo()
    await syncItem({ source: fakeSource().source, repo, today, now }, U, ITEM)
    await deleteTransactions({ repo }, U, ['t1'])
    const d = repo.dump().transactions
    expect(d.find((t) => t.externalId === 't1')?.deletedAt).not.toBeNull()
    expect(d.find((t) => t.externalId === 't2')?.deletedAt).toBeNull()
    // nova sync não ressuscita a transação apagada
    await syncItem({ source: fakeSource().source, repo, today, now }, U, ITEM)
    expect(repo.dump().transactions.find((t) => t.externalId === 't1')?.deletedAt).not.toBeNull()
  })

  it('LOGIN_ERROR grava status e não busca contas', async () => {
    const { source, fetchAccounts } = fakeSource({ item: makeItem({ status: 'LOGIN_ERROR' }) })
    const repo = createMemoryRepo()
    const r = await syncItem({ source, repo, today, now }, U, ITEM)
    expect(r).toEqual({ accounts: 0, transactions: 0, status: 'LOGIN_ERROR' })
    expect(fetchAccounts).not.toHaveBeenCalled()
    expect(repo.dump().connections[0].status).toBe('LOGIN_ERROR')
    expect(repo.dump().connections[0].lastSyncedAt).toBeNull()
  })

  it('grava snapshot do dia e sobrescreve no mesmo dia', async () => {
    const repo = createMemoryRepo()
    await syncItem({ source: fakeSource().source, repo, today, now }, U, ITEM)
    await syncItem({ source: fakeSource().source, repo, today, now }, U, ITEM)
    const s = repo.dump().snapshots
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ date: today, balanceCents: 10050 })
  })

  it('segunda sync usa last_synced_at - 3 dias', async () => {
    const repo = createMemoryRepo()
    await syncItem({ source: fakeSource().source, repo, today, now }, U, ITEM)
    expect(repo.dump().connections[0].lastSyncedAt).toBe('2026-11-27T15:00:00.000Z')
    const { source, fetchTransactions } = fakeSource()
    await syncItem({ source, repo, today: '2026-12-05', now: () => new Date('2026-12-05T15:00:00Z') }, U, ITEM)
    expect(fetchTransactions).toHaveBeenCalledWith('acc-1', '2026-11-24')
  })

  it('erro da Pluggy não vaza o objeto do erro', async () => {
    const err = Object.assign(new Error('boom'), { config: { headers: { 'X-API-KEY': 'segredo' } } })
    const source = { fetchItem: async () => { throw err } } as unknown as PluggySource
    const e = await syncItem({ source, repo: createMemoryRepo(), today, now }, U, ITEM).catch((x) => x)
    expect(String(e.message)).toContain('boom')
    expect(JSON.stringify(e)).not.toContain('segredo')
    expect(e.cause).toBeUndefined()
  })

  describe('caixinhas', () => {
    const box = (id: string, amount: number, name?: string) => ({
      identification: id,
      ...(name ? { name } : {}),
      availableAmounts: [{ amount, currencyCode: 'BRL', remuneration: { indexer: 'CDI', postFixedIndexerPercentage: 1.2 } }],
    })
    const mp = (boxes: unknown[]) =>
      [makeAccount({ id: 'acc-1', balance: 0, bankData: { reservedBalances: boxes } } as never)]

    it('grava caixinhas e snapshot do dia, idempotente', async () => {
      const repo = createMemoryRepo()
      const accounts = mp([box('b1', 10, 'Viagem'), box('b2', 20.5)])
      await syncItem({ source: fakeSource({ accounts }).source, repo, today, now }, U, ITEM)
      await syncItem({ source: fakeSource({ accounts }).source, repo, today, now }, U, ITEM)
      const d = repo.dump()
      expect(d.boxes).toHaveLength(2)
      expect(d.boxes.find((b) => b.externalId === 'b1')).toMatchObject({ name: 'Viagem', balanceCents: 1000, cdiPercent: 120, accountId: d.accounts[0].id })
      expect(d.boxSnapshots).toHaveLength(2)
    })

    it('snapshot do mesmo dia é sobrescrito; caixinha que some fica', async () => {
      const repo = createMemoryRepo()
      await syncItem({ source: fakeSource({ accounts: mp([box('b1', 10), box('b2', 5)]) }).source, repo, today, now }, U, ITEM)
      await syncItem({ source: fakeSource({ accounts: mp([box('b1', 12)]) }).source, repo, today, now }, U, ITEM)
      const d = repo.dump()
      expect(d.boxes).toHaveLength(2)
      const b1 = d.boxes.find((b) => b.externalId === 'b1')!
      expect(d.boxSnapshots.filter((s) => s.boxId === b1.id)).toEqual([{ userId: U, boxId: b1.id, date: today, balanceCents: 1200 }])
    })

    it('marca rendimento como savings_yield só em conta com caixinha', async () => {
      const txs = [
        makeTransaction({ id: 'r1', type: 'CREDIT', amount: 1.23, description: 'Rendimento' } as Partial<Transaction>),
        makeTransaction({ id: 'p1', type: 'CREDIT', amount: 50, description: 'Pix recebido' } as Partial<Transaction>),
      ]
      const repo = createMemoryRepo()
      await syncItem({ source: fakeSource({ accounts: mp([box('b1', 10)]), txs }).source, repo, today, now }, U, ITEM)
      const byId = new Map(repo.dump().transactions.map((t) => [t.externalId, t]))
      expect(byId.get('r1')?.kind).toBe('savings_yield')
      expect(byId.get('p1')?.kind).toBeUndefined()

      const repo2 = createMemoryRepo()
      await syncItem({ source: fakeSource({ txs }).source, repo: repo2, today, now }, U, ITEM)
      expect(repo2.dump().transactions.every((t) => t.kind === undefined)).toBe(true)
    })
  })
})
