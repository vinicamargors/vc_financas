import { realSpending } from '@/lib/queries/totals'
import { limitForPeriod } from './period'

/** Lançamento para a análise de gastos. `place`: estabelecimento (merchant ou descrição limpa). */
export type SpendTx = { id: string; date: string; amountCents: number; kind: string | null; categoryId: string | null; place: string }
export type CategoryInfo = { id: string; name: string; monthlyLimitCents: number | null }

export const UNCATEGORIZED_KEY = 'sem'
export const UNCATEGORIZED_NAME = 'Sem categoria'

export type CategoryRow = {
  /** Id da categoria ou `sem`. */
  key: string
  id: string | null
  name: string
  totalCents: number
  count: number
  prevCents: number
  /** Variação contra o período anterior, em %; null sem base de comparação. */
  deltaPct: number | null
  topPlace: string | null
  limitCents: number | null
  usagePct: number | null
  /** Barra: laranja acima de 80% do limite, vermelha acima de 100%. */
  level: 'ok' | 'warn' | 'over'
}

export type ByCategory = { totalCents: number; prevTotalCents: number; pendingCents: number; rows: CategoryRow[] }

/** Gasto conta só despesa e estorno (pela data da compra). */
export const isSpend = (kind: string | null) => kind === 'expense' || kind === 'refund'

type Acc = { total: number; count: number; places: Map<string, number> }

function accumulate(txs: SpendTx[], keyOf: (t: SpendTx) => string): Map<string, Acc> {
  const out = new Map<string, Acc>()
  for (const t of txs) {
    if (!isSpend(t.kind)) continue
    const k = keyOf(t)
    const a = out.get(k) ?? { total: 0, count: 0, places: new Map() }
    a.total -= t.amountCents
    if (t.kind === 'expense') a.count += 1
    a.places.set(t.place, (a.places.get(t.place) ?? 0) - t.amountCents)
    out.set(k, a)
  }
  return out
}

function topOf(places: Map<string, number>): string | null {
  let best: [string, number] | null = null
  for (const e of places) if (e[1] > 0 && (!best || e[1] > best[1] || (e[1] === best[1] && e[0] < best[0]))) best = e
  return best?.[0] ?? null
}

/** Gasto por categoria no período, com comparação, maior estabelecimento e limite proporcional. */
export function byCategory(txs: SpendTx[], prevTxs: SpendTx[], opts: { categories: CategoryInfo[]; periodDays: number }): ByCategory {
  const cats = new Map(opts.categories.map((c) => [c.id, c]))
  const keyOf = (t: SpendTx) => (t.categoryId && cats.has(t.categoryId) ? t.categoryId : UNCATEGORIZED_KEY)
  const cur = accumulate(txs, keyOf)
  const prev = accumulate(prevTxs, keyOf)

  const keys = new Set([...cur.keys(), ...prev.keys()])
  for (const c of opts.categories) if (c.monthlyLimitCents != null) keys.add(c.id)

  const rows: CategoryRow[] = [...keys].map((key) => {
    const cat = cats.get(key)
    const a = cur.get(key)
    const totalCents = a?.total ?? 0
    const prevCents = prev.get(key)?.total ?? 0
    const limitCents = limitForPeriod(cat?.monthlyLimitCents ?? null, opts.periodDays)
    const usagePct = limitCents && limitCents > 0 ? Math.round((totalCents / limitCents) * 100) : null
    const ratio = limitCents && limitCents > 0 ? totalCents / limitCents : 0
    return {
      key,
      id: cat?.id ?? null,
      name: cat?.name ?? UNCATEGORIZED_NAME,
      totalCents,
      count: a?.count ?? 0,
      prevCents,
      deltaPct: prevCents > 0 ? Math.round(((totalCents - prevCents) / prevCents) * 100) : null,
      topPlace: a ? topOf(a.places) : null,
      limitCents,
      usagePct,
      level: ratio > 1 ? 'over' : ratio > 0.8 ? 'warn' : 'ok',
    }
  })
  rows.sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'pt-BR'))

  const now = realSpending(txs)
  return { totalCents: now.spendingCents, prevTotalCents: realSpending(prevTxs).spendingCents, pendingCents: now.pendingCents, rows }
}

/** Maiores estabelecimentos por gasto líquido (despesa − estorno). */
export function byPlace(txs: SpendTx[], limit: number): { place: string; totalCents: number; count: number }[] {
  const acc = accumulate(txs, (t) => t.place)
  return [...acc.entries()]
    .map(([place, a]) => ({ place, totalCents: a.total, count: a.count }))
    .filter((p) => p.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents || a.place.localeCompare(b.place, 'pt-BR'))
    .slice(0, limit)
}
