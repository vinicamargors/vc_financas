import type { AccountRow, TransactionRow } from '@/lib/pluggy/map'
import type { ConnectionRow, SyncRepo } from './repo'

export type StoredAccount = AccountRow & { id: string }
export type StoredTransaction = TransactionRow & { deletedAt: string | null }
export interface StoredSnapshot {
  userId: string
  accountId: string
  date: string
  balanceCents: number
}

/** Repositório em memória com a mesma semântica de upsert do Supabase (para testes). */
export function createMemoryRepo(): SyncRepo & {
  dump(): {
    connections: ConnectionRow[]
    accounts: StoredAccount[]
    transactions: StoredTransaction[]
    snapshots: StoredSnapshot[]
  }
} {
  const connections = new Map<string, ConnectionRow>()
  const accounts = new Map<string, StoredAccount>()
  const transactions = new Map<string, StoredTransaction>()
  const snapshots = new Map<string, StoredSnapshot>()
  let seq = 0
  const newId = () => `id-${++seq}`

  return {
    async getConnection(userId, itemId) {
      return connections.get(`${userId}:${itemId}`) ?? null
    },
    async upsertConnection(row) {
      const key = `${row.userId}:${row.pluggyItemId}`
      const prev = connections.get(key)
      const next: ConnectionRow = {
        ...row,
        id: prev?.id ?? newId(),
        createdAt: prev?.createdAt ?? new Date().toISOString(),
      }
      connections.set(key, next)
      return { ...next }
    },
    async upsertAccounts(rows) {
      return rows.map((r) => {
        const key = `${r.userId}:${r.externalId}`
        const stored = { ...r, id: accounts.get(key)?.id ?? newId() }
        accounts.set(key, stored)
        return { id: stored.id, externalId: stored.externalId, type: stored.type }
      })
    },
    async upsertTransactions(rows) {
      const keys = new Set<string>()
      for (const r of rows) {
        const key = `${r.userId}:${r.externalId}`
        keys.add(key)
        transactions.set(key, { ...r, deletedAt: transactions.get(key)?.deletedAt ?? null })
      }
      return keys.size
    },
    async markTransactionsDeleted(userId, externalIds) {
      for (const id of externalIds) {
        const t = transactions.get(`${userId}:${id}`)
        if (t) t.deletedAt = new Date().toISOString()
      }
    },
    async upsertBalanceSnapshot(userId, accountId, date, balanceCents) {
      snapshots.set(`${userId}:${accountId}:${date}`, { userId, accountId, date, balanceCents })
    },
    dump: () => ({
      connections: [...connections.values()],
      accounts: [...accounts.values()],
      transactions: [...transactions.values()],
      snapshots: [...snapshots.values()],
    }),
  }
}
