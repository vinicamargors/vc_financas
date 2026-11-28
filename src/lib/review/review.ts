import type { Kind, Rule } from '@/lib/classify/classify'
import { patternFor } from './places'

export type PendingChoice = 'expense' | 'transfer' | 'loan' | 'other'

export interface TxPatch {
  kind: Kind
  classifiedBy: 'auto' | 'user'
  categoryId?: string | null
  merchantId?: string | null
  linkedTransactionId?: string | null
}

export interface ReviewTx {
  id: string
  descriptionRaw: string
  linkedTransactionId: string | null
}

/** Leituras/escritas da revisão. Toda implementação filtra por `userId`. */
export interface ReviewStore {
  getTransaction(userId: string, id: string): Promise<ReviewTx | null>
  /** Aplica o patch; com `onlyAutoExpense`, só nas linhas ainda `expense` e automáticas. Devolve quantas mudou. */
  patchTransactions(userId: string, ids: string[], patch: TxPatch, opts?: { onlyAutoExpense?: boolean }): Promise<number>
  /** Estabelecimento com o mesmo nome (sem diferenciar maiúsculas) ou um novo. */
  findOrCreateMerchant(userId: string, displayName: string, categoryId: string | null): Promise<string>
  upsertRule(userId: string, rule: Rule): Promise<void>
  reclassify(userId: string): Promise<void>
}

const CHOICES = new Set<PendingChoice>(['expense', 'transfer', 'loan', 'other'])

/**
 * "A confirmar". Transferência/Empréstimo: a linha e o par ligado viram transferência do usuário,
 * mantendo a ligação. Gasto/Outro: desfaz o par; a linha vira gasto do usuário (Outro com categoria)
 * e o parceiro volta para `pending_review` automático, para o classificador decidir de novo.
 */
export async function confirmPendingCore(
  store: ReviewStore,
  userId: string,
  txId: string,
  choice: PendingChoice,
  categoryId?: string | null,
): Promise<void> {
  if (!txId || !CHOICES.has(choice)) throw new Error('Escolha inválida')
  if (choice === 'other' && !categoryId) throw new Error('Escolha uma categoria')
  const tx = await store.getTransaction(userId, txId)
  if (!tx) throw new Error('Lançamento não encontrado')
  const partner = tx.linkedTransactionId

  if (choice === 'transfer' || choice === 'loan') {
    const ids = partner ? [tx.id, partner] : [tx.id]
    await store.patchTransactions(userId, ids, { kind: 'transfer', classifiedBy: 'user', categoryId: null })
  } else {
    const cat = choice === 'other' ? (categoryId ?? null) : null
    await store.patchTransactions(userId, [tx.id], { kind: 'expense', classifiedBy: 'user', categoryId: cat, linkedTransactionId: null })
    if (partner) {
      await store.patchTransactions(userId, [partner], { kind: 'pending_review', classifiedBy: 'auto', linkedTransactionId: null })
    }
  }
  await store.reclassify(userId)
}

export interface TeachPlaceInput {
  displayName: string
  categoryId: string | null
  /** Ids do grupo; o primeiro é a linha editada (a mais recente), de onde sai o padrão. */
  ids: string[]
  remember: boolean
}

/**
 * "Novos lugares". O padrão é recalculado aqui a partir da descrição gravada (nunca vem do cliente).
 * Com "lembrar": grava a regra, marca só a linha editada e reclassifica o resto. Sem: marca as linhas
 * do grupo que ainda são gasto automático.
 */
export async function teachPlaceCore(store: ReviewStore, userId: string, input: TeachPlaceInput): Promise<void> {
  const name = input.displayName.trim()
  if (!name || input.ids.length === 0) throw new Error('Dados inválidos')
  const tx = await store.getTransaction(userId, input.ids[0])
  const pattern = tx ? patternFor(tx.descriptionRaw) : null
  if (!pattern) throw new Error('Descrição genérica demais para virar regra')

  const merchantId = await store.findOrCreateMerchant(userId, name, input.categoryId)
  const ids = input.remember ? input.ids.slice(0, 1) : input.ids
  const changed = await store.patchTransactions(
    userId,
    ids,
    { kind: 'expense', classifiedBy: 'user', categoryId: input.categoryId, merchantId },
    { onlyAutoExpense: true },
  )
  if (changed === 0) throw new Error('Nenhum lançamento alterado')
  if (input.remember) {
    await store.upsertRule(userId, { matchField: 'description', pattern, merchantId, categoryId: input.categoryId, kind: null })
    await store.reclassify(userId)
  }
}
