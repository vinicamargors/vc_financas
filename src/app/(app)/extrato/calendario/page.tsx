import Link from 'next/link'
import { Money } from '@/components/money'
import { CompactMoney } from '@/components/compact-money'
import { WeeklyChart } from '@/components/weekly-chart'
import { MIN_MONTH, dailySpend, heat, monthGrid, monthRange, parseMonth, shiftMonth, weeklyInOut } from '@/lib/analysis/calendar'
import { formatLocalDayMonth } from '@/lib/format/date'
import { loadAnalysisContext, loadTxs, type AnalysisTx } from '@/lib/queries/analysis'
import { requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

export const metadata = { title: 'Calendário de gastos' }
export const dynamic = 'force-dynamic'

const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser()
  const ctx = await loadAnalysisContext(user.id)
  const month = parseMonth((await searchParams).mes, ctx.today)
  const [y, m] = month.split('-').map(Number)
  const grid = monthGrid(month)

  let txs: AnalysisTx[] | null = null
  try {
    txs = await loadTxs(ctx.db, monthRange(month), { today: ctx.today })
  } catch (e) {
    console.error(`carregar calendário falhou: ${safeErrorMessage(e)}`)
  }
  const perDay = dailySpend(txs ?? [])
  const max = Math.max(0, ...perDay.values())
  const total = [...perDay.values()].reduce((s, v) => s + v, 0)
  const weeks = weeklyInOut(txs ?? [], grid, ctx.accountTypes)
  const next = shiftMonth(month, 1)

  return (
    <main>
      <h1 className="title">Calendário</h1>
      <div className="period-nav">
        {month > MIN_MONTH ? (
          <Link href={`/extrato/calendario?mes=${shiftMonth(month, -1)}`} className="period-step" aria-label="Mês anterior">
            ‹
          </Link>
        ) : (
          <span className="period-step" aria-hidden="true" />
        )}
        <span className="period-label">{`${MONTHS[m - 1]} de ${y}`}</span>
        {next <= ctx.today.slice(0, 7) ? (
          <Link href={`/extrato/calendario?mes=${next}`} className="period-step" aria-label="Próximo mês">
            ›
          </Link>
        ) : (
          <span className="period-step" aria-hidden="true" />
        )}
      </div>

      {txs == null ? (
        <p className="msg err" role="alert">
          Não foi possível carregar o calendário. Tente de novo.
        </p>
      ) : (
        <>
          <p className="sub cal-total">
            Gasto no mês: <Money cents={total} />
          </p>
          <table className="cal">
            <thead>
              <tr>
                {WEEKDAYS.map((d, i) => (
                  <th key={i} scope="col" abbr={WEEKDAY_NAMES[i]}>
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((week, wi) => (
                <tr key={wi}>
                  {week.map((d, di) => {
                    if (!d) return <td key={di} />
                    const v = perDay.get(d) ?? 0
                    const future = d > ctx.today
                    return (
                      <td key={d}>
                        {future ? (
                          <span className="cal-day future">
                            <b>{Number(d.slice(8))}</b>
                          </span>
                        ) : (
                          <Link
                            href={`/extrato?periodo=dia&ref=${d}`}
                            className="cal-day"
                            style={{ '--heat': `${Math.round(heat(v, max) * 55)}%` } as React.CSSProperties}
                            aria-label={`${formatLocalDayMonth(d)}: ver lançamentos`}
                          >
                            <b>{Number(d.slice(8))}</b>
                            {v > 0 && <CompactMoney cents={v} className="cal-v" />}
                          </Link>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint cal-legend">Cor mais forte = dia com mais gasto. Toque num dia para ver os lançamentos.</p>

          <section aria-labelledby="sem-titulo">
            <h2 id="sem-titulo" className="day">
              <span>Entradas × saídas por semana</span>
            </h2>
            <div className="cal-chart">
              <WeeklyChart weeks={weeks} />
            </div>
          </section>
        </>
      )}
      <p className="cat-foot">
        <Link href="/extrato" className="ghost-link">
          Voltar para o Extrato
        </Link>
      </p>
    </main>
  )
}
