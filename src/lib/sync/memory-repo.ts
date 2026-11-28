import type { Kind, Rule } from '@/lib/classify/classify'
import type { AccountRow, SavingsBoxRow, TransactionRow } from '@/lib/pluggy/map'
import type { ClassificationChanges, ConnectionRow, SyncRepo } from './repo'

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000

export type StoredAccount = AccountRow & { id: string }
export type StoredTransaction = Omit<TransactionRow, 'kind'> & {
  id: string
  deletedAt: string | null
  kind?: Kind | null
  classifiedBy: 'auto' | 'user'
  categoryId: string | null
  merchantId: string | null
  linkedTransactionId: string | null
}
export interface MemoryProfile {
  cpf: string | null
  ownerDocs: string[]
  ownerNames: string[]
}
export interface Seed {
  categories?: { id: string; userId: string; name: string }[]
  merchants?: { id: string; userId: string; categoryId: string | null }[]
  rules?: (Rule & { userId: string })[]
  profileCpf?: Record<string, string>
}
export type StoredBox = SavingsBoxRow & { id: string }
export interface StoredBoxSnapshot {
  userId: string
  boxId: string
  date: string
  balanceCents: number
}
export interface StoredSnapshot {
  userId: string
  accountId: string
  date: string
  balanceCents: number
}

/** Repositório em memória com a mesma semântica de upsert do Supabase (para testes). */
export function createMemoryRepo(): SyncRepo & {
  seed(s: Seed): void
  /** Altera uma linha direto (simula edição do usuário ou dado legado). */
  patch(id: string, p: Partial<StoredTransaction>): void
  /** Grava uma linha do Atalho (sem external_id) e devolve o id. */
  insertShortcut(r: { userId: string; accountId: string; date: string; amountCents: number; descriptionRaw: string }): string
  calls: { applyClassification: ClassificationChanges[] }
  dump(): {
    profiles: Map<string, MemoryProfile>
    connections: ConnectionRow[]
    accounts: StoredAccount[]
    transactions: StoredTransaction[]
    snapshots: StoredSnapshot[]
    boxes: StoredBox[]
    boxSnapshots: StoredBoxSnapshot[]
  }
} {
  const connections = new Map<string, ConnectionRow>()
  const accounts = new Map<string, StoredAccount>()
  const transactions = new Map<string, StoredTransaction>()
  const snapshots = new Map<string, StoredSnapshot>()
  const boxes = new Map<string, StoredBox>()
  const boxSnapshots = new Map<string, StoredBoxSnapshot>()
  const profiles = new Map<string, MemoryProfile>()
  const categories: NonNullable<Seed['categories']> = []
  const merchants: NonNullable<Seed['merchants']> = []
  const rules: NonNullable<Seed['rules']> = []
  const calls = { applyClassification: [] as ClassificationChanges[] }
  const txById = (id: string) => [...transactions.values()].find((t) => t.id === id)
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
        const prev = transactions.get(key)
        transactions.set(key, {
          ...r,
          id: prev?.id ?? newId(),
          kind: r.kind ?? prev?.kind,
          deletedAt: prev?.deletedAt ?? null,
          classifiedBy: prev?.classifiedBy ?? 'auto',
          categoryId: prev?.categoryId ?? null,
          merchantId: prev?.merchantId ?? null,
          linkedTransactionId: prev?.linkedTransactionId ?? null,
        })
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
    async upsertSavingsBoxes(rows) {
      return rows.map((r) => {
        const key = `${r.userId}:${r.externalId}`
        const stored = { ...r, id: boxes.get(key)?.id ?? newId() }
        boxes.set(key, stored)
        return { id: stored.id, externalId: stored.externalId }
      })
    },
    async upsertSavingsBoxSnapshots(userId, date, rows) {
      for (const r of rows) boxSnapshots.set(`${userId}:${r.boxId}:${date}`, { userId, boxId: r.boxId, date, balanceCents: r.balanceCents })
    },
    async mergeOwnerIdentity(userId, docs, names) {
      const p = profiles.get(userId) ?? { cpf: null, ownerDocs: [], ownerNames: [] }
      const ds = docs.map((d) => d.replace(/\D/g, '')).filter(Boolean)
      profiles.set(userId, {
        cpf: p.cpf || ds.find((d) => d.length === 11) || null,
        ownerDocs: [...new Set([...p.ownerDocs, ...ds])],
        ownerNames: [...new Set([...p.ownerNames, ...names.map((n) => n.trim()).filter(Boolean)])],
      })
    },
    async loadClassificationData(userId, from, to) {
      const live = [...transactions.values()].filter((t) => t.userId === userId && !t.deletedAt)
      const inWindow = live.filter((t) => t.date >= from && t.date <= to)
      const ids = new Set(inWindow.map((t) => t.id))
      const partners = live.filter((t) => !ids.has(t.id) && inWindow.some((w) => w.linkedTransactionId === t.id))
      return {
        transactions: [...inWindow, ...partners].map((t) => ({
          id: t.id,
          accountId: t.accountId,
          date: t.date,
          amountCents: t.amountCents,
          descriptionRaw: t.descriptionRaw,
          pluggyCategory: t.pluggyCategory,
          counterpartyName: t.counterpartyName,
          counterpartyDoc: t.counterpartyDoc,
          paymentMethod: t.paymentMethod,
          kind: t.kind ?? null,
          classifiedBy: t.classifiedBy,
          linkedTransactionId: t.linkedTransactionId,
          categoryId: t.categoryId,
          merchantId: t.merchantId,
        })),
        accounts: [...accounts.values()].filter((a) => a.userId === userId).map((a) => ({ id: a.id, type: ((a.type as string) === 'MANUAL' ? 'CREDIT' : a.type) as 'BANK' | 'CREDIT' })),
        rules: rules.filter((r) => r.userId === userId).map((r) => ({ matchField: r.matchField, pattern: r.pattern, merchantId: r.merchantId, categoryId: r.categoryId, kind: r.kind })),
        merchants: merchants.filter((m) => m.userId === userId).map((m) => ({ id: m.id, categoryId: m.categoryId })),
        categories: categories.filter((c) => c.userId === userId).map((c) => ({ id: c.id, name: c.name })),
        ownerCpf: profiles.get(userId)?.cpf ?? null,
        ownerDocs: profiles.get(userId)?.ownerDocs ?? [],
        ownerNames: profiles.get(userId)?.ownerNames ?? [],
      }
    },
    async applyClassification(userId, changes) {
      calls.applyClassification.push(structuredClone(changes))
      const auto = (id: string) => {
        const t = txById(id)
        return t && t.userId === userId && t.classifiedBy === 'auto' ? t : undefined
      }
      for (const id of changes.unlinked) {
        const t = auto(id)
        if (t) t.linkedTransactionId = null
      }
      for (const l of changes.links) {
        const t = auto(l.id)
        if (t) t.linkedTransactionId = l.linkedId
      }
      for (const d of changes.decisions) {
        const t = auto(d.id)
        if (t) Object.assign(t, { kind: d.kind, categoryId: d.categoryId, merchantId: d.merchantId })
      }
    },
    async loadShortcutMerge(userId, from, to) {
      const live = [...transactions.values()].filter((t) => t.userId === userId && !t.deletedAt)
      const shortcuts = live.filter((t) => (t.source as string) === 'shortcut' && !t.linkedTransactionId && t.date >= from && t.date <= to)
      const credit = new Set([...accounts.values()].filter((a) => a.userId === userId && a.type === 'CREDIT').map((a) => a.id))
      const candidates = live.filter(
        (t) => t.source === 'pluggy' && credit.has(t.accountId) && shortcuts.some((s) => s.amountCents === t.amountCents && dayDiff(s.date, t.date) <= 1),
      )
      const taken = [...transactions.values()]
        .filter((t) => t.userId === userId && (t.source as string) === 'shortcut' && t.linkedTransactionId)
        .map((t) => t.linkedTransactionId as string)
      return {
        shortcuts: shortcuts.map((t) => ({
          id: t.id, date: t.date, amountCents: t.amountCents, merchantId: t.merchantId, categoryId: t.categoryId, kind: t.kind ?? null, classifiedBy: t.classifiedBy,
        })),
        candidates: candidates.map((t) => ({ id: t.id, date: t.date, amountCents: t.amountCents })),
        taken,
      }
    },
    async applyShortcutMerges(userId, matches) {
      for (const { shortcut: s, pluggyId } of matches) {
        const p = txById(pluggyId)
        if (p && p.userId === userId && p.classifiedBy === 'auto') {
          Object.assign(p, { merchantId: s.merchantId, categoryId: s.categoryId })
          if (s.classifiedBy === 'user') Object.assign(p, { kind: s.kind, classifiedBy: 'user' })
        }
        const sc = txById(s.id)
        if (sc && sc.userId === userId && (sc.source as string) === 'shortcut') Object.assign(sc, { deletedAt: new Date().toISOString(), linkedTransactionId: pluggyId })
      }
    },
    insertShortcut(r) {
      const id = newId()
      transactions.set(`shortcut:${id}`, {
        ...r,
        id,
        externalId: null as unknown as string,
        source: 'shortcut' as unknown as 'pluggy',
        occurredAt: null, pluggyCategory: null, counterpartyName: null, counterpartyDoc: null, paymentMethod: null,
        installmentNumber: null, installmentTotal: null, cardLast4: null, status: null, raw: null as unknown as StoredTransaction['raw'],
        deletedAt: null, kind: null, classifiedBy: 'auto', categoryId: null, merchantId: null, linkedTransactionId: null,
      })
      return id
    },
    seed(s) {
      categories.push(...(s.categories ?? []))
      merchants.push(...(s.merchants ?? []))
      rules.push(...(s.rules ?? []))
      for (const [u, cpf] of Object.entries(s.profileCpf ?? {})) profiles.set(u, { cpf, ownerDocs: [], ownerNames: [] })
    },
    patch(id, p) {
      const t = txById(id)
      if (!t) throw new Error(`transação ${id} não existe`)
      Object.assign(t, p)
    },
    calls,
    dump: () => ({
      profiles,
      boxes: [...boxes.values()],
      boxSnapshots: [...boxSnapshots.values()],
      connections: [...connections.values()],
      accounts: [...accounts.values()],
      transactions: [...transactions.values()],
      snapshots: [...snapshots.values()],
    }),
  }
}
