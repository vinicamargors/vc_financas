'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseGoalForm } from '@/lib/invest/forms'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/metas'

function revalidateAll() {
  revalidatePath('/')
  revalidatePath(PAGE, 'layout')
}

/** Cria (sem `id`) ou edita (com `id`) uma meta e troca as caixinhas dela. */
export async function saveGoalAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(form.get('id') ?? '')
  const back = id ? `${PAGE}/${encodeURIComponent(id)}` : PAGE
  const parsed = parseGoalForm(
    (k) => {
      const v = form.get(k)
      return typeof v === 'string' ? v : null
    },
    form.getAll('box').filter((v): v is string => typeof v === 'string'),
  )
  if (!parsed.ok) redirect(`${back}?erro=${parsed.error}`)
  const g = parsed.value
  const row = {
    name: g.name,
    target_cents: g.targetCents,
    target_date: g.targetDate,
    planned_min_cents: g.plannedMinCents,
    planned_max_cents: g.plannedMaxCents,
    include_fgts: g.includeFgts,
  }

  const db = await createServerSupabase()
  let goalId = id
  if (id) {
    const { data, error } = await db.from('goals').update(row).eq('user_id', user.id).eq('id', id).select('id')
    if (error || !data?.length) return fail(back, error)
    const del = await db.from('goal_boxes').delete().eq('user_id', user.id).eq('goal_id', id)
    if (del.error) return fail(back, del.error)
  } else {
    const { data, error } = await db.from('goals').insert({ user_id: user.id, ...row }).select('id').single()
    if (error || !data) return fail(back, error)
    goalId = data.id as string
  }
  if (g.boxIds.length > 0) {
    // FK composta (box_id, user_id) recusa caixinha de outro usuário.
    const { error } = await db.from('goal_boxes').insert(g.boxIds.map((box_id) => ({ user_id: user.id, goal_id: goalId, box_id })))
    if (error) return fail(`${PAGE}/${encodeURIComponent(goalId)}`, error)
  }
  revalidateAll()
  redirect(`${PAGE}/${encodeURIComponent(goalId)}?salvo=1`)
}

export async function deleteGoalAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(form.get('id') ?? '')
  const db = await createServerSupabase()
  const { error } = await db.from('goals').delete().eq('user_id', user.id).eq('id', id)
  if (error) return fail(`${PAGE}/${encodeURIComponent(id)}`, error)
  revalidateAll()
  redirect(`${PAGE}?removida=1`)
}

function fail(back: string, error: unknown): never {
  if (error) console.error(`salvar meta falhou: ${safeErrorMessage(error)}`)
  redirect(`${back}?erro=falha`)
}
