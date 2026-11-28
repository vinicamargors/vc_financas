'use client'

import { useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

const STEPS = ['Conectando aos bancos…', 'Buscando saldos e lançamentos…', 'Classificando gastos…', 'Últimos ajustes…']

/** Botão com progresso: fica ocupado enquanto a sincronização roda e mostra em que etapa está. */
export function SyncButton() {
  const { pending } = useFormStatus()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!pending) {
      setStep(0)
      return
    }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500)
    return () => clearInterval(t)
  }, [pending])

  return (
    <div className="sync">
      <button type="submit" className="btn secondary" disabled={pending} aria-busy={pending}>
        {pending ? 'Sincronizando…' : 'Sincronizar agora'}
      </button>
      {pending && (
        <div className="sync-progress" role="status" aria-live="polite">
          <div className="sync-bar">
            <i />
          </div>
          <p>{STEPS[step]}</p>
        </div>
      )}
    </div>
  )
}
