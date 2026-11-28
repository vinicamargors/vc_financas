import { minusDays } from '@/lib/sync/classification'

/** Só estes tipos entram no total do dia do extrato; os demais aparecem, mas não somam. */
const DAY_TOTAL_KINDS = new Set(['expense', 'income', 'refund'])

export function countsInDayTotal(kind: string | null): boolean {
  return kind !== null && DAY_TOTAL_KINDS.has(kind)
}

export type SpendRow = { kind: string | null; amountCents: number }

/**
 * Gasto real = despesas menos estornos (centavos positivos). Transferência, fatura, aporte, resgate,
 * rendimento, entrada, `pending_review` e `kind` nulo ficam fora. `pendingCents` é o valor absoluto
 * das saídas (negativas) que ainda estão "a confirmar", mostrado ao lado e nunca somado ao gasto.
 */
export function realSpending(rows: SpendRow[]): { spendingCents: number; pendingCents: number } {
  let net = 0
  let pending = 0
  for (const r of rows) {
    if (r.kind === 'expense' || r.kind === 'refund') net += r.amountCents
    else if (r.kind === 'pending_review' && r.amountCents < 0) pending += -r.amountCents
  }
  return { spendingCents: 0 - net, pendingCents: pending }
}

/** Início da janela de 30 dias (hoje incluso), em data local. Usada pelo Início e pela Revisar. */
export const RECENT_DAYS = 30
export function recentWindowStart(today: string): string {
  return minusDays(today, RECENT_DAYS - 1)
}

export const PAGE_SIZE = 1000

/** Soma o gasto real lendo `fetchPage(from, to)` (intervalo inclusivo) até uma página curta. */
export async function sumRealSpending(
  fetchPage: (from: number, to: number) => Promise<SpendRow[]>,
): Promise<{ spendingCents: number; pendingCents: number }> {
  const rows: SpendRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await fetchPage(from, from + PAGE_SIZE - 1)
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return realSpending(rows)
}
