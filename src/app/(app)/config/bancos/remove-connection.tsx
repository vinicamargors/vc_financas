'use client'

import { useState, useTransition } from 'react'
import { removeConnectionAction } from './actions'

/** Botão Remover com confirmação na própria página (sem window.confirm). */
export function RemoveConnection({ connectionId, name }: { connectionId: string; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function remove() {
    setError(null)
    start(async () => {
      const r = await removeConnectionAction(connectionId)
      if (!r.ok) setError(r.message)
    })
  }

  if (!confirming) {
    return (
      <button type="button" className="conn-remove" onClick={() => setConfirming(true)} aria-label={`Remover ${name}`}>
        Remover
      </button>
    )
  }
  return (
    <div className="conn-confirm" role="group" aria-label={`Confirmar remoção de ${name}`}>
      <p>Apaga as contas, os lançamentos e as caixinhas de {name} daqui. No banco nada muda.</p>
      {error && (
        <p role="alert" className="msg err">
          {error}
        </p>
      )}
      <button type="button" className="conn-remove danger" onClick={remove} disabled={pending} aria-busy={pending}>
        {pending ? 'Removendo…' : 'Remover de vez'}
      </button>
      <button type="button" className="conn-remove" onClick={() => setConfirming(false)} disabled={pending}>
        Cancelar
      </button>
    </div>
  )
}
