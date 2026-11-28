import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money } from '@/components/money'
import { ProjectionChart } from '@/components/projection-chart'
import { realYield } from '@/lib/invest'
import { goalOutlook } from '@/lib/invest/goal'
import { addMonths, averageMonthlyNet, monthLabel } from '@/lib/invest/plan'
import { flowsForBox } from '@/lib/queries/invest'
import { loadInvestView } from '@/lib/queries/invest-view'
import { formatCdiPercent } from '@/lib/queries/savings'
import { requireUser } from '@/lib/supabase/server'

export const metadata = { title: 'Caixinha' }
export const dynamic = 'force-dynamic'

const MONTHS = 12
const HISTORY_ROWS = 30
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

export default async function CaixinhaPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const view = await loadInvestView(user.id)
  const box = view.boxes.find((b) => b.id === id)
  if (!box) notFound()

  const snaps = view.snapshots.filter((s) => s.boxId === box.id)
  const flows = flowsForBox(box, view.boxes, view.flows)
  const yieldInfo = realYield(snaps, flows ?? [])
  // Ritmo por caixinha só quando os aportes da conta são dela; senão, sem aporte (só rendimento).
  const pace = flows ? Math.max(0, averageMonthlyNet(flows, view.salaries.map((s) => s.date), view.today)) : 0
  const outlook = goalOutlook({
    boxesCents: box.balanceCents,
    cdiAnnualPct: view.cdi,
    cdiPercent: box.cdiPercent ?? 100,
    months: MONTHS,
    pace: { currentCents: pace, minCents: null, maxCents: null },
    fgts: null,
  })
  const history = [...snaps].reverse().slice(0, HISTORY_ROWS)

  return (
    <main>
      <section className="balance" aria-labelledby="cx-titulo">
        <h1 id="cx-titulo" className="label">
          {box.name ?? 'Caixinha'}
        </h1>
        <p className="big">
          <Money cents={box.balanceCents} currency="small" />
        </p>
        <p className="sub">{box.cdiPercent ? formatCdiPercent(box.cdiPercent) : 'Rendimento não informado pelo banco'}</p>
        {yieldInfo && snaps.length >= 2 && (
          <p className="sub">
            {flows ? 'Rendeu' : 'Variação'} <Money cents={yieldInfo.yieldCents} sign /> desde {dayMonth(yieldInfo.sinceDate)}
            {!flows && <span className="faint"> (inclui aportes e resgates: a conta tem mais de uma caixinha)</span>}
          </p>
        )}
        {snaps.length < 2 && <p className="sub faint">Rendimento real aparece depois de dois dias com saldo registrado.</p>}
      </section>

      <h2 className="day">
        <span>Projeção em {MONTHS} meses</span>
      </h2>
      {outlook.scenarios.length > 0 ? (
        <>
          <ProjectionChart
            series={outlook.scenarios.map((s) => ({ key: s.key, label: s.label, values: s.values }))}
            startLabel="hoje"
            endLabel={monthLabel(addMonths(view.today, MONTHS))}
          />
          <ul className="kv">
            <li>
              <span>Aporte considerado</span>
              <Money cents={pace} />
            </li>
            <li>
              <span>Bruto (estimativa)</span>
              <Money cents={outlook.scenarios[0].grossCents} />
            </li>
            <li>
              <span>IR (estimativa, tabela regressiva)</span>
              <Money cents={outlook.scenarios[0].irCents} />
            </li>
            <li>
              <span>Líquido (estimativa)</span>
              <Money cents={outlook.scenarios[0].netCents} />
            </li>
          </ul>
        </>
      ) : (
        <p className="empty">Projeção indisponível: não foi possível consultar o CDI agora.</p>
      )}

      <h2 className="day">
        <span>Histórico de saldo</span>
        <span>{snaps.length}</span>
      </h2>
      {history.length === 0 ? (
        <p className="empty">Sem histórico ainda.</p>
      ) : (
        <ul className="kv">
          {history.map((s) => (
            <li key={s.date}>
              <span>{dayMonth(s.date)}</span>
              <Money cents={s.balanceCents} />
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/caixinhas" className="ghost-link">
          Voltar às caixinhas
        </Link>
      </p>
    </main>
  )
}
