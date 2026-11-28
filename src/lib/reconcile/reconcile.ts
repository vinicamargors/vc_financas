import type { ShortcutMatch, ShortcutRow } from '@/lib/shortcut/merge'
import { SEEN_AFTER_MS } from '@/lib/shortcut/merge'
import { dayDistance } from '@/lib/sync/classification'

/** Lançamento manual vivo, sem par e ainda não conferido. `bankKey` = conexão (banco) da conta. */
export interface ManualRow extends ShortcutRow {
  bankKey: string | null
  occurredAt: string | null
  description: string
  reconcileCandidateId: string | null
}

/** Lançamento da Pluggy que pode ser o mesmo do manual. */
export interface ReconcileCandidate {
  id: string
  accountId: string
  bankKey: string | null
  date: string
  amountCents: number
  createdAt: string
  occurredAt: string | null
  description: string
}

export interface ReconcileResult {
  /** Certeza: funde (mesma operação da fusão do Atalho). */
  merges: ShortcutMatch[]
  /** Dúvida: grava `reconcile_candidate_id` no manual, para a tela Revisar. */
  doubts: { manualId: string; candidateId: string }[]
}

const NEAR_PCT = 0.05
const SAME_TIME_MS = 2 * 3_600_000
export const MISSING_AFTER_DAYS = 3
const MIN_WORD = 3

const words = (text: string) =>
  new Set(
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= MIN_WORD),
  )

/** Descrições parecidas: alguma palavra (≥ 3 letras) em comum, sem acento e sem caixa. */
export function similarDescription(a: string, b: string): boolean {
  const wb = words(b)
  return [...words(a)].some((w) => wb.has(w))
}

const closeInTime = (a: string | null, b: string | null) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) <= SAME_TIME_MS

/**
 * Conferência do lançamento manual com a Pluggy. Candidatos: mesmo sinal, até 1 dia de diferença, gravados depois
 * do manual (menos 10 min) e ainda não ligados a outro manual/atalho.
 * - Certeza: exatamente 1 candidato na mesma conta com o mesmo valor, e descrição parecida ou hora até 2 h.
 * - Dúvida: mais de 1 candidato igual, valor até 5% diferente na mesma conta, ou mesmo valor em outra conta do mesmo
 *   banco (ou o candidato único sem descrição/hora que confirme).
 */
export function reconcileManuals(manuals: ManualRow[], candidates: ReconcileCandidate[], taken: Set<string>): ReconcileResult {
  const used = new Set(taken)
  const merges: ShortcutMatch[] = []
  const doubts: ReconcileResult['doubts'] = []
  const ordered = [...manuals].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  for (const m of ordered) {
    const since = Date.parse(m.createdAt) - SEEN_AFTER_MS
    const byCloseness = (a: ReconcileCandidate, b: ReconcileCandidate) => dayDistance(a.date, m.date) - dayDistance(b.date, m.date) || a.id.localeCompare(b.id)
    const pool = candidates
      .filter(
        (c) =>
          !used.has(c.id) &&
          Math.sign(c.amountCents) === Math.sign(m.amountCents) &&
          dayDistance(c.date, m.date) <= 1 &&
          Date.parse(c.createdAt) >= since,
      )
      .sort(byCloseness)
    const exact = pool.filter((c) => c.accountId === m.accountId && c.amountCents === m.amountCents)
    if (exact.length === 1 && (similarDescription(m.description, exact[0].description) || closeInTime(m.occurredAt, exact[0].occurredAt))) {
      used.add(exact[0].id)
      merges.push({ shortcut: m, pluggyId: exact[0].id })
      continue
    }
    const tolerance = Math.abs(m.amountCents) * NEAR_PCT
    const near = pool.filter((c) => c.accountId === m.accountId && c.amountCents !== m.amountCents && Math.abs(c.amountCents - m.amountCents) <= tolerance)
    const sameBank = pool.filter((c) => c.accountId !== m.accountId && m.bankKey != null && c.bankKey === m.bankKey && c.amountCents === m.amountCents)
    const best = exact[0] ?? near[0] ?? sameBank[0]
    if (best && best.id !== m.reconcileCandidateId) doubts.push({ manualId: m.id, candidateId: best.id })
  }
  return { merges, doubts }
}

/** "Não apareceu no banco": manual fora do VR, sem par nem dúvida e não conferido, há mais de 3 dias. */
export function isMissingFromBank(
  t: {
    source: string
    reconciled: boolean
    deletedAt: string | null
    linkedTransactionId: string | null
    reconcileCandidateId: string | null
    accountType: string
    date: string
  },
  today: string,
): boolean {
  if (t.source !== 'manual' || t.reconciled || t.deletedAt || t.linkedTransactionId || t.reconcileCandidateId) return false
  if (t.accountType === 'BENEFIT' || t.accountType === 'MANUAL') return false
  return t.date < today && dayDistance(t.date, today) > MISSING_AFTER_DAYS
}
