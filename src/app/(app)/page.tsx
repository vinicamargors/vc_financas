import Link from 'next/link'
import { GlassCard } from '@/components/glass/glass-card'
import { Money } from '@/components/money'
import { ConnectionStatus } from '@/components/connection-status'
import { formatTime } from '@/lib/format/date'
import { loadHomeData } from '@/lib/queries/balances'
import { requireUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function InicioPage() {
  await requireUser()
  const { connections, summary } = await loadHomeData()

  if (connections.length === 0) {
    return (
      <main className="flex flex-col gap-4">
        <GlassCard as="section" className="p-5">
          <h1 className="text-xl font-semibold">Conecte seus bancos</h1>
          <p className="mt-1 text-muted">Ligue sua conta na Pluggy para ver saldos e extrato aqui.</p>
          <Link href="/config/bancos" className="mt-3 inline-block font-semibold text-accent underline">
            Conecte seus bancos
          </Link>
        </GlassCard>
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-4">
      <ConnectionStatus connections={connections} />
      <GlassCard as="section" className="p-5" aria-labelledby="saldo-titulo">
        <div className="flex items-baseline justify-between gap-2">
          <h1 id="saldo-titulo" className="text-sm font-medium text-muted">Saldo em conta</h1>
          {summary.updatedAt && <span className="text-xs text-muted">atualizado {formatTime(summary.updatedAt)}</span>}
        </div>
        <p className="mt-1 text-3xl font-bold">
          <Money cents={summary.totalCents} />
        </p>
        {summary.byInstitution.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nenhuma conta corrente encontrada.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {summary.byInstitution.map((i) => (
              <li key={i.institution} className="flex justify-between gap-2">
                <span>{i.institution}</span>
                <Money cents={i.balanceCents} />
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </main>
  )
}
