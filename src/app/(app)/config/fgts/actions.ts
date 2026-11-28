'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { toLocalDate } from '@/lib/format/date'
import { parseFgtsForm } from '@/lib/invest/forms'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/config/fgts'

export async function saveFgtsAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = parseFgtsForm((k) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  }, toLocalDate(new Date()))
  if (!parsed.ok) redirect(`${PAGE}?erro=${parsed.error}`)
  const f = parsed.value
  const db = await createServerSupabase()
  // Uma linha por usuário (PK user_id); RLS garante a posse.
  const { error } = await db.from('fgts').upsert(
    {
      user_id: user.id,
      balance_cents: f.balanceCents,
      balance_date: f.balanceDate,
      gross_salary_cents: f.grossSalaryCents,
      reference_net_cents: f.referenceNetCents,
    },
    { onConflict: 'user_id' },
  )
  if (error) {
    console.error(`salvar FGTS falhou: ${safeErrorMessage(error)}`)
    redirect(`${PAGE}?erro=falha`)
  }
  revalidatePath('/')
  revalidatePath('/metas', 'layout')
  revalidatePath(PAGE)
  redirect(`${PAGE}?salvo=1`)
}
