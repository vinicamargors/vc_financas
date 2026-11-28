import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSyncRepo, SHORTCUT_ACCOUNT_EXTERNAL_ID } from '@/lib/sync/repo'
import { classifyWindow } from '@/lib/sync/classification'
import type { IngestRepo } from './ingest'

/** Service role: toda consulta filtra pelo `userId` do dono do token. */
export function createSupabaseIngestRepo(admin: SupabaseClient): IngestRepo {
  return {
    async findUserByTokenHash(hash) {
      const { data, error } = await admin.from('shortcut_tokens').select('user_id').eq('token_hash', hash).maybeSingle()
      if (error) throw error
      return (data?.user_id as string | undefined) ?? null
    },
    async countShortcutsSince(userId, sinceIso) {
      const { count, error } = await admin
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('source', 'shortcut')
        .gte('occurred_at', sinceIso)
      if (error) throw error
      return count ?? 0
    },
    async listCreditAccounts(userId) {
      const { data, error } = await admin.from('accounts').select('id, name, institution').eq('user_id', userId).eq('type', 'CREDIT')
      if (error) throw error
      return (data ?? []).map((a) => ({ id: a.id as string, name: (a.name as string) ?? '', institution: (a.institution as string) ?? '' }))
    },
    async ensureManualAccount(userId) {
      const find = () =>
        admin.from('accounts').select('id').eq('user_id', userId).eq('external_id', SHORTCUT_ACCOUNT_EXTERNAL_ID).maybeSingle()
      const found = await find()
      if (found.error) throw found.error
      if (found.data) return found.data.id as string
      // Corrida entre duas chamadas: o conflito é ignorado e a linha existente é lida de novo.
      const { error } = await admin
        .from('accounts')
        .upsert(
          { user_id: userId, connection_id: null, external_id: SHORTCUT_ACCOUNT_EXTERNAL_ID, type: 'MANUAL', name: 'Atalho', institution: 'Atalho' },
          { onConflict: 'user_id,external_id', ignoreDuplicates: true },
        )
      if (error) throw error
      const again = await find()
      if (again.error || !again.data) throw again.error ?? new Error('conta Atalho não criada')
      return again.data.id as string
    },
    async insertTransaction(r) {
      const { error } = await admin.from('transactions').insert({
        user_id: r.userId,
        account_id: r.accountId,
        external_id: null,
        source: 'shortcut',
        date: r.date,
        occurred_at: r.occurredAt,
        amount_cents: r.amountCents,
        description_raw: r.descriptionRaw,
      })
      if (error) throw error
    },
    async classify(userId, date) {
      await classifyWindow(createSupabaseSyncRepo(admin), userId, { from: date, to: date })
    },
  }
}
