'use client'

import { useState } from 'react'
import type { CommitmentRow } from '@/lib/queries/commitments'

export const KIND_LABEL: Record<CommitmentRow['kind'], string> = {
  fixed: 'Valor fixo',
  category_budget: 'Orçamento de categoria',
  percent_of_income: 'Percentual da renda',
}

/** Valor em centavos para o campo de texto ("1500,00"). */
function centsField(cents: number | null): string {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',')
}

/** Formulário de criar/editar: os campos mudam conforme o tipo. */
export function CommitmentForm({
  action,
  categories,
  initial,
}: {
  action: (form: FormData) => Promise<void>
  categories: { id: string; name: string }[]
  initial?: CommitmentRow
}) {
  const [kind, setKind] = useState<CommitmentRow['kind']>(initial?.kind ?? 'fixed')
  return (
    <form action={action} className="cm-form">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="field">
        <small>Nome</small>
        <input name="name" required maxLength={80} defaultValue={initial?.name ?? ''} placeholder="Aluguel" />
      </label>
      <label className="field">
        <small>Tipo</small>
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as CommitmentRow['kind'])}>
          {Object.entries(KIND_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {kind === 'percent_of_income' ? (
        <>
          <label className="field">
            <small>Percentual (%)</small>
            <input name="percent" inputMode="decimal" required defaultValue={initial?.percent?.toString().replace('.', ',') ?? ''} placeholder="10" />
          </label>
          <label className="field">
            <small>Sobre</small>
            <select name="percentBase" defaultValue={initial?.percentBase ?? 'salary'}>
              <option value="salary">Só o salário</option>
              <option value="all">Salário e rendas extras</option>
            </select>
          </label>
        </>
      ) : (
        <label className="field">
          <small>{kind === 'category_budget' ? 'Limite no ciclo (R$)' : 'Valor (R$)'}</small>
          <input name="amount" inputMode="decimal" required defaultValue={centsField(initial?.amountCents ?? null)} placeholder="1.500,00" />
        </label>
      )}
      {kind === 'category_budget' ? (
        <label className="field">
          <small>Categoria</small>
          <select name="categoryId" required defaultValue={initial?.categoryId ?? ''}>
            <option value="" disabled>
              {categories.length === 0 ? 'Nenhuma categoria ainda' : 'Escolha'}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field">
          <small>Quem recebe</small>
          <input name="match" maxLength={80} defaultValue={initial?.matchCounterparty ?? ''} placeholder="Marli" />
          <small className="hint">Parte do nome de quem recebe, ex.: Marli</small>
        </label>
      )}
      <button type="submit" className="btn">
        {initial ? 'Salvar' : 'Adicionar'}
      </button>
    </form>
  )
}
