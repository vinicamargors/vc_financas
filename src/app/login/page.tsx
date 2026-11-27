'use client'

import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { sendMagicLink, type LoginState } from './actions'

const initial: LoginState = { status: 'idle' }

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const linkExpired = useSearchParams().get('erro') === 'link'
  const [state, action, pending] = useActionState(sendMagicLink, initial)

  return (
    <main className="login">
      <div className="mark" aria-hidden="true">
        vc
      </div>
      <h1>
        Seu dinheiro,
        <br />
        sem planilha.
      </h1>
      <p>Entre com o e-mail que recebeu o convite.</p>
      {state.status === 'sent' ? (
        <p role="status" className="msg ok login-sent">
          Enviamos um link para seu e-mail.
        </p>
      ) : (
        <form action={action}>
          <label htmlFor="email" className="sr-only">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="seu@email.com"
            className="underline-input"
          />
          <button type="submit" disabled={pending} className="btn">
            {pending ? 'Enviando…' : 'Enviar link de acesso'}
          </button>
          {linkExpired && state.status !== 'error' && (
            <p role="alert" className="msg err">
              Link expirado ou já usado. Peça um novo.
            </p>
          )}
          {state.status === 'error' && (
            <p role="alert" className="msg err">
              {state.message}
            </p>
          )}
        </form>
      )}
    </main>
  )
}
