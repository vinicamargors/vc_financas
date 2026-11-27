'use server'

import { headers } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string }

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) return { status: 'error', message: 'Informe seu e-mail.' }

  const h = await headers()
  const origin = process.env.APP_URL ?? h.get('origin') ?? `https://${h.get('host')}`

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })
  if (error) return { status: 'error', message: error.message }
  return { status: 'sent' }
}
