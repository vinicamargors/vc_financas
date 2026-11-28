import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money } from '@/components/money'
import { ProjectionChart } from '@/components/projection-chart'
import { buildGoalView } from '@/lib/invest/goal-view'
import { cycleSaved, monthLabel } from '@/lib/invest/plan'
import { loadCycleData } from '@/lib/queries/cycle'
import { loadGoals } from '@/lib/queries/invest'
import { loadInvestView } from '@/lib/queries/invest-view'
import { requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'
import { deleteGoalAction, saveGoalAction } from '../actions'
import { GOAL_ERRORS, GoalForm } from '../goal-form'
import { MigrationMissing } from '../missing'

export const metadata = { title: 'Meta' }
export const dynamic = 'force-dynamic'

export default async function MetaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const user = await requireUser()
  const [{ id }, { erro, salvo }] = await Promise.all([params, searchParams])
  const [goalsRes, view, cycleData] = await Promise.all([
    loadGoals(user.id),
    loadInvestView(user.id),
    loadCycleData(user.id).catch((e: unknown) => {
      console.error(`carregar ciclo falhou: ${safeErrorMessage(e)}`)
      return null
    }),
  ])
  if (goalsRes.missing) {
    return (
      <main className="flow">
        <h1 className="title">Meta</h1>
        <MigrationMissing what="Metas" />
      </main>
    )
  }
  const goal = goalsRes.goals.find((g) => g.id === id)
  if (!goal) notFound()

  const v = buildGoalView(goal, view)
  const goalAccounts = new Set(v.boxes.map((b) => b.accountId))
  const saved = cycleData ? cycleSaved(view.flows.filter((f) => goalAccounts.has(f.accountId)), cycleData.cycle.start, view.today) : null
  const plannedCents = goal.plannedMinCents ?? goal.plannedMaxCents
  const endLabel = monthLabel(v.targetDate)

  return (
    <main className="flow">
      <h1 className="title">{goal.name}</h1>
      {salvo && (
        <p role="status" className="msg ok">
          Meta salva.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {GOAL_ERRORS[erro] ?? GOAL_ERRORS.falha}
        </p>
      )}

      <section className="balance" aria-label="Potencial">
        <p className="label">Potencial</p>
        <p className="big">
          <Money cents={v.potentialCents} currency="small" />
        </p>
        {goal.targetCents != null && (
          <p className="sub">
            Alvo: <Money cents={goal.targetCents} />
          </p>
        )}
        {saved != null && (
          <p className="sub">
            Este ciclo: guardou <Money cents={Math.max(0, saved)} />
            {plannedCents != null && (
              <>
                {' de '}
                <Money cents={plannedCents} />
              </>
            )}
          </p>
        )}
      </section>

      <ul className="kv">
        {v.boxes.map((b) => (
          <li key={b.id}>
            <span>{b.name ?? 'Caixinha'}</span>
            <Money cents={b.balanceCents} />
          </li>
        ))}
        {goal.includeFgts && (
          <li>
            <span>
              FGTS {view.fgts ? <span className="faint">(estimado)</span> : <Link href="/config/fgts">informar saldo</Link>}
            </span>
            {v.fgtsCents != null ? <Money cents={v.fgtsCents} /> : <span className="faint">—</span>}
          </li>
        )}
      </ul>

      <section className="step">
        <h2>Nesse ritmo, em {endLabel}</h2>
        {v.scenarios.length === 0 ? (
          <p>Projeção indisponível: não foi possível consultar o CDI agora.</p>
        ) : (
          <>
            <ProjectionChart series={v.scenarios.map((s) => ({ key: s.key, label: s.label, values: s.values }))} startLabel="hoje" endLabel={endLabel} />
            <ul className="kv">
              {v.scenarios.map((s) => (
                <li key={s.key}>
                  <span>
                    {s.label} (<Money cents={s.monthlyCents} />
                    /mês)
                  </span>
                  <span className="am-stack">
                    <Money cents={s.grossCents} />
                    <small className="faint">
                      líquido <Money cents={s.netCents} />
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="faint">
              Caixinhas com IR regressivo pelo prazo até a data-alvo. FGTS rende 3% a.a. com TR considerada zero (simplificação) e não paga IR.
            </p>
          </>
        )}
      </section>

      <section className="step">
        <h2>Editar meta</h2>
        <GoalForm action={saveGoalAction} boxes={view.boxes} initial={goal} submitLabel="Salvar" />
        <form action={deleteGoalAction}>
          <input type="hidden" name="id" value={goal.id} />
          <button type="submit" className="btn secondary">
            Remover meta
          </button>
        </form>
      </section>
      <Link href="/metas" className="ghost-link">
        Voltar às metas
      </Link>
    </main>
  )
}
