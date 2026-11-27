'use server'

import { createServerSupabase, requireUser } from '@/lib/supabase/server'

export async function setHideValuesAction(hidden: boolean): Promise<void> {
  if (typeof hidden !== 'boolean') throw new Error('valor inválido')
  const user = await requireUser()
  const supabase = await createServerSupabase()
  // RLS garante que só a própria linha é alterada; upsert cobre perfil ainda inexistente.
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: user.id, hide_values: hidden }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}
