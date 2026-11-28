import Link from 'next/link'
import { Money } from '@/components/money'
import { BankMark } from '@/components/bank-mark'
import { Icon, type IconName } from '@/components/icons'
import { ConnectionStatus } from '@/components/connection-status'
import { formatDayLabel, formatTime, toLocalDate } from '@/lib/format/date'
import { loadHomeData, oldestBankData, oldestHealthySync } from '@/lib/queries/balances'
import { loadSavings, summarizeSavings } from '@/lib/queries/savings'
import { getCdiAnnual } from '@/lib/cdi'
import { loadRealSpending } from '@/lib/queries/spending'
import { loadReview, reviewCount } from '@/lib/queries/review'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ACTIONS: { label: string; icon: IconName; href: string }[] = [
  { label: 'Revisar', icon: 'check', href: '/revisar' },
  { label: 'Extrato', icon: 'list', href: '/extrato' },
  { label: 'Caixinhas', icon: 'jar', href: '/caixinhas' },
  { label: 'Bancos', icon: 'bank', href: '/config/bancos' },
]

function updatedLabel(iso: string): string {
  const day = toLocalDate(iso)
  const when = day === toLocalDate(new Date()) ? 'hoje' : formatDayLabel(day)
  return `Dados do banco de ${when}, ${formatTime(iso)}`
}

function QuickActions({ reviewCount }: { reviewCount: number }) {
  return (
    <nav className="actions" aria-label="Atalhos">
      {ACTIONS.map((a) => (
        <Link key={a.label} href={a.href} className="act">
          <span className="act-icon">
            <Icon name={a.icon} />
            {a.href === '/revisar' && reviewCount > 0 && (
              <span className="badge" aria-label={`${reviewCount} para revisar`}>
                {reviewCount > 99 ? '99+' : reviewCount}
              </span>
            )}
          </span>
          {a.label}
        </Link>
      ))}
    </nav>
  )
}

function ReviewTile({ count }: { count: number }) {
  return (
    <div className="tiles">
      <Link href="/revisar" className="tile">
        <span className="n" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
        <div>
          <span className="t">Revisar gastos</span>
          <span className="m">{count === 1 ? '1 item para confirmar ou nomear' : `${count} itens para confirmar ou nomear`}</span>
        </div>
        <span className="go">Revisar</span>
      </Link>
    </div>
  )
}

function SavingsBlock({ totalCents, dailyYieldCents }: { totalCents: number; dailyYieldCents: number | null }) {
  return (
    <>
      <div className="sep" />
      <Link href="/caixinhas" className="block">
        <span className="hd">
          Caixinhas <Icon name="chev" />
        </span>
        <span className="val">
          <Money cents={totalCents} />
        </span>
        {dailyYieldCents != null && dailyYieldCents > 0 && (
          <span className="meta">
            ≈ <Money cents={dailyYieldCents} /> por dia útil
          </span>
        )}
      </Link>
    </>
  )
}

export default async function InicioPage() {
  const user = await requireUser()
  const supabase = await createServerSupabase()
  const [{ connections, summary, logos }, profile, savings, cdi, review, spend] = await Promise.all([
    loadHomeData(),
    supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    // Caixinhas são complemento: falha aqui não derruba o Início.
    loadSavings(1).catch(() => null),
    getCdiAnnual(),
    // Revisão também é complemento: sem ela, o atalho fica sem contador.
    loadReview().catch(() => null),
    // Gasto real também é complemento.
    loadRealSpending().catch(() => null),
  ])
  const name = profile.data?.display_name?.trim()
  const hello = <p className="hello">{name ? `Olá, ${name}` : 'Olá'}</p>

  if (connections.length === 0) {
    return (
      <main>
        {hello}
        <h1 className="sr-only">Início</h1>
        <div className="tiles tiles-top">
          <Link href="/config/bancos" className="tile">
            <span className="n neutral" aria-hidden="true">
              <Icon name="bank" />
            </span>
            <div>
              <span className="t">Conecte seus bancos</span>
              <span className="m">Ligue sua conta na Pluggy para ver saldos e extrato aqui.</span>
            </div>
            <span className="go">Conectar</span>
          </Link>
        </div>
      </main>
    )
  }

  const syncedAt = oldestBankData(connections) ?? oldestHealthySync(connections)
  const toReview = review ? reviewCount(review) : 0

  return (
    <main>
      {hello}
      <section className="balance" aria-labelledby="saldo-titulo">
        <h1 id="saldo-titulo" className="label">
          Saldo em conta
        </h1>
        <p className="big">
          <Money cents={summary.totalCents} currency="small" />
        </p>
        {summary.byInstitution.length === 0 ? (
          <p className="sub">Nenhuma conta corrente encontrada.</p>
        ) : (
          <ul className="banks">
            {summary.byInstitution.map((i) => (
              <li key={i.institution}>
                <BankMark institution={i.institution} logoUrl={logos.get(i.institution)} />
                {i.institution}
                <Money cents={i.balanceCents} currency="none" />
              </li>
            ))}
          </ul>
        )}
        {syncedAt && <p className="sub">{updatedLabel(syncedAt)}</p>}
      </section>
      {spend && (
        <section className="spend" aria-labelledby="gasto-titulo">
          <h2 id="gasto-titulo" className="label">
            Gasto real · 30 dias
          </h2>
          <p>
            <Money cents={spend.spendingCents} className="val" />
            {spend.pendingCents > 0 && (
              <Link href="/revisar" className="pend">
                + <Money cents={spend.pendingCents} /> a confirmar
              </Link>
            )}
          </p>
        </section>
      )}
      <QuickActions reviewCount={toReview} />
      <ConnectionStatus connections={connections} />
      {toReview > 0 && <ReviewTile count={toReview} />}
      {savings && savings.boxes.length > 0 && <SavingsBlock {...summarizeSavings(savings.boxes, [], cdi)} />}
    </main>
  )
}
