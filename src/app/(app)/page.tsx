import Link from 'next/link'
import { Money } from '@/components/money'
import { BankMark } from '@/components/bank-mark'
import { Icon, type IconName } from '@/components/icons'
import { ConnectionStatus } from '@/components/connection-status'
import { formatDayLabel, formatLocalDayMonth, formatTime, toLocalDate } from '@/lib/format/date'
import { showPaymentDay } from '@/lib/commitments/form'
import { computeFree, type FreeResult } from '@/lib/cycle/free'
import { loadCycleData, type CycleData } from '@/lib/queries/cycle'
import { loadHomeData, oldestBankData, oldestHealthySync } from '@/lib/queries/balances'
import { loadSavings, summarizeSavings } from '@/lib/queries/savings'
import { getCdiAnnual } from '@/lib/cdi'
import { buildGoalView } from '@/lib/invest/goal-view'
import { loadGoals } from '@/lib/queries/invest'
import { loadInvestView } from '@/lib/queries/invest-view'
import { loadBenefitWithRecharges } from '@/lib/queries/benefit'
import { loadRealSpending } from '@/lib/queries/spending'
import { loadReview, reviewCount } from '@/lib/queries/review'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { FreeWarning } from '@/components/free-warning'
import { ExtraIncomeSection } from './pagamento/extra-income'
import { safeErrorMessage } from '@/lib/sync/safe-error'

export const dynamic = 'force-dynamic'

const ACTIONS: { label: string; icon: IconName; href: string }[] = [
  { label: 'Lançar', icon: 'plus', href: '/lancar' },
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

function SalaryTile() {
  return (
    <div className="tiles">
      <Link href="/config/salario" className="tile">
        <span className="n neutral" aria-hidden="true">
          <Icon name="pie" />
        </span>
        <div>
          <span className="t">Salário</span>
          <span className="m">Configure seu salário para calcular o livre por dia</span>
        </div>
        <span className="go">Configurar</span>
      </Link>
    </div>
  )
}

function FreeHero({ data, free }: { data: CycleData; free: FreeResult }) {
  const { cycle } = data
  const over = free.freeCents < 0
  return (
    <section className="balance" aria-labelledby="livre-titulo">
      <h1 id="livre-titulo" className="label">
        Livre por dia
        {cycle.late && <span className="tag warn">salário atrasado</span>}
      </h1>
      {over ? (
        <p className="big bad">
          <Money cents={-free.freeCents} currency="small" />
          <span className="over">acima do planejado</span>
        </p>
      ) : (
        <>
          <p className="big">
            <Money cents={free.freePerDayCents} currency="small" />
          </p>
          <p className="sub">
            <Money cents={free.freeCents} /> livre até {formatLocalDayMonth(cycle.end)}
          </p>
        </>
      )}
      <p className="sub">
        Cartão neste ciclo: <Money cents={free.cardThisCycleCents} /> → próximo salário
      </p>
    </section>
  )
}

function ReportTile() {
  return (
    <div className="tiles">
      <Link href="/relatorio" className="tile">
        <span className="n neutral" aria-hidden="true">
          <Icon name="pie" />
        </span>
        <div>
          <span className="t">Relatório do ciclo</span>
          <span className="m">Entradas, saídas, categorias e comparação</span>
        </div>
        <span className="go">Ver</span>
      </Link>
    </div>
  )
}

function PaymentDayTile() {
  return (
    <div className="tiles">
      <Link href="/pagamento" className="tile">
        <span className="n neutral" aria-hidden="true">
          <Icon name="check" />
        </span>
        <div>
          <span className="t">Dia do pagamento</span>
          <span className="m">Salário, compromissos e o que fica livre</span>
        </div>
        <span className="go">Ver</span>
      </Link>
    </div>
  )
}

/** Contas VR com recargas em dia. Complemento: sem migração ou com erro, some. */
async function loadVr(userId: string): Promise<{ name: string; balanceCents: number }[]> {
  try {
    const res = await loadBenefitWithRecharges(await createServerSupabase(), userId, toLocalDate(new Date()))
    return res.missing ? [] : res.accounts.map((a) => ({ name: a.name, balanceCents: a.balanceCents }))
  } catch (e) {
    console.error(`carregar VR falhou: ${safeErrorMessage(e)}`)
    return []
  }
}

/** Potencial da primeira meta e lembrete do FGTS. Complemento: sem migração ou com erro, some. */
async function loadGoalsSummary(userId: string): Promise<{ goal: { name: string; potentialCents: number } | null; fgtsReminder: boolean } | null> {
  try {
    const goals = await loadGoals(userId)
    const view = await loadInvestView(userId)
    const first = !goals.missing ? goals.goals[0] : undefined
    return {
      goal: first ? { name: first.name, potentialCents: buildGoalView(first, view).potentialCents } : null,
      fgtsReminder: !!view.fgts?.reminderDue,
    }
  } catch (e) {
    console.error(`carregar metas falhou: ${safeErrorMessage(e)}`)
    return null
  }
}

function SavingsBlock({
  totalCents,
  dailyYieldCents,
  goal,
}: {
  totalCents: number
  dailyYieldCents: number | null
  goal: { name: string; potentialCents: number } | null
}) {
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
      {goal && (
        <Link href="/metas" className="block">
          <span className="hd">
            Potencial · {goal.name} <Icon name="chev" />
          </span>
          <span className="val">
            <Money cents={goal.potentialCents} />
          </span>
        </Link>
      )}
    </>
  )
}

export default async function InicioPage() {
  const user = await requireUser()
  const supabase = await createServerSupabase()
  const [{ connections, summary, logos }, profile, savings, cdi, review, spend, cycleData, goalsSummary, vr] = await Promise.all([
    loadHomeData(),
    supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    // Caixinhas são complemento: falha aqui não derruba o Início.
    loadSavings(1).catch(() => null),
    getCdiAnnual(),
    // Revisão também é complemento: sem ela, o atalho fica sem contador.
    loadReview().catch(() => null),
    // Gasto real também é complemento.
    loadRealSpending().catch(() => null),
    // Ciclo também é complemento: sem ele, o saldo continua aparecendo.
    loadCycleData(user.id).catch((e: unknown) => {
      console.error(`carregar ciclo falhou: ${safeErrorMessage(e)}`)
      return null
    }),
    // Metas e FGTS também são complemento (e podem não ter migração ainda).
    loadGoalsSummary(user.id),
    loadVr(user.id),
  ])
  const today = toLocalDate(new Date())
  const needsSalary = cycleData != null && !cycleData.hasSalarySource
  const free = cycleData?.hasSalarySource ? computeFree({ ...cycleData, today }) : null
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
      {cycleData && free ? (
        <>
          <FreeHero data={cycleData} free={free} />
          <FreeWarning freeCents={free.freeCents} balanceCents={summary.totalCents} />
        </>
      ) : (
        <>
          <h1 className="sr-only">Início</h1>
          {needsSalary && <SalaryTile />}
        </>
      )}
      {cycleData && free && <ExtraIncomeSection items={cycleData.extraIncomes} canToggle={cycleData.freeCountedAvailable} />}
      {cycleData && showPaymentDay(cycleData.cycle, today) && <PaymentDayTile />}
      <section className="balance secondary" aria-labelledby="saldo-titulo">
        <h2 id="saldo-titulo" className="label">
          Saldo em conta
        </h2>
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
      <ReportTile />
      <ConnectionStatus connections={connections} />
      {toReview > 0 && <ReviewTile count={toReview} />}
      {goalsSummary?.fgtsReminder && (
        <p className="msg">
          O saldo do FGTS tem mais de 90 dias. <Link href="/config/fgts">Atualizar</Link>
        </p>
      )}
      {vr.map((a) => (
        <div key={a.name}>
          <div className="sep" />
          <Link href="/config/vr" className="block">
            <span className="hd">
              {a.name} <Icon name="chev" />
            </span>
            <span className="val">
              <Money cents={a.balanceCents} />
            </span>
            <span className="meta">Vale-refeição, fora do saldo em conta</span>
          </Link>
        </div>
      ))}
      {savings && savings.boxes.length > 0 && <SavingsBlock {...summarizeSavings(savings.boxes, [], cdi)} goal={goalsSummary?.goal ?? null} />}
    </main>
  )
}
