import type { Kind } from '@/lib/classify/classify'

export type SameChoice = 'same' | 'different'

export interface PendingManual {
  id: string
  candidateId: string | null
  kind: Kind | null
  categoryId: string | null
  merchantId: string | null
}

/** Acesso a dados da seção "É o mesmo lançamento?". Toda função filtra pelo `userId`. */
export interface SameEntryStore {
  /** Manual vivo, não conferido, do usuário; senão null. */
  getPendingManual(userId: string, id: string): Promise<PendingManual | null>
  /** O candidato já está ligado a outro Atalho/manual (vivo ou apagado)? */
  candidateTaken(userId: string, candidateId: string): Promise<boolean>
  /** Copia a classificação do manual para a linha da Pluggy e apaga o manual ligado a ela. */
  merge(userId: string, manual: PendingManual, candidateId: string): Promise<void>
  /** Marca o manual como conferido (diferente do candidato) e limpa o candidato. */
  markReconciled(userId: string, id: string): Promise<void>
}

export async function resolveSameEntry(store: SameEntryStore, userId: string, manualId: string, choice: SameChoice): Promise<void> {
  if (choice !== 'same' && choice !== 'different') throw new Error('escolha inválida')
  const m = await store.getPendingManual(userId, manualId)
  if (!m) throw new Error('lançamento não encontrado')
  if (choice === 'different') return store.markReconciled(userId, m.id)
  if (!m.candidateId) throw new Error('sem candidato')
  if (await store.candidateTaken(userId, m.candidateId)) throw new Error('candidato já ligado a outro lançamento')
  await store.merge(userId, m, m.candidateId)
}
