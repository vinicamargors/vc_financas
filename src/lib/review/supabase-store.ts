import type { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDate } from '@/lib/format/date'
import { reclassifyAll } from '@/lib/sync/classification'
import { createSupabaseSyncRepo } from '@/lib/sync/repo'
import type { ReviewStore } from './review'

/** Escritas da revisão com o cliente do usuário (RLS); toda consulta também filtra `user_id`. */
export function createSupabaseReviewStore(db: SupabaseClient): ReviewStore {
  return {
    async updateTransactions(userId, ids, patch) {
      const row: Record<string, unknown> = { kind: patch.kind, category_id: patch.categoryId, classified_by: 'user' }
      if (patch.merchantId !== undefined) row.merchant_id = patch.merchantId
      const { error } = await db.from('transactions').update(row).eq('user_id', userId).in('id', ids)
      if (error) throw new Error(`atualizar lançamentos: ${error.message}`)
    },
    async createMerchant(userId, displayName, categoryId) {
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
