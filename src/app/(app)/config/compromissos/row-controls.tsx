'use client'

import { useState, useTransition } from 'react'
import { moveCommitmentAction, setCommitmentActiveAction } from './actions'

export function RowControls({ id, name, active, first, last }: { id: string; name: string; active: boolean; first: boolean; last: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    setError(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) setError(r.message)
    })
  }
  return (
    <div className="cm-ctrl" aria-busy={pending}>
      {active && (
        <>
          <button type="button" className="cm-btn" disabled={pending || first} onClick={() => run(() => moveCommitmentAction(id, 'up'))} aria-label={`Subir ${name}`}>
            ↑
          </button>
          <button type="button" className="cm-btn" disabled={pending || last} onClick={() => run(() => moveCommitmentAction(id, 'down'))} aria-label={`Descer ${name}`}>
            ↓
          </button>
        </>
      )}
      <button type="button" className="conn-remove" disabled={pending} onClick={() => run(() => setCommitmentActiveAction(id, !active))}>
        {active ? 'Desativar' : 'Reativar'}
      </button>
      {error && (
        <p role="alert" className="msg err">
          {error}
        </p>
      )}
    </div>
  )
}
