'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseVrForm } from '@/lib/benefit/benefit'
import { toLocalDate } from '@/lib/format/date'
import { VR_ACCOUNT_EXTERNAL_ID } from '@/lib/queries/benefit'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/config/vr'

/** Cria ou atualiza a conta VR do usuário (uma por usuário, fora da Pluggy). */
export async function saveVrAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = parseVrForm((k) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  })
  if (!parsed.ok) redirect(`${PAGE}?erro=${parsed.error}`)
  const v = parsed.value
  const db = await createServerSupabase()
  const existing = await db.from('accounts').select('id').eq('user_id', user.id).eq('external_id', VR_ACCOUNT_EXTERNAL_ID).maybeSingle()
  let error = existing.error
  if (!error) {
    const fields = { name: v.name, institution: v.name, benefit_monthly_cents: v.monthlyCents, benefit_day: v.day }
    ;({ error } = existing.data
      ? await db.from('accounts').update(fields).eq('user_id', user.id).eq('id', existing.data.id as string)
      : await db.from('accounts').insert({
          user_id: user.id,
          connection_id: null,
          external_id: VR_ACCOUNT_EXTERNAL_ID,
          type: 'BENEFIT',
          balance_cents: 0,
          benefit_since: toLocalDate(new Date()),
          ...fields,
        }))
  }
  if (error) {
    console.error(`salvar VR falhou: ${safeErrorMessage(error)}`)
    redirect(`${PAGE}?erro=falha`)
  }
  revalidatePath('/')
  revalidatePath(PAGE)
  redirect(`${PAGE}?salvo=1`)
}
