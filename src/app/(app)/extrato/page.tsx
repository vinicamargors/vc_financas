import Link from 'next/link'
import { GlassCard } from '@/components/glass/glass-card'
import { Money } from '@/components/money'
import { formatDayLabel } from '@/lib/format/date'
import { loadStatement } from '@/lib/queries/statement'
import { requireUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Extrato' }

export default async function ExtratoPage() {
  await requireUser()
  const days = await loadStatement(90)

  if (days.length === 0) {
    return (
      <main className="flex flex-col gap-4">
        <GlassCard as="section" className="p-5">
          <h1 className="text-xl font-semibold">Extrato</h1>
          <p className="mt-1 text-muted">Nenhuma transação nos últimos 90 dias.</p>
          <Link href="/config/bancos" className="mt-3 inline-block font-semibold text-accent underline">
            Conecte seus bancos
          </Link>
        </GlassCard>
      </main>
    )
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Extrato</h1>
      {days.map((day) => (
        <section key={day.date} aria-label={formatDayLabel(day.date)}>
          <div className="flex justify-between px-1 pb-1 text-sm text-muted">
            <span>{formatDayLabel(day.date)}</span>
            <Money cents={day.totalCents} sign />
          </div>
          <GlassCard as="ul" className="flex flex-col divide-y divide-white/20 p-2">
            {day.items.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-2 py-2">
                <span className="min-w-0">
                  <b className="block truncate font-medium">{t.description}</b>
                  <span className="text-xs text-muted">
                    {[t.accountLabel, t.cardLast4 ? `cartão •••• ${t.cardLast4}` : null, t.installmentNumber && t.installmentTotal ? `${t.installmentNumber}/${t.installmentTotal}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <Money cents={t.amountCents} sign className="shrink-0 font-semibold" />
              </li>
            ))}
          </GlassCard>
        </section>
      ))}
    </main>
  )
}
