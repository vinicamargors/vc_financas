'use client'

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from 'react'
import { setHideValuesAction } from './hide-values-action'

type HideValues = { hidden: boolean; toggle(): void }

// Fora do provider, valores ficam visíveis e o toggle não faz nada.
const HideValuesContext = createContext<HideValues>({ hidden: false, toggle() {} })

export function HideValuesProvider({ initial, children }: { initial: boolean; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(initial)
  const [, startTransition] = useTransition()

  const toggle = useCallback(() => {
    const next = !hidden
    setHidden(next)
    startTransition(async () => {
      try {
        await setHideValuesAction(next)
      } catch {
        setHidden(!next) // reverte se não conseguiu persistir
      }
    })
  }, [hidden])

  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle])
  return <HideValuesContext.Provider value={value}>{children}</HideValuesContext.Provider>
}

export function useHideValues(): HideValues {
  return useContext(HideValuesContext)
}

export function HideValuesToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useHideValues()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
      className={`glass-icon-button ${className ?? ''}`}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
    </button>
  )
}
