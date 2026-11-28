'use client'

import { useState, useTransition } from 'react'
import { setFreeCountedAction } from './actions'

export function FreeToggle({ txId, counted }: { txId: string; counted: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function toggle() {
    setError(null)
    start(async () => {
      const r = await setFreeCountedAction(txId, !counted)
      if (!r.ok) setError(r.message)
    })
  }
  return (
    <>
      <button type="button" className="conn-remove" onClick={toggle} disabled={pending} aria-busy={pending}>
        {counted ? 'Tirar do livre' : 'Somar ao livre'}
      </button>
      {error && (
        <p role="alert" className="msg err">
          {error}
        </p>
      )}
    </>
  )
}
