import Link from 'next/link'
import { BankMark } from '@/components/bank-mark'
import { Icon } from '@/components/icons'
import { Money } from '@/components/money'
import { getCdiAnnual, dailyYieldCents } from '@/lib/cdi'
import { formatCdiPercent, loadSavings, summarizeSavings } from '@/lib/queries/savings'

export const dynamic = 'force-dynamic'

/** `YYYY-MM-DD` → `dd/mm`. */
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

export default async function CaixinhasPage() {
  const [{ boxes, snapshots }, cdi] = await Promise.all([loadSavings(), getCdiAnnual()])

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
        {summary.change && (
          <p className="sub">
            Variação desde {dayMonth(summary.change.sinceDate)}: <Money cents={summary.change.cents} sign />{' '}
            <span className="faint">(inclui depósitos e resgates)</span>
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
            <li key={b.id} className="tx">
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
            </li>
          )
        })}
      </ul>
      {cdi == null && <p className="empty">Rendimento estimado indisponível: não foi possível consultar o CDI agora.</p>}
    </main>
  )
}
