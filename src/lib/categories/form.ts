import { parseMoneyCents } from '@/lib/commitments/form'
import { UNCATEGORIZED_KEY } from '@/lib/analysis/by-category'

export const CATEGORY_NAME_MAX = 40
export type CategoryFormError = 'nome' | 'limite'

/** Valida nome (1–40) e limite mensal opcional (vazio = sem limite). */
export function parseCategoryForm(
  get: (key: string) => string | null,
): { ok: true; value: { name: string; monthlyLimitCents: number | null } } | { ok: false; error: CategoryFormError } {
  const name = (get('name') ?? '').trim().replace(/\s+/g, ' ')
  if (!name || name.length > CATEGORY_NAME_MAX) return { ok: false, error: 'nome' }
  const raw = (get('limit') ?? '').trim()
  if (!raw) return { ok: true, value: { name, monthlyLimitCents: null } }
  const cents = parseMoneyCents(raw)
  if (cents == null) return { ok: false, error: 'limite' }
  return { ok: true, value: { name, monthlyLimitCents: cents } }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Segmento da URL `/gastos/[categoria]`: id da categoria ou `sem`. */
export function isCategoryKey(v: string): boolean {
  return v === UNCATEGORIZED_KEY || UUID_RE.test(v)
}
