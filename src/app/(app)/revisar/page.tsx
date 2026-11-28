import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { minusDays, reclassifyAll } from '@/lib/sync/classification'
import { createSupabaseSyncRepo } from '@/lib/sync/repo'
import { toLocalDate } from '@/lib/format/date'
import { safeErrorMessage } from '@/lib/sync/safe-error'
import { loadReview } from '@/lib/queries/review'
import { ReviewView } from './review-view'

export const dynamic = 'force-dynamic'

export default async function RevisarPage() {
  const user = await requireUser()
  // Lançamentos ainda sem tipo (ex.: logo após atualizar o app) são classificados antes de montar a revisão.
  const db = await createServerSupabase()
  const today = toLocalDate(new Date())
  const { count } = await db
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .is('kind', null)
    .is('deleted_at', null)
    .gte('date', minusDays(today, 89))
  if ((count ?? 0) > 0) {
    try {
      await reclassifyAll({ repo: createSupabaseSyncRepo(db), today }, user.id)
    } catch (e) {
      console.error(`classificar ao abrir revisão falhou: ${safeErrorMessage(e)}`)
    }
  }
  const data = await loadReview()
  return (
    <main>
      <h1 className="title">Revisar</h1>
      <ReviewView {...data} />
    </main>
  )
}
