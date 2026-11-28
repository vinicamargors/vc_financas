import { prettyDescription } from '@/lib/format/description'
import { normalizeText, onlyDigits } from './normalize'
import { isPluggyCardPayment, isPluggyInvestment, isPluggySamePersonTransfer, pluggyCategoryToName } from './pluggy-categories'

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
  /** Novas ligações de par (nos dois sentidos). */
  links: Link[]
  /** Linhas cuja ligação antiga não vale mais: quem chama zera `linked_transaction_id`. */
  unlinked: string[]
}

const BANK_CARD_PAYMENT = /pagamento.*fatura|pag(to)?\s*fatura|fatura.*cart|pagto cartao|pagamento cartao|recebto pagto|pagto antec|pagamento antecipado/i
const CREDIT_CARD_PAYMENT = /pagamento (recebido|efetuado)|pagto recebido|pagamento de fatura/i
// Mercado Pago: "Dinheiro reservado <caixinha>" / "Dinheiro retirado <caixinha>".
const INVEST_IN = /aplica[cç][aã]o|apl\.|cofrinho|caixinha|guardar|guardado|investimento|dinheiro reservado|reserva(do|da)? (para|em)\b/i
const INVEST_OUT = /resgate|resg\.|dinheiro retirado|dinheiro resgatado|retirad[oa] d[ao] (cofrinho|caixinha|reserva)/i
const REFUND = /estorno|reembolso|devolu[cç][aã]o|chargeback/i
const PIX_TED = /\b(pix|ted)\b/i
/** Descrições de envio a uma pessoa (Bradesco, Nubank, Mercado Pago). Texto já normalizado. */
export const PERSON_TRANSFER =
  /^(pix enviado|ted enviad[ao])|transferencia (enviada|pix)|pix .*enviad|transf(\.|erencia)? (cc|p\/)|ted dif/
const REVIEW_THRESHOLD_CENTS = 100_000
const DAY_MS = 86_400_000

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS)
}

/** As palavras do padrão aparecem inteiras e seguidas no texto (já normalizados). */
function containsWords(text: string, pattern: string): boolean {
  const words = pattern.split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length === 0) return false
  // Palavras só têm [a-z0-9]: nada a escapar.
  return new RegExp(`(?:^|[^a-z0-9])${words.join('[^a-z0-9]+')}(?:$|[^a-z0-9])`).test(text)
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
    if (r.matchField === 'description') return containsWords(desc, p) || containsWords(raw, p)
    return name.includes(p)
  })
}

/** Merchant/categoria que a regra impõe (o tipo vem de outro lugar quando a regra não tem `kind`). */
function ruleOverlay(r: Rule, ctx: ClassifyContext): Pick<Decision, 'categoryId' | 'merchantId'> {
  const categoryId = r.categoryId ?? (r.merchantId ? ctx.merchantsById[r.merchantId]?.categoryId : null) ?? undefined
  return { ...(categoryId ? { categoryId } : {}), ...(r.merchantId ? { merchantId: r.merchantId } : {}) }
}

function isToSelf(t: ClassifyTx, ownerDocs: Set<string>, ownerNames: string[]): boolean {
  const doc = onlyDigits(t.counterpartyDoc)
  if (doc && ownerDocs.has(doc)) return true
  if (ownerNames.length === 0) return false
  const pretty = normalizeText(prettyDescription(t.descriptionRaw)).replace(/^(pix|ted) (para|de) /, '')
  const name = normalizeText(t.counterpartyName)
  // Bancos cortam o nome ("Vinicius Camargo Roch"): um prefixo do outro, com ao menos 2 palavras e 12 letras.
  const solid = (x: string) => x.length >= 12 && x.split(' ').length >= 2
  const same = (a: string, b: string) => solid(a) && solid(b) && (a.startsWith(b) || b.startsWith(a))
  return ownerNames.some((o) => same(o, pretty) || (name !== '' && same(o, name)))
}

function isCardPayment(t: ClassifyTx, accountType: 'BANK' | 'CREDIT' | undefined): boolean {
  if (t.amountCents < 0 && accountType === 'BANK' && BANK_CARD_PAYMENT.test(normalizeText(t.descriptionRaw))) return true
  if (t.amountCents > 0 && accountType === 'CREDIT' && CREDIT_CARD_PAYMENT.test(normalizeText(t.descriptionRaw))) return true
  return isPluggyCardPayment(t.pluggyCategory)
}

function isPixToPerson(t: ClassifyTx): boolean {
  const desc = normalizeText(t.descriptionRaw)
  const personDesc = PERSON_TRANSFER.test(desc)
  if (!personDesc && !PIX_TED.test(t.paymentMethod ?? '') && !PIX_TED.test(desc)) return false
  const rawDoc = t.counterpartyDoc ?? ''
  const doc = onlyDigits(rawDoc)
  const known = !rawDoc.includes('*') && (doc.length === 11 || doc.length === 14)
  if (known) return doc.length === 11
  // Documento ausente ou mascarado: só a descrição de envio a pessoa conta (QR code costuma ser loja).
  return personDesc
}

/**
 * Casa saídas de contas BANK com entradas de mesmo valor absoluto em outra conta, até 1 dia de distância.
 * No cartão só entram créditos com cara de pagamento de fatura. Cada saída pega a entrada de data mais
 * próxima (depois o menor id). Ordenação por (valor, data, id): determinístico.
 */
function pairTransfers(
  rows: ClassifyTx[],
  accountType: Map<string, 'BANK' | 'CREDIT'>,
): [ClassifyTx, ClassifyTx][] {
  const byKey = (a: ClassifyTx, b: ClassifyTx) =>
    Math.abs(a.amountCents) - Math.abs(b.amountCents) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  const outs = rows.filter((t) => t.amountCents < 0 && accountType.get(t.accountId) !== 'CREDIT').sort(byKey)
  const ins = rows
    .filter((t) => t.amountCents > 0 && (accountType.get(t.accountId) !== 'CREDIT' || isCardPayment(t, 'CREDIT')))
    .sort(byKey)
  const pairs: [ClassifyTx, ClassifyTx][] = []
  const used = new Set<string>()
  let start = 0
  for (const o of outs) {
    const abs = -o.amountCents
    while (start < ins.length && ins[start].amountCents < abs) start++
    let best: ClassifyTx | undefined
    let bestGap = Infinity
    for (let j = start; j < ins.length && ins[j].amountCents === abs; j++) {
      const i = ins[j]
      if (used.has(i.id) || i.accountId === o.accountId) continue
      const gap = Math.abs(dayNumber(i.date) - dayNumber(o.date))
      if (gap > 1) continue
      if (gap < bestGap || (gap === bestGap && best && i.id < best.id)) {
        best = i
        bestGap = gap
      }
    }
    if (best) {
      used.add(best.id)
      pairs.push([o, best])
    }
  }
  return pairs
}

/**
 * Classifica lançamentos automaticamente. Linhas marcadas pelo usuário são ignoradas por completo.
 *
 * Contrato com quem chama:
 * - a entrada deve incluir os parceiros das linhas já ligadas (senão a ligação é tida como velha);
 * - aplicar `unlinked` (zerar `linked_transaction_id`) antes de gravar `links`.
 */
export function classify(txs: ClassifyTx[], ctx: ClassifyContext): ClassifyResult {
  const accountType = new Map(ctx.accounts.map((a) => [a.id, a.type]))
  const ownerDocs = new Set(ctx.ownerDocs.map(onlyDigits).filter(Boolean))
  const ownerNames = (ctx.ownerNames ?? []).map(normalizeText).filter(Boolean)
  const byId = new Map(txs.map((t) => [t.id, t]))
  const auto = txs.filter((t) => t.classifiedBy === 'auto')
  const decided = new Map<string, Decision>()
  const overlay = new Map<string, Pick<Decision, 'categoryId' | 'merchantId'>>()
  const links: Link[] = []
  const unlinked: string[] = []

  const linkHolds = (t: ClassifyTx): boolean => {
    const p = t.linkedTransactionId ? byId.get(t.linkedTransactionId) : undefined
    return (
      !!p &&
      p.classifiedBy === 'auto' &&
      p.linkedTransactionId === t.id &&
      (p.kind === 'transfer' || p.kind === 'card_payment' || p.kind === 'pending_review')
    )
  }
  const ownMoney = new Set<string>()

  // 1–2. Regras do usuário, rendimento, ligação válida, transferência para si.
  for (const t of auto) {
    const rule = matchRule(t, ctx.rules)
    if (rule) {
      if (rule.kind) {
        decided.set(t.id, { id: t.id, kind: rule.kind, ...ruleOverlay(rule, ctx) })
        continue
      }
      overlay.set(t.id, ruleOverlay(rule, ctx))
    }
    if (t.linkedTransactionId && !linkHolds(t)) unlinked.push(t.id)
    if (t.kind === 'savings_yield') decided.set(t.id, { id: t.id, kind: 'savings_yield' })
    else if (t.linkedTransactionId && linkHolds(t))
      decided.set(t.id, { id: t.id, kind: t.kind === 'card_payment' || t.kind === 'pending_review' ? t.kind : 'transfer' })
    else if (isToSelf(t, ownerDocs, ownerNames) || isPluggySamePersonTransfer(t.pluggyCategory)) ownMoney.add(t.id)
  }

  // 3. Par casado entre contas do usuário.
  const candidates = auto.filter((t) => !decided.has(t.id) && t.amountCents !== 0)
  for (const [o, i] of pairTransfers(candidates, accountType)) {
    // O lado do cartão ("Pagamento recebido") basta: o Pix/boleto do banco nem sempre diz "fatura".
    const card = accountType.get(i.accountId) === 'CREDIT' && isCardPayment(i, 'CREDIT')
    // Só vira transferência com sinal forte de dinheiro próprio; valor igual sozinho é coincidência possível.
    const own = ownMoney.has(o.id) || ownMoney.has(i.id)
    const kind: Kind = card ? 'card_payment' : own ? 'transfer' : 'pending_review'
    decided.set(o.id, { id: o.id, kind })
    decided.set(i.id, { id: i.id, kind })
    links.push({ id: o.id, linkedId: i.id }, { id: i.id, linkedId: o.id })
  }

  // 2 (sem par). Dinheiro próprio que não achou o outro lado continua transferência.
  for (const id of ownMoney) if (!decided.has(id)) decided.set(id, { id, kind: 'transfer' })

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
    else if (isPluggyInvestment(t.pluggyCategory)) d = { id: t.id, kind: out ? 'investment_in' : 'investment_out' }
    else if (!out) d = { id: t.id, kind: 'income' }
    else if (-t.amountCents >= REVIEW_THRESHOLD_CENTS && isPixToPerson(t) && !overlay.has(t.id))
      d = { id: t.id, kind: 'pending_review' }
    else {
      const categoryName = pluggyCategoryToName(t.pluggyCategory)
      d = { id: t.id, kind: 'expense', ...(categoryName ? { categoryName } : {}) }
    }
    decided.set(t.id, d)
  }

  const decisions = auto
    .map((t) => {
      const d = decided.get(t.id)
      const o = overlay.get(t.id)
      if (!d || !o) return d
      // Regra sem tipo: o tipo estrutural vence; a categoria da regra substitui a da Pluggy.
      const merged: Decision = { ...d, ...o }
      if (o.categoryId) delete merged.categoryName
      return merged
    })
    .filter((d): d is Decision => d !== undefined)
  const relinked = new Set(links.map((l) => l.id))
  return { decisions, links, unlinked: unlinked.filter((id) => !relinked.has(id)) }
}
