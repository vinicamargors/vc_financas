'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { DateRule } from '@/lib/cycle/businessDays'
import { toLocalDate } from '@/lib/format/date'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { reclassifyAll } from '@/lib/sync/classification'
import { createSupabaseSyncRepo } from '@/lib/sync/repo'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/config/salario'
const RULES: readonly DateRule[] = ['penultimate_business_day', 'last_business_day', 'fifth_business_day', 'fixed_day']

/** Reconhece de novo as entradas dos últimos 90 dias; falha aqui não desfaz o que foi salvo. */
async function reclassify(db: Awaited<ReturnType<typeof createServerSupabase>>, userId: string) {
  try {
    await reclassifyAll({ repo: createSupabaseSyncRepo(db), today: toLocalDate(new Date()) }, userId)
  } catch (e) {
    console.error(`reclassificar após mudar salário falhou: ${safeErrorMessage(e)}`)
  }
}

export async function addSalarySourceAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const payerDoc = String(form.get('payerDoc') ?? '').replace(/\D/g, '') || null
  const payerName = String(form.get('payerName') ?? '').trim() || null
  const dateRule = String(form.get('dateRule') ?? '') as DateRule
  const fixedDay = Number(form.get('fixedDay'))
  if ((!payerDoc && !payerName) || !RULES.includes(dateRule)) redirect(`${PAGE}?erro=dados`)
  if (dateRule === 'fixed_day' && !(Number.isInteger(fixedDay) && fixedDay >= 1 && fixedDay <= 31)) redirect(`${PAGE}?erro=dia`)

  const db = await createServerSupabase()
  const { error } = await db.from('income_sources').insert({
    user_id: user.id,
    kind: 'salary',
    payer_doc: payerDoc,
    payer_name: payerName,
    date_rule: dateRule,
    fixed_day: dateRule === 'fixed_day' ? fixedDay : null,
  })
  if (error) {
    console.error(`salvar fonte de renda falhou: ${safeErrorMessage(error)}`)
    redirect(`${PAGE}?erro=falha`)
  }
  await reclassify(db, user.id)
  revalidatePath('/')
  revalidatePath(PAGE)
  redirect(`${PAGE}?salvo=1`)
}

export async function removeSourceAction(sourceId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser()
  const db = await createServerSupabase()
  const { error } = await db.from('income_sources').delete().eq('user_id', user.id).eq('id', sourceId)
  if (error) {
    console.error(`remover fonte de renda falhou: ${safeErrorMessage(error)}`)
    return { ok: false, message: 'Não foi possível remover. Tente de novo.' }
  }
  await reclassify(db, user.id)
  revalidatePath('/')
  revalidatePath(PAGE)
  return { ok: true }
}
