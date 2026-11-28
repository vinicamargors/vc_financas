import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountRow, TransactionRow } from '@/lib/pluggy/map'

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

export type ConnectionInput = Omit<ConnectionRow, 'id' | 'createdAt'>

export interface SyncRepo {
  getConnection(userId: string, itemId: string): Promise<ConnectionRow | null>
  upsertConnection(row: ConnectionInput): Promise<ConnectionRow>
  upsertAccounts(rows: AccountRow[]): Promise<{ id: string; externalId: string; type: string }[]>
  upsertTransactions(rows: TransactionRow[]): Promise<number>
  markTransactionsDeleted(userId: string, externalIds: string[]): Promise<void>
  /** Conflito em `user_id,account_id,date`: sincronizar de novo no mesmo dia sobrescreve. */
  upsertBalanceSnapshot(userId: string, accountId: string, date: string, balanceCents: number): Promise<void>
}

const CHUNK = 500

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK))
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
      return (data ?? []).map((a) => ({ id: a.id, externalId: a.external_id, type: a.type }))
    },

    async upsertTransactions(rows) {
      // O Postgres rejeita a mesma chave duas vezes no mesmo upsert.
      const unique = [...new Map(rows.map((r) => [`${r.userId}:${r.externalId}`, r])).values()]
      for (const part of chunks(unique)) {
        // `deleted_at`, `kind`, `category_id` etc. ficam fora do payload: não são sobrescritos.
        const { error } = await admin.from('transactions').upsert(
          part.map((r) => ({
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
            raw: r.raw,
          })),
          { onConflict: 'user_id,external_id' },
        )
        if (error) throw error
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
        { user_id: userId, account_id: accountId, date, balance_cents: balanceCents },
        { onConflict: 'user_id,account_id,date' },
      )
      if (error) throw error
    },
  }
}
