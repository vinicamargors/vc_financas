import { requireUser } from '@/lib/supabase/server'
import { loadReview } from '@/lib/queries/review'
import { ReviewView } from './review-view'

export const dynamic = 'force-dynamic'

export default async function RevisarPage() {
  await requireUser()
  const data = await loadReview()
  return (
    <main>
      <h1 className="title">Revisar</h1>
      <ReviewView {...data} />
    </main>
  )
}
