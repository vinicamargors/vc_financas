import type { DateRule } from './businessDays'

export const DATE_RULES: readonly DateRule[] = ['penultimate_business_day', 'last_business_day', 'fifth_business_day', 'fixed_day']

export type SourceInput = {
  kind: 'salary' | 'extra'
  payerDoc: string | null
  payerName: string | null
  dateRule: DateRule
  fixedDay: number | null
}

/** Lê o formulário de "É meu salário" / "É renda extra". Renda extra não tem data prevista: usa o padrão. */
export function parseSourceForm(form: FormData): { ok: true; value: SourceInput } | { ok: false; error: 'dados' | 'dia' } {
  const kind = String(form.get('kind') ?? '')
  const payerDoc = String(form.get('payerDoc') ?? '').replace(/\D/g, '') || null
  const payerName = String(form.get('payerName') ?? '').trim() || null
  if ((kind !== 'salary' && kind !== 'extra') || (!payerDoc && !payerName)) return { ok: false, error: 'dados' }
  if (kind === 'extra') return { ok: true, value: { kind, payerDoc, payerName, dateRule: 'penultimate_business_day', fixedDay: null } }
  const dateRule = String(form.get('dateRule') ?? '') as DateRule
  if (!DATE_RULES.includes(dateRule)) return { ok: false, error: 'dados' }
  const fixedDay = Number(form.get('fixedDay'))
  if (dateRule === 'fixed_day' && !(Number.isInteger(fixedDay) && fixedDay >= 1 && fixedDay <= 31)) return { ok: false, error: 'dia' }
  return { ok: true, value: { kind, payerDoc, payerName, dateRule, fixedDay: dateRule === 'fixed_day' ? fixedDay : null } }
}
