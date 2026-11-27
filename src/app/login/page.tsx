'use client'

import { useActionState } from 'react'
import { sendMagicLink, type LoginState } from './actions'

const initial: LoginState = { status: 'idle' }

export default function LoginPage() {
  const [state, action, pending] = useActionState(sendMagicLink, initial)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Entrar</h1>
      {state.status === 'sent' ? (
        <p role="status">Enviamos um link para seu e-mail.</p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-lg border border-black/20 bg-transparent px-3 py-2 text-base"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black"
          >
            {pending ? 'Enviando…' : 'Enviar link'}
          </button>
          {state.status === 'error' && (
            <p role="alert" className="text-sm text-red-600">
              {state.message}
            </p>
          )}
        </form>
      )}
    </main>
  )
}
