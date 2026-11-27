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
  if (error) return { status: 'error', message: translateAuthError(error) }
  return { status: 'sent' }
}

const INVITE_MESSAGE = 'Este e-mail não foi convidado.'

function translateAuthError(error: { message: string; status?: number; code?: string }): string {
  if (error.message === INVITE_MESSAGE) return INVITE_MESSAGE
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    return 'Muitas tentativas. Aguarde um minuto.'
  }
  if (error.code === 'validation_failed' || error.code === 'email_address_invalid') return 'E-mail inválido.'
  return 'Não foi possível enviar o link. Tente de novo.'
}
