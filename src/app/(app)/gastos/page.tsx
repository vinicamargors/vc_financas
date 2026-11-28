import Link from 'next/link'
import { Money } from '@/components/money'
import { PeriodPicker } from '@/components/period-picker'
import { byCategory, type ByCategory, type CategoryRow } from '@/lib/analysis/by-category'
import { comparable, comparison, parsePeriodSel, periodDays, periodQuery, resolvePeriod, type PeriodKind } from '@/lib/analysis/period'
import { loadAnalysisContext, loadCategories, loadTxs } from '@/lib/queries/analysis'
import { requireUser } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/sync/safe-error'

export const metadata = { title: 'Gastos' }
export const dynamic = 'force-dynamic'

const KINDS: readonly PeriodKind[] = ['ciclo', 'mes', 'semana', 'ano', 'livre']

type Search = { periodo?: string; ref?: string; de?: string; ate?: string }

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return null
  if (pct === 0) return <span>igual ao anterior</span>
  return <span className={pct > 0 ? 'up' : 'down'}>{`${pct > 0 ? '+' : '−'}${Math.abs(pct)}% vs anterior`}</span>
}

function Bar({ row, max }: { row: CategoryRow; max: number }) {
  const pct = row.limitCents ? Math.min(100, row.usagePct ?? 0) : max > 0 ? Math.max(0, (row.totalCents / max) * 100) : 0
  return (
    <span className={`cat-bar ${row.limitCents ? row.level : 'plain'}`} aria-hidden="true">
      <i style={{ width: `${pct.toFixed(1)}%` }} />
    </span>
  )
}

export default async function GastosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser()
  const ctx = await loadAnalysisContext(user.id)
  const sel = parsePeriodSel(await searchParams, ctx.today, KINDS)
  const period = resolvePeriod(sel, ctx.cycleAt)
  const cmp = comparison(period, ctx.today, ctx.cycleAt)
  const query = periodQuery(sel, ctx.today)

  let data: ByCategory | null = null
  try {
    const [categories, txs, prev] = await Promise.all([
      loadCategories(ctx.db),
      loadTxs(ctx.db, cmp.current, { today: ctx.today, spendOnly: true }),
      loadTxs(ctx.db, cmp.previous, { today: ctx.today, spendOnly: true }),
    ])
    data = byCategory(txs, prev, { categories, periodDays: periodDays(period) })
  } catch (e) {
    console.error(`carregar gastos falhou: ${safeErrorMessage(e)}`)
  }
  const max = data ? Math.max(0, ...data.rows.map((r) => r.totalCents)) : 0
  const fair = comparable(cmp)
  const totalDelta = fair && data && data.prevTotalCents > 0 ? Math.round(((data.totalCents - data.prevTotalCents) / data.prevTotalCents) * 100) : null

  return (
    <main>
      <div className="title-row">
        <h1 className="title">Gastos</h1>
        <Link href="/config/categorias" className="btn secondary">
          Limites
        </Link>
      </div>
      <PeriodPicker basePath="/gastos" period={period} today={ctx.today} kinds={KINDS} />

      {!data ? (
        <p className="msg err" role="alert">
          Não foi possível carregar os gastos. Tente de novo.
        </p>
      ) : (
        <>
          <section className="balance" aria-labelledby="total-titulo">
            <h2 id="total-titulo" className="label">
              Gasto real no período
            </h2>
            <p className="big">
              <Money cents={data.totalCents} currency="small" />
            </p>
            <p className="sub">
              {fair ? (
                <>
                  <Money cents={data.prevTotalCents} /> nos mesmos {cmp.days} {cmp.days === 1 ? 'dia' : 'dias'} do período anterior
                </>
              ) : (
                <>
                  <Money cents={data.prevTotalCents} /> no período anterior (anterior: {cmp.previousDays} {cmp.previousDays === 1 ? 'dia' : 'dias'}; este: {cmp.days})
                </>
              )}
              {totalDelta != null && (
                <>
                  {' · '}
                  <Delta pct={totalDelta} />
                </>
              )}
            </p>
            {data.pendingCents > 0 && (
              <p className="sub">
                <Link href="/revisar" className="pend">
                  + <Money cents={data.pendingCents} /> a confirmar
                </Link>
              </p>
            )}
          </section>

          {data.rows.length === 0 ? (
            <p className="empty">Nenhum gasto neste período.</p>
          ) : (
            <ul className="cat-list">
              {data.rows.map((r) => (
                <li key={r.key}>
                  <Link href={`/gastos/${r.key}?${query}`} className="cat-row">
                    <span className="cat-top">
                      <b>{r.name}</b>
                      <Money cents={r.totalCents} />
                    </span>
                    <Bar row={r} max={max} />
                    <span className="cat-meta">
                      {r.count > 0 && <span>{r.count === 1 ? '1 compra' : `${r.count} compras`}</span>}
                      {r.topPlace && <span>maior: {r.topPlace}</span>}
                      <Delta pct={fair ? r.deltaPct : null} />
                      {r.limitCents != null && (
                        <span className={r.level === 'ok' ? undefined : r.level}>
                          {r.usagePct}% de <Money cents={r.limitCents} />
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="faint cat-foot">
            Gasto = compras menos estornos, pela data da compra (cartão e VR inclusos). Transferências, faturas e caixinhas ficam fora.
          </p>
        </>
      )}
    </main>
  )
}
