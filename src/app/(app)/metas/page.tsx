import Link from 'next/link'
import { Money } from '@/components/money'
import { Icon } from '@/components/icons'
import { buildGoalView } from '@/lib/invest/goal-view'
import { monthLabel } from '@/lib/invest/plan'
import { loadGoals } from '@/lib/queries/invest'
import { loadInvestView } from '@/lib/queries/invest-view'
import { requireUser } from '@/lib/supabase/server'
import { saveGoalAction } from './actions'
import { GOAL_ERRORS, GoalForm } from './goal-form'
import { MigrationMissing } from './missing'

export const metadata = { title: 'Metas' }
export const dynamic = 'force-dynamic'

export default async function MetasPage({ searchParams }: { searchParams: Promise<{ erro?: string; removida?: string }> }) {
  const user = await requireUser()
  const { erro, removida } = await searchParams
  const [goalsRes, view] = await Promise.all([loadGoals(user.id), loadInvestView(user.id)])

  return (
    <main className="flow">
      <h1 className="title">Metas</h1>
      <p className="flow-lead">Junte caixinhas e o FGTS num objetivo e veja onde o ritmo atual leva até a data-alvo.</p>
      {removida && (
        <p role="status" className="msg ok">
          Meta removida.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {GOAL_ERRORS[erro] ?? GOAL_ERRORS.falha}
        </p>
      )}
      {goalsRes.missing ? (
        <MigrationMissing what="Metas" />
      ) : (
        <>
          <section className="step">
            <h2>Suas metas</h2>
            {goalsRes.goals.length === 0 ? (
              <p>Nenhuma meta ainda.</p>
            ) : (
              <ul className="tx-list">
                {goalsRes.goals.map((g) => {
                  const v = buildGoalView(g, view)
                  return (
                    <li key={g.id}>
                      <Link href={`/metas/${g.id}`} className="tx">
                        <span className="ic" aria-hidden="true">
                          <Icon name="check" />
                        </span>
                        <span className="nm">
                          <b>{g.name}</b>
                          <span>
                            até {monthLabel(v.targetDate)}
                            {g.targetCents != null && (
                              <>
                                {' · alvo '}
                                <Money cents={g.targetCents} />
                              </>
                            )}
                          </span>
                        </span>
                        <span className="am am-stack">
                          <Money cents={v.potentialCents} />
                          <small>potencial</small>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          <section className="step">
            <h2>Nova meta</h2>
            <GoalForm action={saveGoalAction} boxes={view.boxes} submitLabel="Criar meta" />
          </section>
        </>
      )}
    </main>
  )
}
