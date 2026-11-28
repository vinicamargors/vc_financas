import { parseMoneyCents } from '@/lib/commitments/form'

/** Nome de cartão de benefício (VR/VA) enviado pelo Atalho. */
const BENEFIT_CARD_RE = /(?<![\p{L}\p{N}])(alelo|ticket|vr|pluxee|sodexo|flash|caju|swile|ben visa|vale)(?![\p{L}\p{N}])/iu

export function isBenefitCard(card: string | null | undefined): boolean {
  return !!card && BENEFIT_CARD_RE.test(card)
}

/** Id externo da recarga: um por conta e mês, o que torna a geração idempotente (`unique (user_id, external_id)`). */
export function rechargeExternalId(accountId: string, month: string): string {
  return `vr:${accountId}:${month}`
}

/** Recargas devidas: uma por mês no dia escolhido (limitado ao fim do mês), de `since` até `today`. */
export function rechargesDue(p: { day: number; since: string; today: string }): { month: string; date: string }[] {
  const out: { month: string; date: string }[] = []
  let y = Number(p.since.slice(0, 4))
  let m = Number(p.since.slice(5, 7))
  const endKey = Number(p.today.slice(0, 4)) * 12 + Number(p.today.slice(5, 7))
  while (y * 12 + m <= endKey) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const month = `${y}-${String(m).padStart(2, '0')}`
    const date = `${month}-${String(Math.min(p.day, last)).padStart(2, '0')}`
    if (date >= p.since && date <= p.today) out.push({ month, date })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

const NAME_MAX = 60

export type VrValues = { name: string; monthlyCents: number; day: number }

/** Valida o formulário do VR (nome, valor mensal, dia da recarga 1–31). */
export function parseVrForm(get: (k: string) => string | null): { ok: true; value: VrValues } | { ok: false; error: 'nome' | 'valor' | 'dia' } {
  const str = (k: string) => (get(k) ?? '').trim()
  const name = str('name')
  if (!name || name.length > NAME_MAX) return { ok: false, error: 'nome' }
  const monthlyCents = parseMoneyCents(str('monthly'))
  if (monthlyCents == null) return { ok: false, error: 'valor' }
  const rawDay = str('day')
  const day = /^\d{1,2}$/.test(rawDay) ? Number(rawDay) : NaN
  if (!(day >= 1 && day <= 31)) return { ok: false, error: 'dia' }
  return { ok: true, value: { name, monthlyCents, day } }
}
