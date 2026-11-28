import { BANK_CARD_PAYMENT, type Kind } from '@/lib/classify/classify'
import { normalizeText } from '@/lib/classify/normalize'
import { prettyDescription } from '@/lib/format/description'
import { daysBetween } from './businessDays'

export type FreeTx = {
  id: string
  date: string
  amountCents: number
  kind: Kind | null
  accountType: 'BANK' | 'CREDIT'
  categoryId: string | null
  counterpartyName: string | null
  descriptionRaw: string
}

export type CommitmentInput = {
  id: string
  name: string
  kind: 'fixed' | 'category_budget' | 'percent_of_income'
  amountCents: number | null
  percent: number | null
  percentBase: 'salary' | 'all'
  categoryId: string | null
  matchCounterparty: string | null
}

export type FreeInput = {
  cycle: { start: string; end: string }
  today: string
  salaryCents: number
  extrasCents: number
  commitments: CommitmentInput[]
  /** Lançamentos do ciclo (os de fora do intervalo são ignorados). */
  txs: FreeTx[]
  /** Compras no cartão do ciclo anterior. */
  cardEstimateCents: number
  /** Pagamentos de fatura (`card_payment` no banco) no ciclo. */
  cardPaidCents: number
}

export type CommitmentStatus = 'done' | 'partial' | 'todo'
export type CommitmentResult = { id: string; name: string; expectedCents: number; paidCents: number; status: CommitmentStatus }

export type FreeResult = {
  freeCents: number
  freePerDayCents: number
  daysLeft: number
  commitments: CommitmentResult[]
  cardThisCycleCents: number
}

export const CARD_COMMITMENT_ID = 'card'

/** Saída de caixa: no banco, valor negativo, despesa ou ainda a confirmar. */
function isCashOut(t: FreeTx): boolean {
  return t.accountType === 'BANK' && t.amountCents < 0 && (t.kind === 'expense' || t.kind === 'pending_review' || t.kind === null)
}

/** Saída a confirmar com texto de pagamento de fatura: já entra pela fatura, não conta de novo. */
function looksLikeCardPayment(t: FreeTx): boolean {
  return t.kind === 'pending_review' && BANK_CARD_PAYMENT.test(normalizeText(t.descriptionRaw))
}

function status(expected: number, paid: number): CommitmentStatus {
  if (paid > 0 && paid >= expected) return 'done'
  return paid > 0 ? 'partial' : 'todo'
}

/**
 * Livre do ciclo (dinheiro em caixa): salário + extras − Σ max(esperado, pago) dos compromissos
 * (fatura inclusa) − saídas no banco que não casaram com nenhum compromisso. Compra no cartão não
 * entra (só informa `cardThisCycleCents`); transferência, aporte, resgate e rendimento ficam fora.
 */
export function computeFree(input: FreeInput): FreeResult {
  const { cycle, today, salaryCents, extrasCents } = input
  const txs = input.txs.filter((t) => t.date >= cycle.start && t.date <= cycle.end)
  const matched = new Set<string>()
  const text = (t: FreeTx) => [normalizeText(t.counterpartyName), normalizeText(prettyDescription(t.descriptionRaw)), normalizeText(t.descriptionRaw)]

  const paidByMatch = (pattern: string | null): number => {
    const p = normalizeText(pattern)
    if (!p) return 0
    let paid = 0
    for (const t of txs) {
      if (matched.has(t.id) || !isCashOut(t) || !text(t).some((x) => x.includes(p))) continue
      matched.add(t.id)
      paid += -t.amountCents
    }
    return paid
  }

  // Quanto cada compromisso tira do livre (o cartão nunca entra aqui: só a fatura).
  const reserves: number[] = []
  const commitments: CommitmentResult[] = input.commitments.map((c) => {
    let expected = 0
    let paid = 0
    let cashPaid: number | null = null
    if (c.kind === 'fixed') {
      expected = c.amountCents ?? 0
      paid = paidByMatch(c.matchCounterparty)
    } else if (c.kind === 'category_budget') {
      expected = c.amountCents ?? 0
      let bank = 0
      let card = 0
      for (const t of txs) {
        if (!c.categoryId || t.categoryId !== c.categoryId) continue
        if (t.accountType === 'CREDIT') {
          // Compra no cartão: só para mostrar quanto do orçamento já foi; nunca casa nem sai do caixa.
          if (t.kind === 'expense' || t.kind === 'refund') card -= t.amountCents
        } else if (!matched.has(t.id) && (isCashOut(t) || t.kind === 'refund')) {
          matched.add(t.id)
          bank -= t.amountCents
        }
      }
      cashPaid = Math.max(0, bank)
      paid = Math.max(0, bank + card)
    } else {
      const base = c.percentBase === 'all' ? salaryCents + extrasCents : salaryCents
      expected = Math.round(((c.percent ?? 0) * base) / 100)
      paid = paidByMatch(c.matchCounterparty)
    }
    reserves.push(Math.max(expected, cashPaid ?? paid))
    return { id: c.id, name: c.name, expectedCents: expected, paidCents: paid, status: status(expected, paid) }
  })

  const cardExpected = Math.max(input.cardEstimateCents, input.cardPaidCents)
  if (cardExpected > 0) {
    commitments.push({
      id: CARD_COMMITMENT_ID, name: 'Fatura do cartão', expectedCents: cardExpected, paidCents: input.cardPaidCents,
      status: status(cardExpected, input.cardPaidCents),
    })
    reserves.push(Math.max(cardExpected, input.cardPaidCents))
  }

  let outside = 0
  let cardThisCycleCents = 0
  for (const t of txs) {
    if (t.accountType === 'CREDIT') {
      if (t.kind === 'expense' || t.kind === 'refund') cardThisCycleCents -= t.amountCents
    } else if (!matched.has(t.id) && isCashOut(t) && !looksLikeCardPayment(t)) outside -= t.amountCents
  }

  const reserved = reserves.reduce((s, r) => s + r, 0)
  const freeCents = salaryCents + extrasCents - reserved - outside
  const daysLeft = Math.max(1, daysBetween(today, cycle.end) + 1)
  const freePerDayCents = freeCents > 0 ? Math.floor(freeCents / daysLeft) : 0
  return { freeCents, freePerDayCents, daysLeft, commitments, cardThisCycleCents }
}
