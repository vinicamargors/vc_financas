'use client'

import { useState, useTransition } from 'react'
import { removeSourceAction } from './actions'

export function RemoveSource({ sourceId, name }: { sourceId: string; name: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function remove() {
    setError(null)
    start(async () => {
      const r = await removeSourceAction(sourceId)
      if (!r.ok) setError(r.message)
    })
  }
  return (
    <>
      <button type="button" className="conn-remove" onClick={remove} disabled={pending} aria-busy={pending} aria-label={`Remover ${name}`}>
        {pending ? 'Removendo…' : 'Remover'}
      </button>
      {error && (
        <p role="alert" className="msg err">
          {error}
        </p>
      )}
    </>
  )
}
