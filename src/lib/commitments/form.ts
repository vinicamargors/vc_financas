import { daysBetween } from '@/lib/cycle/businessDays'
import type { Cycle } from '@/lib/cycle/cycle'
import type { CommitmentInput } from '@/lib/cycle/free'

export type CommitmentKind = CommitmentInput['kind']
export const COMMITMENT_KINDS: readonly CommitmentKind[] = ['fixed', 'category_budget', 'percent_of_income']

export type CommitmentValues = Omit<CommitmentInput, 'id'>
export type CommitmentFormError = 'nome' | 'tipo' | 'valor' | 'percentual' | 'categoria'

const NAME_MAX = 80
const MATCH_MAX = 80

/** "1.234,56", "R$ 900", "1500.75" → centavos; vazio, zero, negativo ou inválido → null. */
export function parseMoneyCents(raw: string): number | null {
  let s = raw.replace(/R\$|\s/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  if (s.includes(',')) {
    if (s.split(',').length > 2) return null
    s = s.replace(/\./g, '').replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

/** Percentual maior que 0 e até 100, com vírgula ou ponto. */
export function parsePercent(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return n > 0 && n <= 100 ? n : null
}

/** Valida o formulário de compromisso; só guarda os campos que valem para o tipo. */
export function parseCommitmentForm(
  get: (key: string) => string | null,
): { ok: true; value: CommitmentValues } | { ok: false; error: CommitmentFormError } {
  const str = (k: string) => (get(k) ?? '').trim()
  const name = str('name')
  if (!name || name.length > NAME_MAX) return { ok: false, error: 'nome' }
  const kind = str('kind') as CommitmentKind
  if (!COMMITMENT_KINDS.includes(kind)) return { ok: false, error: 'tipo' }
  const match = str('match').slice(0, MATCH_MAX) || null

  if (kind === 'percent_of_income') {
    const percent = parsePercent(str('percent'))
    if (percent == null) return { ok: false, error: 'percentual' }
    const percentBase = str('percentBase') === 'all' ? 'all' : 'salary'
    return { ok: true, value: { name, kind, amountCents: null, percent, percentBase, categoryId: null, matchCounterparty: match } }
  }
  const amountCents = parseMoneyCents(str('amount'))
  if (amountCents == null) return { ok: false, error: 'valor' }
  if (kind === 'category_budget') {
    const categoryId = str('categoryId')
    if (!categoryId) return { ok: false, error: 'categoria' }
    return { ok: true, value: { name, kind, amountCents, percent: null, percentBase: 'salary', categoryId, matchCounterparty: null } }
  }
  return { ok: true, value: { name, kind, amountCents, percent: null, percentBase: 'salary', categoryId: null, matchCounterparty: match } }
}

/** Nova ordem após subir/descer um item; null quando não há o que mover. */
export function moveCommitment(list: { id: string }[], id: string, dir: 'up' | 'down'): { id: string; sort: number }[] | null {
  const i = list.findIndex((c) => c.id === id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= list.length) return null
  const ids = list.map((c) => c.id)
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return ids.map((cid, sort) => ({ id: cid, sort }))
}

/** O bloco "Dia do pagamento" aparece no Início nos 3 primeiros dias depois que o salário caiu. */
export function showPaymentDay(cycle: Pick<Cycle, 'start' | 'source'>, today: string): boolean {
  if (cycle.source !== 'salary') return false
  const d = daysBetween(cycle.start, today)
  return d >= 0 && d < 3
}
