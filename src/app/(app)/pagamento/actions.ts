'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

/** Soma (ou tira) uma renda extra do livre. Só entradas do próprio usuário. */
export async function setFreeCountedAction(txId: string, counted: boolean): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser()
  const db = await createServerSupabase()
  const { data, error } = await db
    .from('transactions')
    .update({ free_counted: counted === true })
    .eq('user_id', user.id)
    .eq('id', txId)
    .eq('kind', 'income')
    .select('id')
  if (error || !data?.length) {
    if (error) console.error(`marcar renda extra falhou: ${safeErrorMessage(error)}`)
    return { ok: false, message: 'Não foi possível atualizar. Tente de novo.' }
  }
  revalidatePath('/')
  revalidatePath('/pagamento')
  return { ok: true }
}
