import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money } from '@/components/money'
import { PeriodPicker } from '@/components/period-picker'
import { isSpend, UNCATEGORIZED_KEY, UNCATEGORIZED_NAME } from '@/lib/analysis/by-category'
import { parsePeriodSel, periodQuery, resolvePeriod, type PeriodKind } from '@/lib/analysis/period'
import { isCategoryKey } from '@/lib/categories/form'
import { formatDayLabel } from '@/lib/format/date'
import { loadAnalysisContext, loadCategories, loadTxs, type AnalysisTx } from '@/lib/queries/analysis'
import { requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

export const metadata = { title: 'Gastos da categoria' }
export const dynamic = 'force-dynamic'

const KINDS: readonly PeriodKind[] = ['ciclo', 'mes', 'semana', 'ano', 'livre']

export default async function CategoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoria: string }>
  searchParams: Promise<{ periodo?: string; ref?: string; de?: string; ate?: string }>
}) {
  const user = await requireUser()
  const { categoria } = await params
  if (!isCategoryKey(categoria)) notFound()
  const ctx = await loadAnalysisContext(user.id)
  const sel = parsePeriodSel(await searchParams, ctx.today, KINDS)
  const period = resolvePeriod(sel, ctx.cycleAt)

  let txs: AnalysisTx[] | null = null
  let name = UNCATEGORIZED_NAME
  try {
    const [categories, rows] = await Promise.all([
      loadCategories(ctx.db),
      loadTxs(ctx.db, period, { today: ctx.today, spendOnly: true, category: categoria }),
    ])
    if (categoria !== UNCATEGORIZED_KEY) {
      const cat = categories.find((c) => c.id === categoria)
      if (!cat) notFound()
      name = cat.name
    }
    txs = rows.filter((t) => isSpend(t.kind)).sort((a, b) => b.date.localeCompare(a.date) || a.amountCents - b.amountCents)
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error(`carregar categoria falhou: ${safeErrorMessage(e)}`)
  }

  const days = new Map<string, AnalysisTx[]>()
  for (const t of txs ?? []) days.set(t.date, [...(days.get(t.date) ?? []), t])
  const total = (txs ?? []).reduce((s, t) => s - t.amountCents, 0)

  return (
    <main>
      <h1 className="title">{name}</h1>
      <PeriodPicker basePath={`/gastos/${categoria}`} period={period} today={ctx.today} kinds={KINDS} />
      {txs == null ? (
        <p className="msg err" role="alert">
          Não foi possível carregar. Tente de novo.
        </p>
      ) : (
        <>
          <section className="balance">
            <h2 className="label">Gasto no período</h2>
            <p className="big">
              <Money cents={total} currency="small" />
            </p>
            <p className="sub">{txs.length === 1 ? '1 lançamento' : `${txs.length} lançamentos`}</p>
          </section>
          {txs.length === 0 && <p className="empty">Nenhum gasto nesta categoria no período.</p>}
          {[...days.entries()].map(([date, items]) => (
            <section key={date} aria-label={formatDayLabel(date)}>
              <h2 className="day">
                <span>{formatDayLabel(date)}</span>
                <Money cents={items.reduce((s, t) => s + t.amountCents, 0)} sign />
              </h2>
              <ul className="tx-list">
                {items.map((t) => (
                  <li key={t.id} className="tx tx-plain">
                    <span className="nm">
                      <b>{t.place}</b>
                      {t.kind === 'refund' && <span>Estorno</span>}
                    </span>
                    <Money cents={t.amountCents} sign className={`am${t.amountCents > 0 ? ' in' : ''}`} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <p className="cat-foot">
        <Link href={`/gastos?${periodQuery(sel, ctx.today)}`} className="ghost-link">
          Voltar para Gastos
        </Link>
      </p>
    </main>
  )
}
