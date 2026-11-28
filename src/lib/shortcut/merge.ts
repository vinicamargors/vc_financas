import type { Kind } from '@/lib/classify/classify'

/** Linha do Atalho ainda sem par (não apagada). */
export interface ShortcutRow {
  id: string
  date: string
  amountCents: number
  merchantId: string | null
  categoryId: string | null
  kind: Kind | null
  classifiedBy: 'auto' | 'user'
}

/** Lançamento da Pluggy em conta de cartão (CREDIT). */
export interface MergeCandidate {
  id: string
  date: string
  amountCents: number
}

export interface ShortcutMatch {
  shortcut: ShortcutRow
  pluggyId: string
}

const DAY_MS = 86_400_000
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY_MS

/**
 * Casa cada linha do Atalho com uma compra da Pluggy de mesmo valor e até 1 dia de diferença.
 * `taken` são linhas da Pluggy já ligadas a outro atalho. Cada linha da Pluggy casa uma vez só;
 * a mesma data tem preferência.
 */
export function matchShortcuts(shortcuts: ShortcutRow[], candidates: MergeCandidate[], taken: Set<string>): ShortcutMatch[] {
  const used = new Set(taken)
  const out: ShortcutMatch[] = []
  const ordered = [...shortcuts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  for (const pass of [0, 1]) {
    for (const s of ordered) {
      if (out.some((m) => m.shortcut.id === s.id)) continue
      const hit = candidates.find(
        (c) => !used.has(c.id) && c.amountCents < 0 && c.amountCents === s.amountCents && dayDiff(c.date, s.date) === pass,
      )
      if (!hit) continue
      used.add(hit.id)
      out.push({ shortcut: s, pluggyId: hit.id })
    }
  }
  return out.sort((a, b) => ordered.indexOf(a.shortcut) - ordered.indexOf(b.shortcut))
}
