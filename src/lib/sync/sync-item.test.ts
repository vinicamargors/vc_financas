import type { Item, Transaction } from 'pluggy-sdk'
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

function fakeSource(opts: { item?: Item; txs?: Transaction[] } = {}) {
  const fetchTransactions = vi.fn(async () => opts.txs ?? [makeTransaction({ id: 't1' }), makeTransaction({ id: 't2', amount: 5 })])
  const fetchAccounts = vi.fn(async () => [makeAccount({ id: 'acc-1', balance: 100.5 })])
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
})
