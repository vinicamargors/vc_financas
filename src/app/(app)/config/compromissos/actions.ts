'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { moveCommitment, parseCommitmentForm } from '@/lib/commitments/form'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/config/compromissos'

function revalidateAll() {
  revalidatePath('/')
  revalidatePath('/pagamento')
  revalidatePath(PAGE)
}

function toDb(v: ReturnType<typeof parseCommitmentForm> & { ok: true }) {
  const c = v.value
  return {
    name: c.name,
    kind: c.kind,
    amount_cents: c.amountCents,
    percent: c.percent,
    percent_base: c.percentBase,
    category_id: c.categoryId,
    match_counterparty: c.matchCounterparty,
  }
}

/** Cria (sem `id`) ou edita (com `id`) um compromisso. */
export async function saveCommitmentAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = parseCommitmentForm((k) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  })
  const id = String(form.get('id') ?? '')
  if (!parsed.ok) redirect(`${PAGE}?erro=${parsed.error}${id ? `&editar=${encodeURIComponent(id)}` : ''}`)

  const db = await createServerSupabase()
  let error
  if (id) {
    ;({ error } = await db.from('commitments').update(toDb(parsed)).eq('user_id', user.id).eq('id', id))
  } else {
    const last = await db.from('commitments').select('sort').eq('user_id', user.id).order('sort', { ascending: false }).limit(1)
    const sort = last.data?.[0] ? Number(last.data[0].sort) + 1 : 0
    ;({ error } = await db.from('commitments').insert({ user_id: user.id, ...toDb(parsed), sort }))
  }
  if (error) {
    console.error(`salvar compromisso falhou: ${safeErrorMessage(error)}`)
    redirect(`${PAGE}?erro=falha`)
  }
  revalidateAll()
  redirect(`${PAGE}?salvo=1`)
}

type Result = { ok: true } | { ok: false; message: string }

export async function setCommitmentActiveAction(id: string, active: boolean): Promise<Result> {
  const user = await requireUser()
  const db = await createServerSupabase()
  const { error } = await db.from('commitments').update({ active }).eq('user_id', user.id).eq('id', id)
  if (error) {
    console.error(`mudar compromisso falhou: ${safeErrorMessage(error)}`)
    return { ok: false, message: 'Não foi possível salvar. Tente de novo.' }
  }
  revalidateAll()
  return { ok: true }
}

export async function moveCommitmentAction(id: string, dir: 'up' | 'down'): Promise<Result> {
  const user = await requireUser()
  const db = await createServerSupabase()
  const { data, error } = await db
    .from('commitments')
    .select('id')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('sort')
    .order('created_at')
  if (error) {
    console.error(`ler compromissos falhou: ${safeErrorMessage(error)}`)
    return { ok: false, message: 'Não foi possível mover. Tente de novo.' }
  }
  const order = moveCommitment((data ?? []) as { id: string }[], id, dir)
  if (!order) return { ok: true }
  const results = await Promise.all(order.map((o) => db.from('commitments').update({ sort: o.sort }).eq('user_id', user.id).eq('id', o.id)))
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    console.error(`mover compromisso falhou: ${safeErrorMessage(failed.error)}`)
    return { ok: false, message: 'Não foi possível mover. Tente de novo.' }
  }
  revalidateAll()
  return { ok: true }
}
