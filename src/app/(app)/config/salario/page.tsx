import { Money } from '@/components/money'
import { formatDayLabel } from '@/lib/format/date'
import { loadSalarySetup } from '@/lib/queries/salary'
import { requireUser } from '@/lib/supabase/server'
import { addSalarySourceAction } from './actions'
import { RemoveSource } from './remove-source'
import { RULE_LABEL, RuleFields } from './rule-fields'

export const metadata = { title: 'Salário' }
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  dados: 'Escolha um pagador e quando o salário cai.',
  dia: 'Informe um dia do mês entre 1 e 31.',
  falha: 'Não foi possível salvar. Tente de novo.',
}

export default async function SalarioPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  await requireUser()
  const { erro, salvo } = await searchParams
  const { sources, payers } = await loadSalarySetup()

  return (
    <main className="flow">
      <h1 className="title">Salário</h1>
      <p className="flow-lead">O ciclo começa no dia em que o salário cai. Com ele, o app calcula quanto sobra por dia.</p>
      {salvo && (
        <p role="status" className="msg ok">
          Salário salvo.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {ERRORS[erro] ?? ERRORS.falha}
        </p>
      )}

      {sources.length > 0 && (
        <section className="step">
          <h2>Fontes salvas</h2>
          <ul className="conn-list">
            {sources.map((s) => {
              const name = s.payerName ?? 'Pagador'
              return (
                <li key={s.id} className="conn-row">
                  <div>
                    <strong>{name}</strong>
                    <small>
                      {s.kind === 'salary' ? 'Salário' : 'Renda extra'} · {RULE_LABEL[s.dateRule]}
                      {s.dateRule === 'fixed_day' && s.fixedDay ? ` (dia ${s.fixedDay})` : ''}
                    </small>
                  </div>
                  <RemoveSource sourceId={s.id} name={name} />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="step">
        <h2>Entradas dos últimos 90 dias</h2>
        {payers.length === 0 ? (
          <p>Nenhuma entrada de R$ 1.000 ou mais ainda. Sincronize os bancos e volte aqui.</p>
        ) : (
          <ul className="conn-list">
            {payers.map((p) => (
              <li key={p.key} className="conn-row">
                <div>
                  <strong>{p.label}</strong>
                  <small>
                    {p.count === 1 ? '1 entrada' : `${p.count} entradas`} · última <Money cents={p.lastAmountCents} /> em {formatDayLabel(p.lastDate)}
                  </small>
                </div>
                <form action={addSalarySourceAction} className="salary-form">
                  {p.payerDoc && <input type="hidden" name="payerDoc" value={p.payerDoc} />}
                  <input type="hidden" name="payerName" value={p.payerName} />
                  <RuleFields />
                  <button type="submit" className="btn">
                    É meu salário
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
