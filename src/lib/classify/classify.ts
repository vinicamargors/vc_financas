import { prettyDescription } from '@/lib/format/description'
import { normalizeText, onlyDigits } from './normalize'
import { isPluggyCardPayment, pluggyCategoryToName } from './pluggy-categories'

export type Kind =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'card_payment'
  | 'investment_in'
  | 'investment_out'
  | 'savings_yield'
  | 'refund'
  | 'pending_review'

export interface ClassifyTx {
  id: string
  accountId: string
  /** YYYY-MM-DD (data de calendário em São Paulo). */
  date: string
  amountCents: number
  descriptionRaw: string
  pluggyCategory: string | null
  counterpartyName: string | null
  counterpartyDoc: string | null
  paymentMethod: string | null
  kind: Kind | null
  classifiedBy: 'auto' | 'user'
  linkedTransactionId: string | null
}

export interface Rule {
  matchField: 'description' | 'counterparty_doc' | 'counterparty_name'
  pattern: string
  merchantId: string | null
  categoryId: string | null
  kind: Kind | null
}

export interface ClassifyContext {
  /** CPF/CNPJ do dono (qualquer formatação). */
  ownerDocs: string[]
  /** Nome do dono, para Pix a si mesmo sem documento. */
  ownerNames?: string[]
  accounts: { id: string; type: 'BANK' | 'CREDIT' }[]
  rules: Rule[]
  merchantsById: Record<string, { categoryId: string | null }>
}

export interface Decision {
  id: string
  kind: Kind
  /** Nome da categoria padrão (vinda da Pluggy); quem chama resolve o id. */
  categoryName?: string
  /** Categoria já resolvida (da regra ou do merchant da regra). */
  categoryId?: string
  merchantId?: string
}

export interface Link {
  id: string
  linkedId: string
}

export interface ClassifyResult {
  decisions: Decision[]
  links: Link[]
}

const BANK_CARD_PAYMENT = /pagamento.*fatura|pag(to)?\s*fatura|fatura.*cart|pagto cartao|pagamento cartao/i
const CREDIT_CARD_PAYMENT = /pagamento (recebido|efetuado)|pagto recebido|pagamento de fatura/i
const INVEST_IN = /aplica[cç][aã]o|apl\.|cofrinho|caixinha|guardar|guardado|investimento/i
const INVEST_OUT = /resgate|resg\./i
const REFUND = /estorno|reembolso|devolu[cç][aã]o|chargeback/i
const PIX_TED = /\b(pix|ted)\b/i
const PIX_TO_PERSON = /^(pix enviado|ted enviad[ao])/i
const REVIEW_THRESHOLD_CENTS = 100_000
const DAY_MS = 86_400_000

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS)
}

function matchRule(t: ClassifyTx, rules: Rule[]): Rule | undefined {
  const desc = normalizeText(prettyDescription(t.descriptionRaw))
  const raw = normalizeText(t.descriptionRaw)
  const doc = onlyDigits(t.counterpartyDoc)
  const name = normalizeText(t.counterpartyName)
  return rules.find((r) => {
    if (r.matchField === 'counterparty_doc') return doc !== '' && onlyDigits(r.pattern) === doc
    const p = normalizeText(r.pattern)
    if (!p) return false
    if (r.matchField === 'description') return desc.includes(p) || raw.includes(p)
    return name.includes(p)
  })
}

function fromRule(t: ClassifyTx, r: Rule, ctx: ClassifyContext): Decision {
  const categoryId = r.categoryId ?? (r.merchantId ? ctx.merchantsById[r.merchantId]?.categoryId : null) ?? undefined
  const kind: Kind = r.kind ?? (t.amountCents < 0 ? 'expense' : 'income')
  return {
    id: t.id,
    kind,
    ...(categoryId ? { categoryId } : {}),
    ...(r.merchantId ? { merchantId: r.merchantId } : {}),
  }
}

function isToSelf(t: ClassifyTx, ownerDocs: Set<string>, ownerNames: string[]): boolean {
  const doc = onlyDigits(t.counterpartyDoc)
  if (doc && ownerDocs.has(doc)) return true
  if (ownerNames.length === 0) return false
  const pretty = normalizeText(prettyDescription(t.descriptionRaw)).replace(/^(pix|ted) (para|de) /, '')
  const name = normalizeText(t.counterpartyName)
  // Bancos cortam o nome ("Vinicius Camargo Roch"): basta um ser prefixo do outro.
  const same = (a: string, b: string) => a.length >= 8 && b.length >= 8 && (a.startsWith(b) || b.startsWith(a))
  return ownerNames.some((o) => same(o, pretty) || (name !== '' && same(o, name)))
}

function isCardPayment(t: ClassifyTx, accountType: 'BANK' | 'CREDIT' | undefined): boolean {
  if (t.amountCents < 0 && accountType === 'BANK' && BANK_CARD_PAYMENT.test(normalizeText(t.descriptionRaw))) return true
  if (t.amountCents > 0 && accountType === 'CREDIT' && CREDIT_CARD_PAYMENT.test(normalizeText(t.descriptionRaw))) return true
  return isPluggyCardPayment(t.pluggyCategory)
}

function isPixToPerson(t: ClassifyTx): boolean {
  const isPixTed = PIX_TED.test(t.paymentMethod ?? '') || PIX_TED.test(t.descriptionRaw)
  if (!isPixTed) return false
  const doc = onlyDigits(t.counterpartyDoc)
  if (doc.length === 11) return true
  if (doc.length === 14) return false
  // Sem documento: só "Pix enviado"/"TED enviada" contam (QR code costuma ser loja).
  return PIX_TO_PERSON.test(normalizeText(t.descriptionRaw))
}

/**
 * Casa saídas e entradas de mesmo valor absoluto em contas diferentes, até 1 dia de distância.
 * Ordena por (valor, dia, id) e casa de forma gulosa dentro de cada valor: determinístico e O(n log n)
 * no caso comum.
 */
function pairTransfers(rows: ClassifyTx[]): [ClassifyTx, ClassifyTx][] {
  const byKey = (a: ClassifyTx, b: ClassifyTx) =>
    Math.abs(a.amountCents) - Math.abs(b.amountCents) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  const outs = rows.filter((t) => t.amountCents < 0).sort(byKey)
  const ins = rows.filter((t) => t.amountCents > 0).sort(byKey)
  const pairs: [ClassifyTx, ClassifyTx][] = []
  const used = new Set<string>()
  let start = 0
  for (const o of outs) {
    const abs = -o.amountCents
    while (start < ins.length && ins[start].amountCents < abs) start++
    for (let j = start; j < ins.length && ins[j].amountCents === abs; j++) {
      const i = ins[j]
      if (used.has(i.id) || i.accountId === o.accountId) continue
      if (Math.abs(dayNumber(i.date) - dayNumber(o.date)) > 1) continue
      used.add(i.id)
      pairs.push([o, i])
      break
    }
  }
  return pairs
}

/** Classifica lançamentos automaticamente. Linhas marcadas pelo usuário são ignoradas por completo. */
export function classify(txs: ClassifyTx[], ctx: ClassifyContext): ClassifyResult {
  const accountType = new Map(ctx.accounts.map((a) => [a.id, a.type]))
  const ownerDocs = new Set(ctx.ownerDocs.map(onlyDigits).filter(Boolean))
  const ownerNames = (ctx.ownerNames ?? []).map(normalizeText).filter(Boolean)
  const auto = txs.filter((t) => t.classifiedBy === 'auto')
  const decided = new Map<string, Decision>()
  const links: Link[] = []

  // 1–2. Regras do usuário, rendimento, ligação existente, transferência para si.
  for (const t of auto) {
    const rule = matchRule(t, ctx.rules)
    if (rule) decided.set(t.id, fromRule(t, rule, ctx))
    else if (t.kind === 'savings_yield') decided.set(t.id, { id: t.id, kind: 'savings_yield' })
    else if (t.linkedTransactionId) decided.set(t.id, { id: t.id, kind: t.kind === 'card_payment' ? 'card_payment' : 'transfer' })
    else if (isToSelf(t, ownerDocs, ownerNames)) decided.set(t.id, { id: t.id, kind: 'transfer' })
  }

  // 3. Par casado entre contas do usuário.
  for (const [o, i] of pairTransfers(auto.filter((t) => !decided.has(t.id) && t.amountCents !== 0))) {
    const card = isCardPayment(o, accountType.get(o.accountId)) && isCardPayment(i, accountType.get(i.accountId))
    const kind: Kind = card ? 'card_payment' : 'transfer'
    decided.set(o.id, { id: o.id, kind })
    decided.set(i.id, { id: i.id, kind })
    links.push({ id: o.id, linkedId: i.id }, { id: i.id, linkedId: o.id })
  }

  // 4–8. Regras fixas para o resto.
  for (const t of auto) {
    if (decided.has(t.id)) continue
    const desc = normalizeText(t.descriptionRaw)
    const out = t.amountCents < 0
    let d: Decision
    if (isCardPayment(t, accountType.get(t.accountId))) d = { id: t.id, kind: 'card_payment' }
    else if (out && INVEST_IN.test(desc)) d = { id: t.id, kind: 'investment_in' }
    else if (!out && INVEST_OUT.test(desc)) d = { id: t.id, kind: 'investment_out' }
    else if (!out && REFUND.test(desc)) d = { id: t.id, kind: 'refund' }
    else if (!out) d = { id: t.id, kind: 'income' }
    else if (-t.amountCents >= REVIEW_THRESHOLD_CENTS && isPixToPerson(t)) d = { id: t.id, kind: 'pending_review' }
    else {
      const categoryName = pluggyCategoryToName(t.pluggyCategory)
      d = { id: t.id, kind: 'expense', ...(categoryName ? { categoryName } : {}) }
    }
    decided.set(t.id, d)
  }

  const decisions = auto.map((t) => decided.get(t.id)).filter((d): d is Decision => d !== undefined)
  return { decisions, links }
}
