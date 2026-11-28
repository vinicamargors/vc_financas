import Link from 'next/link'
import { BankMark } from '@/components/bank-mark'
import { Icon } from '@/components/icons'
import { Money } from '@/components/money'
import { getCdiAnnual, dailyYieldCents } from '@/lib/cdi'
import { projectMonthly } from '@/lib/invest'
import { formatCdiPercent, loadSavings, summarizeSavings } from '@/lib/queries/savings'
import { weightedCdiPercent } from '@/lib/queries/invest'
import { loadInvestView } from '@/lib/queries/invest-view'
import { requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

export const metadata = { title: 'Caixinhas' }
export const dynamic = 'force-dynamic'

const PROJECTION_MONTHS = 12

/** `YYYY-MM-DD` → `dd/mm`. */
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

export default async function CaixinhasPage() {
  const user = await requireUser()
  const [{ boxes, snapshots }, cdi, view] = await Promise.all([
    loadSavings(),
    getCdiAnnual(),
    // Rendimento real e projeção são complemento: sem eles, a lista continua.
    loadInvestView(user.id).catch((e: unknown) => {
      console.error(`carregar caixinhas (rendimento) falhou: ${safeErrorMessage(e)}`)
      return null
    }),
  ])

  if (boxes.length === 0) {
    return (
      <main>
        <h1 className="title">Caixinhas</h1>
        <p className="empty empty-lead">
          Nenhuma caixinha encontrada. Quando um banco conectado informar cofrinhos ou saldos reservados (como o Mercado Pago), eles
          aparecem aqui.
        </p>
        <div className="tiles">
          <Link href="/config/bancos" className="tile">
            <span className="n neutral" aria-hidden="true">
              <Icon name="bank" />
            </span>
            <div>
              <span className="t">Bancos conectados</span>
              <span className="m">Confira suas conexões ou conecte outro banco.</span>
            </div>
            <span className="go">Abrir</span>
          </Link>
        </div>
      </main>
    )
  }

  const summary = summarizeSavings(boxes, snapshots, cdi)
  const projection =
    view && cdi != null
      ? projectMonthly({
          startCents: summary.totalCents,
          monthlyCents: Math.max(0, view.paceCents),
          annualRatePct: (cdi * weightedCdiPercent(boxes)) / 100,
          months: PROJECTION_MONTHS,
        }).at(-1)
      : undefined

  return (
    <main>
      <section className="balance" aria-labelledby="caixinhas-titulo">
        <h1 id="caixinhas-titulo" className="label">
          Total guardado
        </h1>
        <p className="big">
          <Money cents={summary.totalCents} currency="small" />
        </p>
        {summary.dailyYieldCents != null && summary.dailyYieldCents > 0 && (
          <p className="sub">
            ≈ <Money cents={summary.dailyYieldCents} /> por dia útil
          </p>
        )}
        {view?.totalYield ? (
          <p className="sub">
            Rendeu <Money cents={view.totalYield.yieldCents} sign /> desde {dayMonth(view.totalYield.sinceDate)}{' '}
            <span className="faint">(descontados aportes e resgates)</span>
          </p>
        ) : (
          summary.change && (
            <p className="sub">
              Variação desde {dayMonth(summary.change.sinceDate)}: <Money cents={summary.change.cents} sign />{' '}
              <span className="faint">(inclui depósitos e resgates)</span>
            </p>
          )
        )}
        {projection && view && (
          <p className="sub">
            Em 12 meses, no ritmo atual (<Money cents={Math.max(0, view.paceCents)} />
            /mês): <Money cents={projection.grossCents} /> <span className="faint">(líquido de IR: <Money cents={projection.netCents} />)</span>
          </p>
        )}
      </section>

      <h2 className="day">
        <span>Suas caixinhas</span>
        <span>{boxes.length}</span>
      </h2>
      <ul className="tx-list">
        {boxes.map((b) => {
          const perDay = cdi != null && b.cdiPercent ? dailyYieldCents(b.balanceCents, cdi, b.cdiPercent) : 0
          return (
            <li key={b.id}>
              <Link href={`/caixinhas/${b.id}`} className="tx">
              <span className="ic" aria-hidden="true">
                <Icon name="jar" />
              </span>
              <span className="nm">
                <b>{b.name ?? 'Caixinha'}</b>
                <span>
                  {b.institution ? <BankMark institution={b.institution} logoUrl={b.logoUrl} /> : null}
                  {[b.institution, b.cdiPercent ? formatCdiPercent(b.cdiPercent) : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="am am-stack">
                <Money cents={b.balanceCents} />
                {perDay > 0 && (
                  <small>
                    ≈ <Money cents={perDay} sign />/dia
                  </small>
                )}
              </span>
              </Link>
            </li>
          )
        })}
      </ul>
      {cdi == null && <p className="empty">Rendimento estimado indisponível: não foi possível consultar o CDI agora.</p>}
    </main>
  )
}
