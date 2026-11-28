'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isCategoryKey, parseCategoryForm } from '@/lib/categories/form'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const PAGE = '/config/categorias'

/** Cria (sem `id`) ou renomeia e muda o limite (com `id`) de uma categoria. */
export async function saveCategoryAction(form: FormData): Promise<void> {
  const user = await requireUser()
  const parsed = parseCategoryForm((k) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  })
  const id = String(form.get('id') ?? '')
  if (id && (id === 'sem' || !isCategoryKey(id))) redirect(`${PAGE}?erro=falha`)
  if (!parsed.ok) redirect(`${PAGE}?erro=${parsed.error}`)

  const db = await createServerSupabase()
  const row = { name: parsed.value.name, monthly_limit_cents: parsed.value.monthlyLimitCents }
  const { error } = id
    ? await db.from('categories').update(row).eq('user_id', user.id).eq('id', id)
    : await db.from('categories').insert({ user_id: user.id, ...row })
  if (error) {
    if (error.code === '23505') redirect(`${PAGE}?erro=duplicada`)
    console.error(`salvar categoria falhou: ${safeErrorMessage(error)}`)
    redirect(`${PAGE}?erro=falha`)
  }
  revalidatePath('/gastos')
  revalidatePath(PAGE)
  redirect(`${PAGE}?salvo=1`)
}
