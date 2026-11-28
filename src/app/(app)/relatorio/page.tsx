import Link from 'next/link'
import { Money } from '@/components/money'
import { buildCycleReport, type CycleReport } from '@/lib/analysis/report'
import { MIN_DATE, comparison, isLocalDate, resolvePeriod } from '@/lib/analysis/period'
import { addDays } from '@/lib/cycle/businessDays'
import type { CommitmentInput, CommitmentStatus } from '@/lib/cycle/free'
import { formatLocalDayMonth as dm } from '@/lib/format/date'
import { loadAnalysisContext, loadCategories, loadTxs } from '@/lib/queries/analysis'
import { requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

export const metadata = { title: 'Relatório do ciclo' }
export const dynamic = 'force-dynamic'

const STATUS: Record<CommitmentStatus, string> = { done: 'pago', partial: 'pago em parte', todo: 'não pago' }

function pct(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null
}

function Delta({ cur, prev, upIsBad, fair }: { cur: number; prev: number; upIsBad: boolean; fair: boolean }) {
  if (!fair) return null
  const p = pct(cur, prev)
  if (p == null) return <span className="faint">sem base</span>
  if (p === 0) return <span className="faint">igual</span>
  const bad = upIsBad ? p > 0 : p < 0
  return <span className={bad ? 'up' : 'down'}>{`${p > 0 ? '+' : '−'}${Math.abs(p)}%`}</span>
}

export default async function RelatorioPage({ searchParams }: { searchParams: Promise<{ ciclo?: string }> }) {
  const user = await requireUser()
  const ctx = await loadAnalysisContext(user.id)
  const { ciclo } = await searchParams
  const ref = isLocalDate(ciclo) && ciclo <= ctx.today ? ciclo : ctx.today
  const period = resolvePeriod({ kind: 'ciclo', ref }, ctx.cycleAt)
  const cycle = { start: period.start, end: period.end }
  const prevCycle = ctx.cycleAt(addDays(cycle.start, -1))
  const nextRef = addDays(cycle.end, 1)
  const inProgress = cycle.end >= ctx.today

  const hasPrev = addDays(cycle.start, -1) >= MIN_DATE
  let report: CycleReport | null = null
  let commitmentsUnavailable = false
  try {
    const [categories, txs, commitments] = await Promise.all([
      loadCategories(ctx.db),
      loadTxs(ctx.db, { start: prevCycle.start, end: cycle.end }, { today: ctx.today }),
      ctx.db
        .from('commitments')
        .select('id, name, kind, amount_cents, percent, percent_base, category_id, match_counterparty')
        .eq('user_id', user.id)
        .eq('active', true)
        .order('sort')
        .order('created_at'),
    ])
    commitmentsUnavailable = !!commitments.error
    report = buildCycleReport({
      cycle,
      prevCycle,
      compare: comparison(period, ctx.today, ctx.cycleAt),
      today: ctx.today,
      txs,
      accountTypes: ctx.accountTypes,
      salaries: ctx.salaries,
      categories,
      // Sem a tabela de compromissos, o relatório sai sem essa parte.
      commitments: (commitments.error ? [] : (commitments.data ?? [])).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        kind: c.kind as CommitmentInput['kind'],
        amountCents: c.amount_cents == null ? null : Number(c.amount_cents),
        percent: c.percent == null ? null : Number(c.percent),
        percentBase: c.percent_base as CommitmentInput['percentBase'],
        categoryId: (c.category_id as string | null) ?? null,
        matchCounterparty: (c.match_counterparty as string | null) ?? null,
      })),
    })
  } catch (e) {
    console.error(`carregar relatório falhou: ${safeErrorMessage(e)}`)
  }

  return (
    <main className="flow">
      <h1 className="title">Relatório do ciclo</h1>
      <div className="period-nav">
        {hasPrev ? (
          <Link href={`/relatorio?ciclo=${prevCycle.start}`} className="period-step" aria-label="Ciclo anterior">
            ‹
          </Link>
        ) : (
          <span className="period-step" aria-hidden="true" />
        )}
        <span className="period-label">
          {`${dm(cycle.start)} – ${dm(cycle.end)}`}
          {inProgress && <span className="tag">em andamento</span>}
        </span>
        {nextRef <= ctx.today ? (
          <Link href={`/relatorio?ciclo=${nextRef}`} className="period-step" aria-label="Próximo ciclo">
            ›
          </Link>
        ) : (
          <span className="period-step" aria-hidden="true" />
        )}
      </div>

      {!report ? (
        <p className="msg err" role="alert">
          Não foi possível montar o relatório. Tente de novo.
        </p>
      ) : (
        <>
          <section className="step">
            <h2>Entradas</h2>
            <ul className="kv">
              <li>
                <span>Salário</span>
                <Money cents={report.salaryCents} />
              </li>
              <li>
                <span>Extras</span>
                <Money cents={report.extrasCents} />
              </li>
            </ul>
          </section>

          <section className="step">
            <h2>Saídas</h2>
            <ul className="kv">
              <li>
                <span>Saídas no caixa</span>
                <Money cents={report.cashOutCents} />
              </li>
              <li>
                <span>Compras no cartão</span>
                <Money cents={report.cardCents} />
              </li>
              <li>
                <span>VR</span>
                <Money cents={report.benefitCents} />
              </li>
              <li>
                <span>Gasto real (caixa + cartão + VR)</span>
                <Money cents={report.spendingCents} />
              </li>
              <li>
                <span>Faturas pagas (fora do gasto)</span>
                <Money cents={report.cardPaidCents} />
              </li>
              {report.pendingCents > 0 && (
                <li>
                  <span>A confirmar (fora do gasto)</span>
                  <Money cents={report.pendingCents} />
                </li>
              )}
              <li>
                <span>Caixinhas (aportes − resgates)</span>
                <Money cents={report.savingsNetCents} sign />
              </li>
            </ul>
          </section>

          <section className="step">
            <h2>Comparação com o ciclo anterior</h2>
            <p className="faint">
              {report.prev.previousDays < report.prev.days
                ? `Este: ${report.prev.days} dias; anterior: ${report.prev.previousDays} dias. Sem variação em %, porque o anterior é mais curto.`
                : inProgress
                  ? `Os ${report.prev.days} primeiros dias de cada ciclo.`
                  : `Os ${report.prev.days} dias deste ciclo contra os ${report.prev.previousDays} primeiros do anterior.`}
            </p>
            <ul className="kv">
              <li>
                <span>Gasto real</span>
                <span>
                  <Money cents={report.prev.spendingCents} /> → <Money cents={report.spendingCents} />{' '}
                  <Delta cur={report.spendingCents} prev={report.prev.spendingCents} upIsBad fair={report.prev.previousDays >= report.prev.days} />
                </span>
              </li>
              <li>
                <span>Entradas</span>
                <span>
                  <Money cents={report.prev.incomeCents} /> → <Money cents={report.salaryCents + report.extrasCents} />{' '}
                  <Delta cur={report.salaryCents + report.extrasCents} prev={report.prev.incomeCents} upIsBad={false} fair={report.prev.previousDays >= report.prev.days} />
                </span>
              </li>
            </ul>
          </section>

          <section className="step">
            <h2>Top categorias</h2>
            {report.topCategories.length === 0 ? (
              <p>Nenhum gasto no ciclo.</p>
            ) : (
              <ul className="kv">
                {report.topCategories.map((c) => (
                  <li key={c.key}>
                    <Link href={`/gastos/${c.key}?periodo=ciclo&ref=${cycle.start}`}>{c.name}</Link>
                    <Money cents={c.totalCents} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="step">
            <h2>Top estabelecimentos</h2>
            {report.topPlaces.length === 0 ? (
              <p>Nenhum gasto no ciclo.</p>
            ) : (
              <ul className="kv">
                {report.topPlaces.map((p) => (
                  <li key={p.place}>
                    <span>{p.place}</span>
                    <Money cents={p.totalCents} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="step">
            <h2>Compromissos cumpridos</h2>
            {commitmentsUnavailable ? (
              <p className="msg err" role="status">
                Compromissos indisponíveis no momento.
              </p>
            ) : report.commitments.length === 0 ? (
              <p>
                Nenhum compromisso. <Link href="/config/compromissos">Adicionar</Link>
              </p>
            ) : (
              <>
                <p className="faint">
                  {report.commitmentsDone} de {report.commitments.length} pagos (lista de compromissos ativos hoje)
                </p>
                <ul className="kv">
                  {report.commitments.map((c) => (
                    <li key={c.id}>
                      <span>
                        {c.name} · {STATUS[c.status]}
                      </span>
                      <span>
                        <Money cents={c.paidCents} /> de <Money cents={c.expectedCents} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      <section className="step">
        <h2>Veja também</h2>
        <p>
          <Link href={`/gastos?periodo=ciclo${ref === ctx.today ? '' : `&ref=${cycle.start}`}`}>Gastos do ciclo</Link> · <Link href="/pagamento">Dia do pagamento</Link>
        </p>
      </section>
    </main>
  )
}
