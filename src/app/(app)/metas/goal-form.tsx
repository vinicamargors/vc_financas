import type { GoalRow } from '@/lib/queries/invest'

/** Centavos → "1500,00" para o campo de texto. */
const centsField = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))

/** Formulário de meta (servidor; sem estado no cliente). */
export function GoalForm({
  action,
  boxes,
  initial,
  submitLabel,
}: {
  action: (form: FormData) => Promise<void>
  boxes: { id: string; name: string | null }[]
  initial?: GoalRow
  submitLabel: string
}) {
  return (
    <form action={action} className="cm-form">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="field">
        <small>Nome</small>
        <input name="name" required maxLength={80} defaultValue={initial?.name ?? ''} placeholder="Casa" />
      </label>
      <fieldset className="field">
        <small>Caixinhas da meta</small>
        {boxes.length === 0 && <span className="faint">Nenhuma caixinha conectada ainda.</span>}
        {boxes.map((b) => (
          <label key={b.id} className="check-row">
            <input type="checkbox" name="box" value={b.id} defaultChecked={initial?.boxIds.includes(b.id)} />
            {b.name ?? 'Caixinha'}
          </label>
        ))}
        <label className="check-row">
          <input type="checkbox" name="fgts" defaultChecked={initial?.includeFgts} />
          Incluir o FGTS
        </label>
      </fieldset>
      <label className="field">
        <small>Aporte planejado mínimo por mês (R$)</small>
        <input name="min" inputMode="decimal" defaultValue={centsField(initial?.plannedMinCents ?? null)} placeholder="1.000,00" />
      </label>
      <label className="field">
        <small>Aporte planejado máximo por mês (R$)</small>
        <input name="max" inputMode="decimal" defaultValue={centsField(initial?.plannedMaxCents ?? null)} placeholder="2.000,00" />
      </label>
      <label className="field">
        <small>Alvo (R$, opcional)</small>
        <input name="target" inputMode="decimal" defaultValue={centsField(initial?.targetCents ?? null)} placeholder="100.000,00" />
      </label>
      <label className="field">
        <small>Data-alvo (opcional)</small>
        <input name="targetDate" type="date" defaultValue={initial?.targetDate ?? ''} />
      </label>
      <button type="submit" className="btn">
        {submitLabel}
      </button>
    </form>
  )
}

export const GOAL_ERRORS: Record<string, string> = {
  nome: 'Dê um nome de até 80 letras.',
  alvo: 'Informe um alvo válido ou deixe em branco.',
  data: 'Informe uma data-alvo válida, a partir de hoje.',
  caixinha: 'Escolha caixinhas da lista.',
  aporte: 'Informe aportes válidos ou deixe em branco.',
  faixa: 'O aporte mínimo não pode passar do máximo.',
  falha: 'Não foi possível salvar. Tente de novo.',
}
