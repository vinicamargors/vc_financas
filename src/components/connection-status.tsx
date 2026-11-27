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
      if (left < 0) {
        out.push({ id: `${c.id}-consent`, kind: 'reconnect', text: `${c.connectorName}: autorização expirada, reconecte seu banco` })
      } else if (left <= RENEW_WINDOW_MS) {
        out.push({ id: `${c.id}-consent`, kind: 'renew', text: `${c.connectorName}: renovar até ${formatDayMonth(c.consentExpiresAt)}` })
      }
    }
  }
  return out
}

/** Bloco de ação: número laranja, o que precisa ser feito e a pílula que leva a Bancos. */
export function ConnectionStatus({ connections }: { connections: ConnectionRow[] }) {
  const notices = connectionNotices(connections)
  if (notices.length === 0) return null
  const reconnect = notices.some((n) => n.kind === 'reconnect')
  return (
    <section className="tiles" aria-label="Avisos de conexão">
      <Link href="/config/bancos" className="tile">
        <span className="n" aria-hidden="true">
          {notices.length}
        </span>
        <div>
          <span className="t">
            {reconnect ? 'Reconectar bancos' : 'Renovar autorização'}
          </span>
          <ul className="m">
            {notices.map((n) => (
              <li key={n.id}>{n.text}</li>
            ))}
          </ul>
        </div>
        <span className="go">{reconnect ? 'Reconectar' : 'Renovar'}</span>
      </Link>
    </section>
  )
}
