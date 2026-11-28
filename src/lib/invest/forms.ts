import { parseMoneyCents } from '@/lib/commitments/form'

const NAME_MAX = 80

export type GoalValues = {
  name: string
  targetCents: number | null
  targetDate: string | null
  plannedMinCents: number | null
  plannedMaxCents: number | null
  includeFgts: boolean
  boxIds: string[]
}
export type GoalFormError = 'nome' | 'alvo' | 'data' | 'aporte' | 'faixa'

export type FgtsValues = {
  balanceCents: number
  balanceDate: string
  grossSalaryCents: number | null
  referenceNetCents: number | null
}
export type FgtsFormError = 'saldo' | 'data' | 'salario'

/** `YYYY-MM-DD` que existe no calendário. */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Vazio → null; inválido → undefined. */
function optionalMoney(raw: string): number | null | undefined {
  if (!raw) return null
  return parseMoneyCents(raw) ?? undefined
}

/** Valida o formulário de meta. `boxIds` vem dos checkboxes (duplicados removidos; posse checada pela FK/RLS). */
export function parseGoalForm(get: (k: string) => string | null, boxIds: string[]): { ok: true; value: GoalValues } | { ok: false; error: GoalFormError } {
  const str = (k: string) => (get(k) ?? '').trim()
  const name = str('name')
  if (!name || name.length > NAME_MAX) return { ok: false, error: 'nome' }
  const targetCents = optionalMoney(str('target'))
  if (targetCents === undefined) return { ok: false, error: 'alvo' }
  const targetDate = str('targetDate') || null
  if (targetDate && !isValidDate(targetDate)) return { ok: false, error: 'data' }
  const plannedMinCents = optionalMoney(str('min'))
  const plannedMaxCents = optionalMoney(str('max'))
  if (plannedMinCents === undefined || plannedMaxCents === undefined) return { ok: false, error: 'aporte' }
  if (plannedMinCents != null && plannedMaxCents != null && plannedMinCents > plannedMaxCents) return { ok: false, error: 'faixa' }
  return {
    ok: true,
    value: { name, targetCents, targetDate, plannedMinCents, plannedMaxCents, includeFgts: str('fgts') === 'on', boxIds: [...new Set(boxIds.filter(Boolean))] },
  }
}

/** Valida o formulário do FGTS. Saldo pode ser zero; data não pode ser futura; bruto e líquido vêm juntos. */
export function parseFgtsForm(get: (k: string) => string | null, today: string): { ok: true; value: FgtsValues } | { ok: false; error: FgtsFormError } {
  const str = (k: string) => (get(k) ?? '').trim()
  const rawBalance = str('balance')
  const balanceCents = /^0+([.,]0+)?$/.test(rawBalance) ? 0 : parseMoneyCents(rawBalance)
  if (balanceCents == null) return { ok: false, error: 'saldo' }
  const balanceDate = str('balanceDate')
  if (!isValidDate(balanceDate) || balanceDate > today) return { ok: false, error: 'data' }
  const grossSalaryCents = optionalMoney(str('gross'))
  const referenceNetCents = optionalMoney(str('net'))
  if (grossSalaryCents === undefined || referenceNetCents === undefined || (grossSalaryCents == null) !== (referenceNetCents == null))
    return { ok: false, error: 'salario' }
  return { ok: true, value: { balanceCents, balanceDate, grossSalaryCents, referenceNetCents } }
}
