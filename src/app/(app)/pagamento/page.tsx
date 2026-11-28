import Link from 'next/link'
import { Money } from '@/components/money'
import { computeFree, type CommitmentStatus } from '@/lib/cycle/free'
import { formatLocalDayMonth as dm, toLocalDate } from '@/lib/format/date'
import { loadCycleData } from '@/lib/queries/cycle'
import { ExtraIncomeSection } from './extra-income'
import { requireUser } from '@/lib/supabase/server'

export const metadata = { title: 'Dia do pagamento' }
export const dynamic = 'force-dynamic'

const STATUS: Record<CommitmentStatus, { mark: string; label: string }> = {
  done: { mark: '✓', label: 'pago' },
  partial: { mark: '½', label: 'pago em parte' },
  todo: { mark: '☐', label: 'a pagar' },
}


export default async function PagamentoPage() {
  const user = await requireUser()
  const data = await loadCycleData(user.id)
  const { cycle } = data
  const free = computeFree({ ...data, today: toLocalDate(new Date()) })
  const received = data.salaryCents > 0

  return (
    <main className="flow">
      <h1 className="title">Dia do pagamento</h1>
      {!data.hasSalarySource && (
        <p className="msg err" role="status">
          Sem salário configurado, o ciclo é o mês do calendário. <Link href="/config/salario">Configurar salário</Link>
        </p>
      )}

      <section className="pay-salary" aria-labelledby="sal-titulo">
        <h2 id="sal-titulo" className="label">
          Salário
          {cycle.late && <span className="tag warn">salário atrasado</span>}
        </h2>
        {received ? (
          <>
            <p className="pay-big">
              <Money cents={data.salaryCents} currency="small" />
            </p>
            <p className="sub">
              Recebido em {dm(cycle.start)}
            </p>
          </>
        ) : (
          <p className="sub">{cycle.nextPayday ? `Previsto para ${dm(cycle.nextPayday)}` : 'Ainda não recebido neste ciclo'}</p>
        )}
      </section>

      <section aria-labelledby="cm-titulo">
        <h2 id="cm-titulo" className="label pay-hd">
          Compromissos
        </h2>
        {free.commitments.length === 0 ? (
          <p className="empty">
            Nenhum compromisso. <Link href="/config/compromissos">Adicionar</Link>
          </p>
        ) : (
          <ul className="pay-list">
            {free.commitments.map((c) => (
              <li key={c.id} className={`pay-row ${c.status}`}>
                <span className="pay-mark" aria-label={STATUS[c.status].label} role="img">
                  {STATUS[c.status].mark}
                </span>
                <span className="pay-name">
                  {c.name}
                  {c.status === 'partial' && (
                    <small>
                      <Money cents={c.paidCents} /> de <Money cents={c.expectedCents} />
                    </small>
                  )}
                </span>
                <Money cents={c.status === 'done' ? c.paidCents : c.expectedCents} className="pay-val" />
              </li>
            ))}
          </ul>
        )}
        {free.savedCents > 0 && (
          <ul className="pay-list">
            <li className="pay-row done">
              <span className="pay-mark" aria-hidden="true">
                ✓
              </span>
              <span className="pay-name">Guardado em caixinhas</span>
              <Money cents={free.savedCents} className="pay-val" />
            </li>
          </ul>
        )}
      </section>

      <ExtraIncomeSection items={data.extraIncomes} canToggle={data.freeCountedAvailable} />

      <section className="pay-free" aria-labelledby="livre-titulo">
        <h2 id="livre-titulo" className="label">
          Livre até o próximo salário
        </h2>
        {free.freeCents < 0 ? (
          <p className="pay-big bad">
            <Money cents={-free.freeCents} /> acima do planejado
          </p>
        ) : (
          <>
            <p className="pay-big">
              <Money cents={free.freeCents} currency="small" />
            </p>
            <p className="sub">
              <Money cents={free.freePerDayCents} /> por dia · {free.daysLeft} {free.daysLeft === 1 ? 'dia' : 'dias'} até {dm(cycle.end)}
            </p>
          </>
        )}
      </section>

      <section className="step">
        <h2>Ajustes</h2>
        <p>
          <Link href="/relatorio">Relatório do ciclo</Link> · <Link href="/config/compromissos">Compromissos</Link> · <Link href="/config/salario">Salário</Link>
        </p>
      </section>
    </main>
  )
}
