/** Só estes tipos entram no total do dia do extrato; os demais aparecem, mas não somam. */
const DAY_TOTAL_KINDS = new Set(['expense', 'income', 'refund'])

export function countsInDayTotal(kind: string | null): boolean {
  return kind !== null && DAY_TOTAL_KINDS.has(kind)
}

export type SpendRow = { kind: string | null; amountCents: number }

/**
 * Gasto real = despesas menos estornos (centavos positivos). Transferência, fatura, aporte, resgate,
 * rendimento, entrada, `pending_review` e `kind` nulo ficam fora. `pendingCents` é o valor absoluto
 * do que ainda está "a confirmar", mostrado ao lado e nunca somado ao gasto.
 */
export function realSpending(rows: SpendRow[]): { spendingCents: number; pendingCents: number } {
  let net = 0
  let pending = 0
  for (const r of rows) {
    if (r.kind === 'expense' || r.kind === 'refund') net += r.amountCents
    else if (r.kind === 'pending_review') pending += Math.abs(r.amountCents)
  }
  return { spendingCents: 0 - net, pendingCents: pending }
}
