import Link from 'next/link'
import { Money } from '@/components/money'
import { loadCommitmentsSetup, type CommitmentRow } from '@/lib/queries/commitments'
import { requireUser } from '@/lib/supabase/server'
import { saveCommitmentAction } from './actions'
import { CommitmentForm, KIND_LABEL } from './commitment-form'
import { RowControls } from './row-controls'

export const metadata = { title: 'Compromissos' }
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  nome: 'Dê um nome de até 80 letras.',
  tipo: 'Escolha o tipo do compromisso.',
  valor: 'Informe um valor maior que zero.',
  percentual: 'Informe um percentual entre 0 e 100.',
  categoria: 'Escolha a categoria do orçamento.',
  falha: 'Não foi possível salvar. Tente de novo.',
}

function Detail({ c, categories }: { c: CommitmentRow; categories: Map<string, string> }) {
  if (c.kind === 'percent_of_income') {
    return (
      <small>
        {c.percent?.toLocaleString('pt-BR')}% {c.percentBase === 'all' ? 'da renda' : 'do salário'}
        {c.matchCounterparty ? ` · ${c.matchCounterparty}` : ''}
      </small>
    )
  }
  const extra = c.kind === 'category_budget' ? categories.get(c.categoryId ?? '') ?? 'sem categoria' : c.matchCounterparty
  return (
    <small>
      {KIND_LABEL[c.kind]} · <Money cents={c.amountCents ?? 0} />
      {extra ? ` · ${extra}` : ''}
    </small>
  )
}

export default async function CompromissosPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string; editar?: string }> }) {
  const user = await requireUser()
  const { erro, salvo, editar } = await searchParams
  const { commitments, categories } = await loadCommitmentsSetup(user.id)
  const catNames = new Map(categories.map((c) => [c.id, c.name]))
  const active = commitments.filter((c) => c.active)
  const inactive = commitments.filter((c) => !c.active)
  const editing = editar ? commitments.find((c) => c.id === editar) : undefined

  return (
    <main className="flow">
      <h1 className="title">Compromissos</h1>
      <p className="flow-lead">O que sai de cada salário: contas fixas, orçamentos por categoria e percentuais. O livre por dia desconta tudo isso.</p>
      {salvo && (
        <p role="status" className="msg ok">
          Compromisso salvo.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {ERRORS[erro] ?? ERRORS.falha}
        </p>
      )}

      {editing && (
        <section className="step">
          <h2>Editar {editing.name}</h2>
          <CommitmentForm key={editing.id} action={saveCommitmentAction} categories={categories} initial={editing} />
          <Link href="/config/compromissos" className="ghost-link">
            Cancelar
          </Link>
        </section>
      )}

      <section className="step">
        <h2>Ativos</h2>
        {active.length === 0 ? (
          <p>Nenhum compromisso ainda.</p>
        ) : (
          <ul className="conn-list">
            {active.map((c, i) => (
              <li key={c.id} className="conn-row">
                <div>
                  <strong>
                    <Link href={`/config/compromissos?editar=${c.id}`}>{c.name}</Link>
                  </strong>
                  <Detail c={c} categories={catNames} />
                </div>
                <RowControls id={c.id} name={c.name} active first={i === 0} last={i === active.length - 1} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {!editing && (
        <section className="step">
          <h2>Novo compromisso</h2>
          <CommitmentForm action={saveCommitmentAction} categories={categories} />
        </section>
      )}

      {inactive.length > 0 && (
        <section className="step">
          <h2>Desativados</h2>
          <ul className="conn-list">
            {inactive.map((c) => (
              <li key={c.id} className="conn-row">
                <div>
                  <strong>{c.name}</strong>
                  <Detail c={c} categories={catNames} />
                </div>
                <RowControls id={c.id} name={c.name} active={false} first last />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="step">
        <h2>Veja também</h2>
        <p>
          <Link href="/pagamento">Dia do pagamento</Link> · <Link href="/config/salario">Salário</Link>
        </p>
      </section>
    </main>
  )
}
