import 'server-only'
import type { Kind } from '@/lib/classify/classify'
import type { CategoryInfo, SpendTx } from '@/lib/analysis/by-category'
import { makeCycleAt, type CycleContext } from '@/lib/analysis/cycles'
import type { CycleAt, Range } from '@/lib/analysis/period'
import type { DateRule } from '@/lib/cycle/businessDays'
import { pickSalaries } from '@/lib/cycle/salary'
import { toLocalDate } from '@/lib/format/date'
import { prettyDescription } from '@/lib/format/description'
import { createServerSupabase } from '@/lib/supabase/server'
import { minusDays } from '@/lib/sync/classification'
import { classifierAccountType } from '@/lib/sync/repo'
import { safeErrorMessage } from '@/lib/sync/safe-error'
import { INCOME_SOURCE_COLUMNS, incomeSourceFromDb, type IncomeSourceRow } from './salary'
import { PAGE_SIZE } from './totals'

type Db = Awaited<ReturnType<typeof createServerSupabase>>
export type AccountType = 'BANK' | 'CREDIT' | 'BENEFIT'

/** Janela lida para reconhecer salários (e assim navegar por ciclos antigos). */
const SALARY_WINDOW_DAYS = 730

export type AnalysisContext = {
  db: Db
  today: string
  cycleAt: CycleAt
  sources: IncomeSourceRow[]
  salaries: { id: string; date: string; amountCents: number; incomeSourceId: string | null }[]
  accountTypes: Map<string, AccountType>
}

/** Lê páginas de 1000 até uma página curta (nunca confia no limite do PostgREST). */
export async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if ((data ?? []).length < PAGE_SIZE) break
  }
  return out
}

/**
 * Salários, regra do ciclo e tipos de conta, com o cliente do usuário (RLS). Sem fonte de salário,
 * ou se algo falhar, os ciclos viram meses do calendário: a tela continua de pé.
 */
export async function loadAnalysisContext(userId: string): Promise<AnalysisContext> {
  const db = await createServerSupabase()
  const today = toLocalDate(new Date())
  const empty: AnalysisContext = { db, today, cycleAt: makeCycleAt({ salaryDates: [], rule: null, fixedDay: null }), sources: [], salaries: [], accountTypes: new Map() }
  try {
    const [sources, accounts] = await Promise.all([
      db.from('income_sources').select(INCOME_SOURCE_COLUMNS).eq('user_id', userId).order('created_at'),
      db.from('accounts').select('id, type, external_id').eq('user_id', userId),
    ])
    const accountTypes = new Map<string, AccountType>(
      (accounts.data ?? []).map((a) => [
        a.id as string,
        a.type === 'BENEFIT' ? 'BENEFIT' : classifierAccountType(a.type as string, a.external_id as string | null),
      ]),
    )
    if (sources.error) return { ...empty, accountTypes }
    const srcs = (sources.data ?? []).map(incomeSourceFromDb)
    const salarySource = srcs.find((s) => s.kind === 'salary')
    const incomes = (
      await readAll((from, to) =>
        db
          .from('transactions')
          .select('id, account_id, date, amount_cents, income_source_id')
          .eq('kind', 'income')
          .gt('amount_cents', 0)
          .is('deleted_at', null)
          .gte('date', minusDays(today, SALARY_WINDOW_DAYS))
          .order('id')
          .range(from, to),
      )
    )
      .filter((t) => accountTypes.get(t.account_id as string) === 'BANK')
      .map((t) => ({ id: t.id as string, date: t.date as string, amountCents: Number(t.amount_cents), incomeSourceId: (t.income_source_id as string | null) ?? null }))
    const salaries = pickSalaries(incomes, srcs)
    const ctx: CycleContext = {
      salaryDates: salaries.map((s) => s.date),
      rule: (salarySource?.dateRule as DateRule | undefined) ?? null,
      fixedDay: salarySource?.fixedDay ?? null,
    }
    return { db, today, cycleAt: makeCycleAt(ctx), sources: srcs, salaries, accountTypes }
  } catch (e) {
    console.error(`carregar contexto de análise falhou: ${safeErrorMessage(e)}`)
    return empty
  }
}

/** Categorias com limite mensal. Sem a coluna do limite, lê só nome (limites somem). */
export async function loadCategories(db: Db): Promise<CategoryInfo[]> {
  const full = await db.from('categories').select('id, name, monthly_limit_cents').order('name')
  if (!full.error) {
    return (full.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      monthlyLimitCents: c.monthly_limit_cents == null ? null : Number(c.monthly_limit_cents),
    }))
  }
  const basic = await db.from('categories').select('id, name').order('name')
  if (basic.error) return []
  return (basic.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, monthlyLimitCents: null }))
}

export type AnalysisTx = SpendTx & {
  accountId: string
  kind: Kind | null
  descriptionRaw: string
  counterpartyName: string | null
  incomeSourceId: string | null
}

const COLUMNS = 'id, account_id, date, amount_cents, kind, category_id, description_raw, counterparty_name, income_source_id, merchants(display_name)'

/**
 * Lançamentos não apagados do intervalo (até hoje: parcelas futuras ficam fora).
 * `spendOnly` traz só despesa, estorno e "a confirmar". `category` filtra por id ou `sem`.
 */
export async function loadTxs(db: Db, range: Range, opts: { today: string; spendOnly?: boolean; category?: string } = { today: range.end }): Promise<AnalysisTx[]> {
  const end = range.end < opts.today ? range.end : opts.today
  if (range.start > end) return []
  const rows = await readAll((from, to) => {
    let q = db.from('transactions').select(COLUMNS).is('deleted_at', null).gte('date', range.start).lte('date', end)
    if (opts.spendOnly) q = q.or('kind.in.(expense,refund,pending_review),kind.is.null')
    if (opts.category === 'sem') q = q.is('category_id', null)
    else if (opts.category) q = q.eq('category_id', opts.category)
    return q.order('id').range(from, to)
  })
  return rows.map((t) => {
    const merchant = Array.isArray(t.merchants) ? t.merchants[0] : t.merchants
    const raw = (t.description_raw as string) ?? ''
    return {
      id: t.id as string,
      accountId: t.account_id as string,
      date: t.date as string,
      amountCents: Number(t.amount_cents),
      kind: (t.kind as Kind | null) ?? null,
      categoryId: (t.category_id as string | null) ?? null,
      place: (merchant as { display_name?: string } | null)?.display_name?.trim() || prettyDescription(raw) || 'Sem descrição',
      descriptionRaw: raw,
      counterpartyName: (t.counterparty_name as string | null) ?? null,
      incomeSourceId: (t.income_source_id as string | null) ?? null,
    }
  })
}
