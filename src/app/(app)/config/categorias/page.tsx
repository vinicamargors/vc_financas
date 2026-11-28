import Link from 'next/link'
import { CATEGORY_NAME_MAX } from '@/lib/categories/form'
import { loadCategories } from '@/lib/queries/analysis'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { saveCategoryAction } from './actions'

export const metadata = { title: 'Categorias' }
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  nome: `Dê um nome de até ${CATEGORY_NAME_MAX} letras.`,
  limite: 'Informe um limite maior que zero, ou deixe vazio.',
  duplicada: 'Já existe uma categoria com esse nome.',
  falha: 'Não foi possível salvar. Tente de novo.',
}

/** Centavos para o campo de texto ("1500,00"). */
function centsField(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}

export default async function CategoriasPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  await requireUser()
  const { erro, salvo } = await searchParams
  const categories = await loadCategories(await createServerSupabase())

  return (
    <main className="flow">
      <h1 className="title">Categorias</h1>
      <p className="flow-lead">Renomeie, crie e defina um limite mensal. Em períodos de outro tamanho, o limite é proporcional.</p>
      {salvo && (
        <p role="status" className="msg ok">
          Categoria salva.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {ERRORS[erro] ?? ERRORS.falha}
        </p>
      )}

      <section className="step">
        <h2>Suas categorias</h2>
        {categories.length === 0 ? (
          <p>Nenhuma categoria ainda.</p>
        ) : (
          <ul className="conn-list">
            {categories.map((c) => (
              <li key={c.id}>
                <form action={saveCategoryAction} className="cat-form">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="field">
                    <small>Nome</small>
                    <input name="name" required maxLength={CATEGORY_NAME_MAX} defaultValue={c.name} />
                  </label>
                  <label className="field">
                    <small>Limite mensal (R$)</small>
                    <input name="limit" inputMode="decimal" defaultValue={centsField(c.monthlyLimitCents)} placeholder="Sem limite" />
                  </label>
                  <button type="submit" className="chip">
                    Salvar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="step">
        <h2>Nova categoria</h2>
        <form action={saveCategoryAction} className="cm-form">
          <label className="field">
            <small>Nome</small>
            <input name="name" required maxLength={CATEGORY_NAME_MAX} placeholder="Academia" />
          </label>
          <label className="field">
            <small>Limite mensal (R$, opcional)</small>
            <input name="limit" inputMode="decimal" placeholder="300,00" />
          </label>
          <button type="submit" className="btn">
            Adicionar
          </button>
        </form>
      </section>

      <section className="step">
        <h2>Veja também</h2>
        <p>
          <Link href="/gastos">Gastos</Link> · <Link href="/config/compromissos">Compromissos</Link>
        </p>
      </section>
    </main>
  )
}
