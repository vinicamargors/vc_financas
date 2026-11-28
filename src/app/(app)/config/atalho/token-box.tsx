'use client'

import { useState, useTransition } from 'react'
import { generateTokenAction } from './actions'

export function TokenBox({ hasToken }: { hasToken: boolean }) {
  const [pending, startTransition] = useTransition()
  const [token, setToken] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = () =>
    startTransition(async () => {
      setMessage(null)
      setCopied(false)
      const r = await generateTokenAction()
      if (r.ok) setToken(r.token)
      else setMessage(r.message)
    })

  const copy = async () => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
    } catch {
      setMessage('Não deu para copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <div>
      {message && (
        <p role="alert" className="msg err">
          {message}
        </p>
      )}
      {token ? (
        <>
          <p role="status" className="msg ok">
            Copie agora: o token não aparece de novo.
          </p>
          <label className="field">
            <small>Token</small>
            <input readOnly value={token} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'Copiado' : 'Copiar token'}
          </button>
        </>
      ) : (
        <>
          {hasToken && <p>Já existe um token ativo. Gerar outro invalida o anterior.</p>}
          <button type="button" className="btn" onClick={generate} disabled={pending}>
            {pending ? 'Gerando…' : hasToken ? 'Gerar novo token' : 'Gerar token'}
          </button>
        </>
      )}
    </div>
  )
}
