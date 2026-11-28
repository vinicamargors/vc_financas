import type { Kind } from '@/lib/classify/classify'
import { dayDistance } from '@/lib/sync/classification'

/** Linha do Atalho ainda sem par (não apagada). */
export interface ShortcutRow {
  id: string
  accountId: string
  date: string
  amountCents: number
  createdAt: string
  merchantId: string | null
  categoryId: string | null
  kind: Kind | null
  classifiedBy: 'auto' | 'user'
  /** Só a conta MANUAL do Atalho (cartão desconhecido) casa com qualquer cartão; ausente = sim. */
  anyAccount?: boolean
}

/** Lançamento da Pluggy em conta de cartão (CREDIT). */
export interface MergeCandidate {
  id: string
  accountId: string
  date: string
  amountCents: number
  createdAt: string
}

export interface ShortcutMatch {
  shortcut: ShortcutRow
  pluggyId: string
}

/** Tolerância de relógio: a linha da Pluggy precisa ter chegado depois do Atalho (menos 10 min). */
export const SEEN_AFTER_MS = 10 * 60_000

/**
 * Casa cada linha do Atalho com uma compra da Pluggy de mesmo valor, até 1 dia de diferença e
 * gravada depois do Atalho (uma compra antiga de mesmo valor nunca casa). `taken` são linhas da
 * Pluggy já ligadas a outro atalho; cada uma casa uma vez só. Preferência: mesma conta, data
 * mais próxima, menor id.
 */
export function matchShortcuts(shortcuts: ShortcutRow[], candidates: MergeCandidate[], taken: Set<string>): ShortcutMatch[] {
  const used = new Set(taken)
  const out: ShortcutMatch[] = []
  const ordered = [...shortcuts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  for (const s of ordered) {
    const since = Date.parse(s.createdAt) - SEEN_AFTER_MS
    const hit = candidates
      .filter(
        (c) =>
          !used.has(c.id) &&
          (s.anyAccount !== false || c.accountId === s.accountId) &&
          c.amountCents < 0 &&
          c.amountCents === s.amountCents &&
          dayDistance(c.date, s.date) <= 1 &&
          Date.parse(c.createdAt) >= since,
      )
      .sort(
        (a, b) =>
          Number(b.accountId === s.accountId) - Number(a.accountId === s.accountId) ||
          dayDistance(a.date, s.date) - dayDistance(b.date, s.date) ||
          a.id.localeCompare(b.id),
      )[0]
    if (!hit) continue
    used.add(hit.id)
    out.push({ shortcut: s, pluggyId: hit.id })
  }
  return out
}
