'use client'

import { useState, useTransition } from 'react'
import { switchSourceKindAction } from './actions'

export function SwitchKind({ sourceId, kind }: { sourceId: string; kind: 'salary' | 'extra' }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const target = kind === 'salary' ? 'extra' : 'salary'
  function change() {
    setError(null)
    start(async () => {
      const r = await switchSourceKindAction(sourceId, target)
      if (!r.ok) setError(r.message)
    })
  }
  return (
    <>
      <button type="button" className="conn-remove" onClick={change} disabled={pending} aria-busy={pending}>
        {target === 'extra' ? 'Trocar para renda extra' : 'Trocar para salário'}
      </button>
      {error && (
        <p role="alert" className="msg err">
          {error}
        </p>
      )}
    </>
  )
}
