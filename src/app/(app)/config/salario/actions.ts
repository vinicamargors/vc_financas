'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseSourceForm } from '@/lib/cycle/source-form'
import { toLocalDate } from '@/lib/format/date'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { reclassifyAll } from '@/lib/sync/classification'
import { createSupabaseSyncRepo } from '@/lib/sync/repo'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/config/salario'

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
  const parsed = parseSourceForm(form)
  if (!parsed.ok) redirect(`${PAGE}?erro=${parsed.error}`)
  const { kind, payerDoc, payerName, dateRule, fixedDay } = parsed.value

  const db = await createServerSupabase()
  const { error } = await db.from('income_sources').insert({
    user_id: user.id,
    kind,
    payer_doc: payerDoc,
    payer_name: payerName,
    date_rule: dateRule,
    fixed_day: fixedDay,
  })
  if (error) {
    console.error(`salvar fonte de renda falhou: ${safeErrorMessage(error)}`)
    redirect(`${PAGE}?erro=falha`)
  }
  await reclassify(db, user.id)
  revalidatePath('/')
  revalidatePath('/pagamento')
  revalidatePath(PAGE)
  redirect(`${PAGE}?salvo=${kind === 'extra' ? 'extra' : '1'}`)
}

/** Troca uma fonte salva entre salário e renda extra (corrige o que foi marcado errado). */
export async function switchSourceKindAction(sourceId: string, kind: 'salary' | 'extra'): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser()
  if (kind !== 'salary' && kind !== 'extra') return { ok: false, message: 'Tipo inválido.' }
  const db = await createServerSupabase()
  const { error } = await db.from('income_sources').update({ kind }).eq('user_id', user.id).eq('id', sourceId)
  if (error) {
    console.error(`trocar tipo da fonte de renda falhou: ${safeErrorMessage(error)}`)
    return { ok: false, message: 'Não foi possível trocar. Tente de novo.' }
  }
  await reclassify(db, user.id)
  revalidatePath('/')
  revalidatePath('/pagamento')
  revalidatePath(PAGE)
  return { ok: true }
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
