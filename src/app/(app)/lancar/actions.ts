'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseManualForm } from '@/lib/manual/form'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/lancar'
const MANUAL_ACCOUNT_TYPES = ['BANK', 'CREDIT', 'BENEFIT']

/** Lançamento manual: `source='manual'`, `classified_by='user'`. A sincronização confere com a Pluggy depois. */
export async function saveManualAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = parseManualForm((k) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  }, new Date())
  if (!parsed.ok) redirect(`${PAGE}?erro=${parsed.error}`)
  const v = parsed.value
  const db = await createServerSupabase()
  // A conta precisa ser do usuário e de um tipo que recebe lançamento (a FK composta também barra outra conta).
  const acc = await db.from('accounts').select('id').eq('user_id', user.id).eq('id', v.accountId).in('type', MANUAL_ACCOUNT_TYPES).maybeSingle()
  if (acc.error || !acc.data) redirect(`${PAGE}?erro=conta`)
  const { error } = await db.from('transactions').insert({
    user_id: user.id,
    account_id: v.accountId,
    source: 'manual',
    date: v.date,
    occurred_at: v.occurredAt,
    amount_cents: v.amountCents,
    description_raw: v.description,
    kind: v.kind,
    category_id: v.categoryId,
    classified_by: 'user',
  })
  if (error) {
    console.error(`lançamento manual falhou: ${safeErrorMessage(error)}`)
    redirect(`${PAGE}?erro=${error.code === '23503' ? 'categoria' : 'falha'}`)
  }
  for (const p of ['/', '/extrato', '/pagamento']) revalidatePath(p)
  redirect(`${PAGE}?salvo=1`)
}
