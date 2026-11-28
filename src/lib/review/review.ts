import type { Kind, Rule } from '@/lib/classify/classify'

export type PendingChoice = 'expense' | 'transfer' | 'loan' | 'other'

export interface TxPatch {
  kind: Kind
  categoryId: string | null
  merchantId?: string | null
}

/** Escritas da revisão. Toda implementação filtra por `userId`. */
export interface ReviewStore {
  /** Grava o patch e marca `classified_by = 'user'`. */
  updateTransactions(userId: string, ids: string[], patch: TxPatch): Promise<void>
  createMerchant(userId: string, displayName: string, categoryId: string | null): Promise<string>
  upsertRule(userId: string, rule: Rule): Promise<void>
  reclassify(userId: string): Promise<void>
}

const PENDING_KIND: Record<PendingChoice, Kind> = { expense: 'expense', transfer: 'transfer', loan: 'transfer', other: 'expense' }

/** "A confirmar": Gasto, Transferência minha, Empréstimo (transferência sem categoria) ou Outro (gasto com categoria). */
export async function confirmPendingCore(
  store: ReviewStore,
  userId: string,
  txId: string,
  choice: PendingChoice,
  categoryId?: string | null,
): Promise<void> {
  if (!txId || !Object.hasOwn(PENDING_KIND, choice)) throw new Error('Escolha inválida')
  const kind = PENDING_KIND[choice]
  await store.updateTransactions(userId, [txId], { kind, categoryId: choice === 'other' ? (categoryId ?? null) : null })
  // O par ligado (se houver) é refeito pelo classificador.
  await store.reclassify(userId)
}

export interface TeachPlaceInput {
  pattern: string
  displayName: string
  categoryId: string | null
  /** Ids do grupo; o primeiro é a linha editada (a mais recente). */
  ids: string[]
  remember: boolean
}

/**
 * "Novos lugares": cria o estabelecimento. Com "lembrar", grava a regra (descrição contém o padrão),
 * marca só a linha editada como do usuário e reclassifica o resto pela regra. Sem "lembrar",
 * marca as linhas do grupo.
 */
export async function teachPlaceCore(store: ReviewStore, userId: string, input: TeachPlaceInput): Promise<void> {
  const name = input.displayName.trim()
  const pattern = input.pattern.trim()
  if (!name || pattern.length < 3 || input.ids.length === 0) throw new Error('Dados inválidos')
  const merchantId = await store.createMerchant(userId, name, input.categoryId)
  if (input.remember) {
    await store.upsertRule(userId, { matchField: 'description', pattern, merchantId, categoryId: input.categoryId, kind: null })
  }
  const ids = input.remember ? input.ids.slice(0, 1) : input.ids
  await store.updateTransactions(userId, ids, { kind: 'expense', categoryId: input.categoryId, merchantId })
  if (input.remember) await store.reclassify(userId)
}
