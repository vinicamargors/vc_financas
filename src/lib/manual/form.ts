import { fromZonedTime } from 'date-fns-tz'
import { parseMoneyCents } from '@/lib/commitments/form'
import { TZ, toLocalDate } from '@/lib/format/date'

const DESCRIPTION_MAX = 120
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_DT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

export type ManualValues = {
  kind: 'expense' | 'income'
  accountId: string
  /** Gasto negativo, entrada positiva. */
  amountCents: number
  description: string
  categoryId: string | null
  /** Data local de São Paulo. */
  date: string
  occurredAt: string
}
export type ManualFormError = 'tipo' | 'conta' | 'valor' | 'descricao' | 'categoria' | 'data'

/** "YYYY-MM-DDTHH:mm" no horário de São Paulo → instante; inválido → null. */
function parseLocalDateTime(raw: string): Date | null {
  const m = LOCAL_DT_RE.exec(raw)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi))
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59) return null
  return fromZonedTime(raw.replace('T', ' ') + ':00', TZ)
}

/** Valida o lançamento manual. A posse da conta e da categoria é garantida pela FK composta + RLS. */
export function parseManualForm(get: (k: string) => string | null, now: Date): { ok: true; value: ManualValues } | { ok: false; error: ManualFormError } {
  const str = (k: string) => (get(k) ?? '').trim()
  const kind = str('kind')
  if (kind !== 'expense' && kind !== 'income') return { ok: false, error: 'tipo' }
  const accountId = str('account')
  if (!UUID_RE.test(accountId)) return { ok: false, error: 'conta' }
  const cents = parseMoneyCents(str('amount'))
  if (cents == null) return { ok: false, error: 'valor' }
  const description = str('description')
  if (!description || description.length > DESCRIPTION_MAX) return { ok: false, error: 'descricao' }
  const category = str('category')
  if (category && !UUID_RE.test(category)) return { ok: false, error: 'categoria' }
  const rawAt = str('at')
  const at = rawAt ? parseLocalDateTime(rawAt) : now
  if (!at || toLocalDate(at) > toLocalDate(now)) return { ok: false, error: 'data' }
  return {
    ok: true,
    value: {
      kind,
      accountId,
      amountCents: kind === 'expense' ? -cents : cents,
      description,
      categoryId: category || null,
      date: toLocalDate(at),
      occurredAt: at.toISOString(),
    },
  }
}
