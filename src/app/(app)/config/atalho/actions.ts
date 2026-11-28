'use server'

import { redirect } from 'next/navigation'
import { generateToken } from '@/lib/shortcut/token'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

/** Gera (ou troca) o token. Só o hash fica no banco; o token volta uma única vez. */
export async function generateTokenAction(): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const user = await requireUser()
  const { token, hash } = generateToken()
  const { error } = await createAdminSupabase()
    .from('shortcut_tokens')
    .upsert({ user_id: user.id, token_hash: hash, created_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) {
    console.error(`gerar token do atalho falhou: ${safeErrorMessage(error)}`)
    return { ok: false, message: 'Não foi possível gerar o token. Tente de novo.' }
  }
  return { ok: true, token }
}

export async function revokeTokenAction(): Promise<void> {
  const user = await requireUser()
  const { error } = await createAdminSupabase().from('shortcut_tokens').delete().eq('user_id', user.id)
  if (error) console.error(`revogar token do atalho falhou: ${safeErrorMessage(error)}`)
  redirect(`/config/atalho?${error ? 'erro=1' : 'revogado=1'}`)
}
