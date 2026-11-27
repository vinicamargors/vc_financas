import Link from 'next/link'
import { formatDayMonth } from '@/lib/format/date'
import type { ConnectionRow } from '@/lib/queries/balances'

const HEALTHY = new Set(['UPDATED', 'UPDATING'])
const RENEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export type ConnectionNotice = { id: string; text: string; kind: 'reconnect' | 'renew' }

export function connectionNotices(connections: ConnectionRow[], now: Date = new Date()): ConnectionNotice[] {
  const out: ConnectionNotice[] = []
  for (const c of connections) {
    if (!HEALTHY.has(c.status)) {
      out.push({ id: `${c.id}-status`, kind: 'reconnect', text: `${c.connectorName}: reconecte seu banco` })
    }
    if (c.consentExpiresAt) {
      const left = new Date(c.consentExpiresAt).getTime() - now.getTime()
      if (left <= RENEW_WINDOW_MS) {
        out.push({ id: `${c.id}-consent`, kind: 'renew', text: `${c.connectorName}: renovar até ${formatDayMonth(c.consentExpiresAt)}` })
      }
    }
  }
  return out
}

export function ConnectionStatus({ connections }: { connections: ConnectionRow[] }) {
  const notices = connectionNotices(connections)
  if (notices.length === 0) return null
  return (
    <ul className="flex flex-col gap-2" aria-label="Avisos de conexão">
      {notices.map((n) => (
        <li key={n.id} className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm">
          <span>{n.text}</span>
          <Link href="/config/bancos" className="font-semibold text-accent underline">
            {n.kind === 'reconnect' ? 'Reconectar' : 'Renovar'}
          </Link>
        </li>
      ))}
    </ul>
  )
}
