import type { SupabaseClient } from '@supabase/supabase-js'
import type { Kind } from '@/lib/classify/classify'
import type { SameEntryStore } from './resolve'

/** Store da Revisar com o cliente do usuário (RLS) e filtro explícito por `user_id`. */
export function createSupabaseSameEntryStore(db: SupabaseClient): SameEntryStore {
  return {
    async getPendingManual(userId, id) {
      const { data, error } = await db
        .from('transactions')
        .select('id, reconcile_candidate_id, kind, category_id, merchant_id')
        .eq('user_id', userId)
        .eq('id', id)
        .eq('source', 'manual')
        .eq('reconciled', false)
        .is('deleted_at', null)
        .is('linked_transaction_id', null)
        .maybeSingle()
      if (error) throw error
      return data
        ? {
            id: data.id as string,
            candidateId: (data.reconcile_candidate_id as string | null) ?? null,
            kind: (data.kind as Kind | null) ?? null,
            categoryId: (data.category_id as string | null) ?? null,
            merchantId: (data.merchant_id as string | null) ?? null,
          }
        : null
    },
    async merge(userId, m, candidateId) {
      // Candidato precisa ser lançamento vivo da Pluggy do próprio usuário.
      const { data: cand, error: cErr } = await db
        .from('transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('id', candidateId)
        .eq('source', 'pluggy')
        .is('deleted_at', null)
        .maybeSingle()
      if (cErr) throw cErr
      if (!cand) throw new Error('candidato não encontrado')
      const { data: gone, error: dErr } = await db
        .from('transactions')
        .update({ deleted_at: new Date().toISOString(), linked_transaction_id: candidateId, reconcile_candidate_id: null, reconciled: true })
        .eq('user_id', userId)
        .eq('id', m.id)
        .eq('source', 'manual')
        .is('deleted_at', null)
        .select('id')
      if (dErr) throw dErr
      if ((gone ?? []).length !== 1) return
      const { error } = await db
        .from('transactions')
        .update({ kind: m.kind, category_id: m.categoryId, merchant_id: m.merchantId, classified_by: 'user' })
        .eq('user_id', userId)
        .eq('id', candidateId)
      if (error) throw error
    },
    async markReconciled(userId, id) {
      const { error } = await db
        .from('transactions')
        .update({ reconciled: true, reconcile_candidate_id: null })
        .eq('user_id', userId)
        .eq('id', id)
        .eq('source', 'manual')
      if (error) throw error
    },
  }
}
