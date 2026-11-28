import { normalizeText, onlyDigits } from '@/lib/classify/normalize'
import type { DateRule } from '@/lib/cycle/businessDays'
import { prettyDescription } from '@/lib/format/description'
import { toLocalDate } from '@/lib/format/date'
import { createServerSupabase } from '@/lib/supabase/server'
import { minusDays } from '@/lib/sync/classification'

/** Entradas a partir de R$ 1.000 aparecem como candidatas a salário. */
export const SALARY_MIN_CENTS = 100_000
const WINDOW_DAYS = 90

export type IncomeCandidate = {
  date: string
  amountCents: number
  counterpartyDoc: string | null
  counterpartyName: string | null
  descriptionRaw: string
}

export type PayerGroup = {
  key: string
  label: string
  payerDoc: string | null
  payerName: string
  count: number
  lastDate: string
  lastAmountCents: number
}

export type IncomeSourceRow = {
  id: string
  kind: 'salary' | 'extra'
  payerDoc: string | null
  payerName: string | null
  dateRule: DateRule
  fixedDay: number | null
}

/**
 * Agrupa entradas por pagador: documento (só dígitos), senão nome, senão descrição legível.
 * Esconde grupos que já são fonte salva. Mais recente primeiro.
 */
export function groupPayers(rows: IncomeCandidate[], saved: { payerDoc: string | null; payerName: string | null }[]): PayerGroup[] {
  const savedDocs = new Set(saved.map((s) => onlyDigits(s.payerDoc)).filter(Boolean))
  const savedNames = new Set(saved.map((s) => normalizeText(s.payerName)).filter(Boolean))
  const groups = new Map<string, PayerGroup>()
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (r.amountCents < SALARY_MIN_CENTS) continue
    const doc = onlyDigits(r.counterpartyDoc) || null
    const name = r.counterpartyName?.trim() || prettyDescription(r.descriptionRaw)
    const key = doc ?? normalizeText(name)
    if (!key || (doc && savedDocs.has(doc)) || savedNames.has(normalizeText(name))) continue
    const g = groups.get(key)
    groups.set(key, {
      key,
      label: name,
      payerDoc: doc,
      payerName: name,
      count: (g?.count ?? 0) + 1,
      lastDate: r.date,
      lastAmountCents: r.amountCents,
    })
  }
  return [...groups.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.label.localeCompare(b.label))
}

export function incomeSourceFromDb(r: Record<string, unknown>): IncomeSourceRow {
  return {
    id: r.id as string,
    kind: r.kind as IncomeSourceRow['kind'],
    payerDoc: (r.payer_doc as string | null) ?? null,
    payerName: (r.payer_name as string | null) ?? null,
    dateRule: r.date_rule as DateRule,
    fixedDay: (r.fixed_day as number | null) ?? null,
  }
}

export const INCOME_SOURCE_COLUMNS = 'id, kind, payer_doc, payer_name, date_rule, fixed_day'

/** Tela de salário: fontes salvas e pagadores das entradas grandes dos últimos 90 dias (RLS). */
export async function loadSalarySetup(): Promise<{ sources: IncomeSourceRow[]; payers: PayerGroup[] }> {
  const db = await createServerSupabase()
  const today = toLocalDate(new Date())
  const [sources, txs] = await Promise.all([
    db.from('income_sources').select(INCOME_SOURCE_COLUMNS).order('created_at'),
    db
      .from('transactions')
      .select('date, amount_cents, counterparty_doc, counterparty_name, description_raw')
      .eq('kind', 'income')
      .is('deleted_at', null)
      .gte('amount_cents', SALARY_MIN_CENTS)
      .gte('date', minusDays(today, WINDOW_DAYS - 1))
      .order('date', { ascending: false })
      .limit(1000),
  ])
  if (sources.error) throw sources.error
  if (txs.error) throw txs.error
  const saved = (sources.data ?? []).map(incomeSourceFromDb)
  const rows: IncomeCandidate[] = (txs.data ?? []).map((t) => ({
    date: t.date as string,
    amountCents: Number(t.amount_cents),
    counterpartyDoc: (t.counterparty_doc as string | null) ?? null,
    counterpartyName: (t.counterparty_name as string | null) ?? null,
    descriptionRaw: t.description_raw as string,
  }))
  return { sources: saved, payers: groupPayers(rows, saved) }
}
