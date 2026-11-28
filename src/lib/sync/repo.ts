import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClassifyTx, Kind, Rule } from '@/lib/classify/classify'
import type { AccountRow, SavingsBoxRow, TransactionRow } from '@/lib/pluggy/map'

/** Espelha as colunas de `connections` (camelCase). */
export interface ConnectionRow {
  id: string
  userId: string
  pluggyItemId: string
  connectorName: string
  /** Logo oficial do banco (Pluggy `connector.imageUrl`). */
  connectorImageUrl?: string | null
  status: string
  statusDetail: string | null
  consentExpiresAt: string | null
  lastSyncedAt: string | null
  createdAt: string
}

/** Lançamento como o classificador vê, mais a categoria/merchant gravados (para comparar). */
export type StoredClassifyTx = ClassifyTx & { categoryId: string | null; merchantId: string | null }

export interface ClassificationData {
  /** Janela `[from, to]` em todas as contas, mais os pares de linhas ligadas (mesmo fora da janela). */
  transactions: StoredClassifyTx[]
  accounts: { id: string; type: 'BANK' | 'CREDIT' }[]
  rules: Rule[]
  merchants: { id: string; categoryId: string | null }[]
  categories: { id: string; name: string }[]
  ownerCpf: string | null
}

export interface ClassificationPatch {
  id: string
  kind: Kind
  categoryId: string | null
  merchantId: string | null
}

export interface ClassificationChanges {
  /** Zerar `linked_transaction_id` (aplicado antes de `links`). */
  unlinked: string[]
  links: { id: string; linkedId: string }[]
  decisions: ClassificationPatch[]
}

export type ConnectionInput = Omit<ConnectionRow, 'id' | 'createdAt'>

export interface SyncRepo {
  getConnection(userId: string, itemId: string): Promise<ConnectionRow | null>
  upsertConnection(row: ConnectionInput): Promise<ConnectionRow>
  upsertAccounts(rows: AccountRow[]): Promise<{ id: string; externalId: string; type: string }[]>
  upsertTransactions(rows: TransactionRow[]): Promise<number>
  markTransactionsDeleted(userId: string, externalIds: string[]): Promise<void>
  /** Conflito em `user_id,account_id,date`: sincronizar de novo no mesmo dia sobrescreve. */
  upsertBalanceSnapshot(userId: string, accountId: string, date: string, balanceCents: number): Promise<void>
  /** Conflito em `user_id,external_id`. Caixinhas que somem da Pluggy não são apagadas. */
  upsertSavingsBoxes(rows: SavingsBoxRow[]): Promise<{ id: string; externalId: string }[]>
  /** Conflito em `user_id,box_id,date`: mesmo dia sobrescreve. */
  upsertSavingsBoxSnapshots(userId: string, date: string, rows: { boxId: string; balanceCents: number }[]): Promise<void>
  /** Grava `profiles.cpf` (só dígitos) quando ainda está vazio. */
  saveOwnerCpfIfEmpty(userId: string, cpf: string): Promise<void>
  loadClassificationData(userId: string, from: string, to: string): Promise<ClassificationData>
  /** Aplica na ordem unlinked → links → decisions, só em linhas `classified_by = 'auto'`. */
  applyClassification(userId: string, changes: ClassificationChanges): Promise<void>
}

const CHUNK = 500

/** Listas de uuid vão na URL (`in.(...)`): lotes menores. */
const ID_CHUNK = 100
/** Teto de linhas por resposta do PostgREST (`max_rows`). */
const PAGE = 1000

function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

interface ConnectionDb {
  id: string
  user_id: string
  pluggy_item_id: string
  connector_name: string
  connector_image_url: string | null
  status: string
  status_detail: string | null
  consent_expires_at: string | null
  last_synced_at: string | null
  created_at: string
}

interface TxDb {
  id: string
  account_id: string
  date: string
  amount_cents: number
  description_raw: string
  pluggy_category: string | null
  counterparty_name: string | null
  counterparty_doc: string | null
  payment_method: string | null
  kind: Kind | null
  classified_by: 'auto' | 'user'
  linked_transaction_id: string | null
  category_id: string | null
  merchant_id: string | null
}

const TX_COLUMNS =
  'id, account_id, date, amount_cents, description_raw, pluggy_category, counterparty_name, counterparty_doc, payment_method, kind, classified_by, linked_transaction_id, category_id, merchant_id'

const txFromDb = (r: TxDb): StoredClassifyTx => ({
  id: r.id,
  accountId: r.account_id,
  date: r.date,
  amountCents: Number(r.amount_cents),
  descriptionRaw: r.description_raw,
  pluggyCategory: r.pluggy_category,
  counterpartyName: r.counterparty_name,
  counterpartyDoc: r.counterparty_doc,
  paymentMethod: r.payment_method,
  kind: r.kind,
  classifiedBy: r.classified_by,
  linkedTransactionId: r.linked_transaction_id,
  categoryId: r.category_id,
  merchantId: r.merchant_id,
})

const fromDb = (r: ConnectionDb): ConnectionRow => ({
  id: r.id,
  userId: r.user_id,
  pluggyItemId: r.pluggy_item_id,
  connectorName: r.connector_name,
  connectorImageUrl: r.connector_image_url,
  status: r.status,
  statusDetail: r.status_detail,
  consentExpiresAt: r.consent_expires_at,
  lastSyncedAt: r.last_synced_at,
  createdAt: r.created_at,
})

export function createSupabaseSyncRepo(admin: SupabaseClient): SyncRepo {
  return {
    async getConnection(userId, itemId) {
      const { data, error } = await admin
        .from('connections')
        .select('*')
        .eq('user_id', userId)
        .eq('pluggy_item_id', itemId)
        .maybeSingle()
      if (error) throw error
      return data ? fromDb(data as ConnectionDb) : null
    },

    async upsertConnection(row) {
      const { data, error } = await admin
        .from('connections')
        .upsert(
          {
            user_id: row.userId,
            pluggy_item_id: row.pluggyItemId,
            connector_name: row.connectorName,
            connector_image_url: row.connectorImageUrl ?? null,
            status: row.status,
            status_detail: row.statusDetail,
            consent_expires_at: row.consentExpiresAt,
            last_synced_at: row.lastSyncedAt,
          },
          { onConflict: 'user_id,pluggy_item_id' },
        )
        .select('*')
        .single()
      if (error) throw error
      return fromDb(data as ConnectionDb)
    },

    async upsertAccounts(rows) {
      if (rows.length === 0) return []
      const { data, error } = await admin
        .from('accounts')
        .upsert(
          rows.map((r) => ({
            user_id: r.userId,
            connection_id: r.connectionId,
            external_id: r.externalId,
            type: r.type,
            subtype: r.subtype,
            name: r.name,
            institution: r.institution,
            logo_url: r.logoUrl ?? null,
            balance_cents: r.balanceCents,
            credit_limit_cents: r.creditLimitCents,
            closing_day: r.closingDay,
            due_day: r.dueDay,
          })),
          { onConflict: 'user_id,external_id' },
        )
        .select('id, external_id, type')
      if (error) throw error
      return (data ?? []).map((a) => ({
        id: a.id,
        externalId: a.external_id,
        type: a.type,
      }))
    },

    async upsertTransactions(rows) {
      // O Postgres rejeita a mesma chave duas vezes no mesmo upsert.
      const unique = [...new Map(rows.map((r) => [`${r.userId}:${r.externalId}`, r])).values()]
      for (const part of chunks(unique)) {
        // `deleted_at`, `kind`, `category_id` etc. ficam fora do payload: não são sobrescritos.
        // Exceção: rendimento de caixinha grava `kind` (lote separado, pois colunas ausentes viram null).
        for (const group of [part.filter((r) => !r.kind), part.filter((r) => r.kind)]) {
          if (group.length === 0) continue
          const { error } = await admin.from('transactions').upsert(
            group.map((r) => ({
              user_id: r.userId,
              account_id: r.accountId,
              external_id: r.externalId,
              source: r.source,
              date: r.date,
              occurred_at: r.occurredAt,
              amount_cents: r.amountCents,
              description_raw: r.descriptionRaw,
              pluggy_category: r.pluggyCategory,
              counterparty_name: r.counterpartyName,
              counterparty_doc: r.counterpartyDoc,
              payment_method: r.paymentMethod,
              installment_number: r.installmentNumber,
              installment_total: r.installmentTotal,
              card_last4: r.cardLast4,
              status: r.status,
              ...(r.kind ? { kind: r.kind } : {}),
              raw: r.raw,
            })),
            { onConflict: 'user_id,external_id' },
          )
          if (error) throw error
        }
      }
      return unique.length
    },

    async markTransactionsDeleted(userId, externalIds) {
      for (const part of chunks(externalIds)) {
        const { error } = await admin
          .from('transactions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', userId)
          .in('external_id', part)
        if (error) throw error
      }
    },

    async upsertBalanceSnapshot(userId, accountId, date, balanceCents) {
      const { error } = await admin.from('balance_snapshots').upsert(
        {
          user_id: userId,
          account_id: accountId,
          date,
          balance_cents: balanceCents,
        },
        { onConflict: 'user_id,account_id,date' },
      )
      if (error) throw error
    },

    async upsertSavingsBoxes(rows) {
      if (rows.length === 0) return []
      const unique = [...new Map(rows.map((r) => [`${r.userId}:${r.externalId}`, r])).values()]
      const { data, error } = await admin
        .from('savings_boxes')
        .upsert(
          unique.map((r) => ({
            user_id: r.userId,
            account_id: r.accountId,
            external_id: r.externalId,
            name: r.name,
            balance_cents: r.balanceCents,
            cdi_percent: r.cdiPercent,
          })),
          { onConflict: 'user_id,external_id' },
        )
        .select('id, external_id')
      if (error) throw error
      return (data ?? []).map((b) => ({ id: b.id, externalId: b.external_id }))
    },

    async upsertSavingsBoxSnapshots(userId, date, rows) {
      if (rows.length === 0) return
      const { error } = await admin.from('savings_box_snapshots').upsert(
        rows.map((r) => ({
          user_id: userId,
          box_id: r.boxId,
          date,
          balance_cents: r.balanceCents,
        })),
        { onConflict: 'user_id,box_id,date' },
      )
      if (error) throw error
    },

    async saveOwnerCpfIfEmpty(userId, cpf) {
      const { error } = await admin
        .from('profiles')
        .update({ cpf })
        .eq('user_id', userId)
        .or('cpf.is.null,cpf.eq.')
      if (error) throw error
    },

    async loadClassificationData(userId, from, to) {
      const [accounts, rules, merchants, categories, profile] = await Promise.all([
        admin.from('accounts').select('id, type').eq('user_id', userId),
        admin.from('rules').select('match_field, pattern, merchant_id, category_id, kind').eq('user_id', userId).order('created_at'),
        admin.from('merchants').select('id, category_id').eq('user_id', userId),
        admin.from('categories').select('id, name').eq('user_id', userId),
        admin.from('profiles').select('cpf').eq('user_id', userId).maybeSingle(),
      ])
      for (const r of [accounts, rules, merchants, categories, profile]) if (r.error) throw r.error
      const rows: StoredClassifyTx[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await admin
          .from('transactions')
          .select(TX_COLUMNS)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .gte('date', from)
          .lte('date', to)
          .order('id')
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        rows.push(...((data ?? []) as TxDb[]).map(txFromDb))
        if ((data ?? []).length < PAGE) break
      }
      const have = new Set(rows.map((t) => t.id))
      const missing = [...new Set(rows.map((t) => t.linkedTransactionId).filter((id): id is string => !!id && !have.has(id)))]
      for (const part of chunks(missing, ID_CHUNK)) {
        const { data, error } = await admin.from('transactions').select(TX_COLUMNS).eq('user_id', userId).is('deleted_at', null).in('id', part)
        if (error) throw error
        rows.push(...((data ?? []) as TxDb[]).map(txFromDb))
      }
      return {
        transactions: rows,
        accounts: (accounts.data ?? []).map((a) => ({ id: a.id as string, type: a.type as 'BANK' | 'CREDIT' })),
        rules: (rules.data ?? []).map((r) => ({
          matchField: r.match_field as Rule['matchField'],
          pattern: r.pattern as string,
          merchantId: (r.merchant_id as string | null) ?? null,
          categoryId: (r.category_id as string | null) ?? null,
          kind: (r.kind as Kind | null) ?? null,
        })),
        merchants: (merchants.data ?? []).map((m) => ({ id: m.id as string, categoryId: (m.category_id as string | null) ?? null })),
        categories: (categories.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
        ownerCpf: (profile.data?.cpf as string | null | undefined) ?? null,
      }
    },

    async applyClassification(userId, { unlinked, links, decisions }) {
      // Toda escrita filtra user_id e classified_by = 'auto' (a escolha do usuário nunca é sobrescrita).
      const autoRows = () => admin.from('transactions')
      for (const part of chunks(unlinked, ID_CHUNK)) {
        const { error } = await autoRows()
          .update({ linked_transaction_id: null })
          .eq('user_id', userId)
          .eq('classified_by', 'auto')
          .in('id', part)
        if (error) throw error
      }
      // Ligações são poucas (pares) e cada uma tem valor próprio.
      for (const l of links) {
        const { error } = await autoRows()
          .update({ linked_transaction_id: l.linkedId })
          .eq('user_id', userId)
          .eq('classified_by', 'auto')
          .eq('id', l.id)
        if (error) throw error
      }
      // Decisões agrupadas por valor: um UPDATE por combinação (kind, categoria, merchant).
      const groups = new Map<string, { patch: Omit<ClassificationPatch, 'id'>; ids: string[] }>()
      for (const d of decisions) {
        const key = `${d.kind}|${d.categoryId ?? ''}|${d.merchantId ?? ''}`
        const g = groups.get(key) ?? { patch: { kind: d.kind, categoryId: d.categoryId, merchantId: d.merchantId }, ids: [] }
        g.ids.push(d.id)
        groups.set(key, g)
      }
      for (const { patch, ids } of groups.values()) {
        for (const part of chunks(ids, ID_CHUNK)) {
          const { error } = await autoRows()
            .update({ kind: patch.kind, category_id: patch.categoryId, merchant_id: patch.merchantId })
            .eq('user_id', userId)
            .eq('classified_by', 'auto')
            .in('id', part)
          if (error) throw error
        }
      }
    },
  }
}
