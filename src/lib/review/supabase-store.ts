import type { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDate } from '@/lib/format/date'
import { reclassifyAll } from '@/lib/sync/classification'
import { createSupabaseSyncRepo } from '@/lib/sync/repo'
import type { ReviewStore } from './review'

/** Escapa curingas do `ilike` para comparar o nome exato sem diferenciar maiúsculas. */
const ilikeExact = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Revisão com o cliente do usuário (RLS); toda consulta também filtra `user_id`. */
export function createSupabaseReviewStore(db: SupabaseClient): ReviewStore {
  return {
    async getTransaction(userId, id) {
      const { data, error } = await db
        .from('transactions')
        .select('id, description_raw, linked_transaction_id')
        .eq('user_id', userId)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw new Error(`ler lançamento: ${error.message}`)
      return data ? { id: data.id, descriptionRaw: data.description_raw, linkedTransactionId: data.linked_transaction_id } : null
    },
    async patchTransactions(userId, ids, patch, opts) {
      const row: Record<string, unknown> = { kind: patch.kind, classified_by: patch.classifiedBy }
      if (patch.categoryId !== undefined) row.category_id = patch.categoryId
      if (patch.merchantId !== undefined) row.merchant_id = patch.merchantId
      if (patch.linkedTransactionId !== undefined) row.linked_transaction_id = patch.linkedTransactionId
      let q = db.from('transactions').update(row).eq('user_id', userId).in('id', ids)
      if (opts?.onlyAutoExpense) q = q.eq('kind', 'expense').eq('classified_by', 'auto')
      const { data, error } = await q.select('id')
      if (error) throw new Error(`atualizar lançamentos: ${error.message}`)
      return data?.length ?? 0
    },
    async findOrCreateMerchant(userId, displayName, categoryId) {
      const found = await db
        .from('merchants')
        .select('id')
        .eq('user_id', userId)
        .ilike('display_name', ilikeExact(displayName))
        .limit(1)
        .maybeSingle()
      if (found.error) throw new Error(`buscar estabelecimento: ${found.error.message}`)
      if (found.data) {
        const { error } = await db.from('merchants').update({ category_id: categoryId }).eq('user_id', userId).eq('id', found.data.id)
        if (error) throw new Error(`atualizar estabelecimento: ${error.message}`)
        return found.data.id as string
      }
      const { data, error } = await db
        .from('merchants')
        .insert({ user_id: userId, display_name: displayName, category_id: categoryId })
        .select('id')
        .single()
      if (error || !data) throw new Error(`criar estabelecimento: ${error?.message ?? 'sem id'}`)
      return data.id as string
    },
    async upsertRule(userId, r) {
      const { error } = await db.from('rules').upsert(
        { user_id: userId, match_field: r.matchField, pattern: r.pattern, merchant_id: r.merchantId, category_id: r.categoryId, kind: r.kind },
        { onConflict: 'user_id,match_field,pattern' },
      )
      if (error) throw new Error(`gravar regra: ${error.message}`)
    },
    async reclassify(userId) {
      await reclassifyAll({ repo: createSupabaseSyncRepo(db), today: toLocalDate(new Date()) }, userId)
    },
  }
}
