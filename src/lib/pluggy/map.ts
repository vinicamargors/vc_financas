import type { Account, Transaction } from 'pluggy-sdk'
import { isDateOnly, transactionDate } from '@/lib/format/date'

export interface AccountRow {
  userId: string
  connectionId: string
  externalId: string
  type: 'BANK' | 'CREDIT'
  subtype: string | null
  name: string
  institution: string
  /** Logo do banco (Pluggy), quando conhecido. */
  logoUrl?: string | null
  balanceCents: number
  creditLimitCents: number | null
  closingDay: number | null
  dueDay: number | null
}

export interface TransactionRow {
  userId: string
  accountId: string
  externalId: string
  source: 'pluggy'
  date: string
  /** Instante do lançamento quando a Pluggy informa hora; nulo para lançamentos só com data. */
  occurredAt: string | null
  amountCents: number
  descriptionRaw: string
  pluggyCategory: string | null
  counterpartyName: string | null
  counterpartyDoc: string | null
  paymentMethod: string | null
  installmentNumber: number | null
  installmentTotal: number | null
  cardLast4: string | null
  status: string | null
  raw: Transaction
}

const toCents = (x: number) => Math.round(x * 100)

/** Dia do mês da data (a Pluggy envia datas de calendário em UTC meia-noite). */
function dayOfMonth(d: Date | null | undefined): number | null {
  if (!d) return null
  const date = d instanceof Date ? d : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date.getUTCDate()
}

export function mapAccount(
  a: Account,
  ctx: { userId: string; connectionId: string; institution: string; logoUrl?: string | null },
): AccountRow {
  const credit = a.creditData
  return {
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    externalId: a.id,
    type: a.type,
    subtype: a.subtype ?? null,
    name: a.name,
    institution: ctx.institution,
    logoUrl: ctx.logoUrl ?? null,
    balanceCents: toCents(a.balance),
    creditLimitCents: credit?.creditLimit != null ? toCents(credit.creditLimit) : null,
    closingDay: dayOfMonth(credit?.balanceCloseDate),
    dueDay: dayOfMonth(credit?.balanceDueDate),
  }
}

export function mapTransaction(
  t: Transaction,
  ctx: { userId: string; accountRowId: string; accountType: 'BANK' | 'CREDIT' },
): TransactionRow {
  // Sinal vem do `type` (DEBIT sai, CREDIT entra); o sinal do `amount` varia por tipo de conta.
  const cents = toCents(Math.abs(t.amount))
  const amountCents = t.type === 'DEBIT' ? -cents : cents
  const party = t.type === 'CREDIT' ? t.paymentData?.payer : t.paymentData?.receiver
  const doc = party?.documentNumber?.value?.replace(/\D/g, '') || null
  const cc = t.creditCardMetadata
  return {
    userId: ctx.userId,
    accountId: ctx.accountRowId,
    externalId: t.id,
    source: 'pluggy',
    date: transactionDate(t.date),
    occurredAt: isDateOnly(t.date) ? null : new Date(t.date).toISOString(),
    amountCents: amountCents === 0 ? 0 : amountCents,
    descriptionRaw: t.descriptionRaw ?? t.description,
    pluggyCategory: t.category ?? null,
    counterpartyName: party?.name ?? null,
    counterpartyDoc: doc,
    paymentMethod: t.paymentData?.paymentMethod ?? null,
    installmentNumber: cc?.installmentNumber ?? null,
    installmentTotal: cc?.totalInstallments ?? null,
    cardLast4: cc?.cardNumber ?? null,
    status: t.status ?? null,
    raw: t,
  }
}
