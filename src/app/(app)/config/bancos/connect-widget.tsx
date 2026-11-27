'use client'

import dynamic from 'next/dynamic'
import { useState, useTransition } from 'react'
import { addItemsAction, discoverItemsAction, type DiscoverResult } from './actions'

const PluggyConnect = dynamic(() => import('react-pluggy-connect').then((m) => m.PluggyConnect), { ssr: false })

export function ConnectWidget() {
  const [pending, startTransition] = useTransition()
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [manualId, setManualId] = useState('')

  const add = (ids: string[]) =>
    startTransition(async () => {
      setMessage(null)
      const r = await addItemsAction(ids)
      if (r.ok) setDone(true)
      else setMessage(r.message)
    })

  if (done) return <p role="status">Conexão salva. As transações dos últimos 90 dias estão sendo importadas.</p>

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null)
            const r = await discoverItemsAction()
            setDiscovery(r)
            if (!r.ok) setMessage(r.message)
          })
        }
      >
        Entrar com o Meu Pluggy
      </button>

      {discovery?.ok && discovery.mode === 'listed' && (
        <div>
          <p>Encontramos {discovery.itemIds.length} conexão(ões) na sua conta Pluggy.</p>
          <button type="button" disabled={pending} onClick={() => add(discovery.itemIds)}>
            Usar estes
          </button>
        </div>
      )}

      {discovery?.ok && discovery.mode === 'widget' && (
        <PluggyConnect
          connectToken={discovery.connectToken}
          includeSandbox={false}
          onSuccess={({ item }) => add([item.id])}
          onError={() => setMessage('Não foi possível concluir a conexão. Tente de novo.')}
          onClose={() => setDiscovery(null)}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (manualId.trim()) add([manualId.trim()])
        }}
      >
        <label>
          Colar Item ID
          <input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
        </label>
        <button type="submit" disabled={pending}>
          Adicionar
        </button>
      </form>

      {message && <p role="alert">{message}</p>}
    </div>
  )
}
