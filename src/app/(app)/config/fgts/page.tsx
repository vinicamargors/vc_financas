import Link from 'next/link'
import { Money } from '@/components/money'
import { loadInvestView } from '@/lib/queries/invest-view'
import { requireUser } from '@/lib/supabase/server'
import { MigrationMissing } from '../../metas/missing'
import { saveFgtsAction } from './actions'

export const metadata = { title: 'FGTS' }
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  saldo: 'Informe o saldo (pode ser zero).',
  data: 'Informe a data do saldo, até hoje.',
  salario: 'Informe o salário bruto e o líquido de referência juntos, ou deixe os dois em branco.',
  falha: 'Não foi possível salvar. Tente de novo.',
}

const centsField = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

export default async function FgtsPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const user = await requireUser()
  const { erro, salvo } = await searchParams
  const view = await loadInvestView(user.id)
  const f = view.fgts
  const lastSalary = view.salaries.at(-1)?.amountCents ?? null
  const suggestedNet = f?.referenceNetCents ?? lastSalary

  return (
    <main className="flow">
      <h1 className="title">FGTS</h1>
      <p className="flow-lead">
        O saldo é informado por você (app FGTS). Entre um saldo e outro, estimamos 8% do salário bruto por mês, rendendo 3% ao ano. A TR é
        considerada zero, uma simplificação. O saldo informado sempre substitui a estimativa.
      </p>
      {salvo && (
        <p role="status" className="msg ok">
          FGTS salvo.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {ERRORS[erro] ?? ERRORS.falha}
        </p>
      )}
      {view.fgtsMissing ? (
        <MigrationMissing what="O FGTS" />
      ) : (
        <>
          {f && (
            <section className="step">
              <h2>Hoje</h2>
              <ul className="kv">
                <li>
                  <span>Saldo informado em {dmy(f.balanceDate)}</span>
                  <Money cents={f.balanceCents} />
                </li>
                <li>
                  <span>Estimativa de hoje (3% a.a., TR zero)</span>
                  <Money cents={f.estimateCents} />
                </li>
                {f.hasRatio && (
                  <li>
                    <span>Depósito mensal estimado</span>
                    <Money cents={f.monthlyDepositCents} />
                  </li>
                )}
              </ul>
              {f.reminderDue && <p className="msg">O saldo tem mais de 90 dias. Confira no app do FGTS e atualize aqui.</p>}
            </section>
          )}
          <section className="step">
            <h2>{f ? 'Atualizar' : 'Informar saldo'}</h2>
            <form action={saveFgtsAction} className="cm-form">
              <label className="field">
                <small>Saldo (R$)</small>
                <input name="balance" inputMode="decimal" required defaultValue={centsField(f?.balanceCents)} placeholder="30.000,00" />
              </label>
              <label className="field">
                <small>Data do saldo</small>
                <input name="balanceDate" type="date" required max={view.today} defaultValue={f?.balanceDate ?? view.today} />
              </label>
              <label className="field">
                <small>Salário bruto (R$)</small>
                <input name="gross" inputMode="decimal" defaultValue={centsField(f?.grossSalaryCents)} placeholder="10.000,00" />
              </label>
              <label className="field">
                <small>Líquido de referência (R$)</small>
                <input name="net" inputMode="decimal" defaultValue={centsField(suggestedNet)} placeholder="7.500,00" />
                {lastSalary != null && !f?.referenceNetCents && (
                  <small className="faint">
                    Sugerido pelo último salário reconhecido: <Money cents={lastSalary} />
                  </small>
                )}
              </label>
              <button type="submit" className="btn">
                Salvar
              </button>
            </form>
          </section>
        </>
      )}
      <Link href="/config/bancos" className="ghost-link">
        Voltar
      </Link>
    </main>
  )
}
