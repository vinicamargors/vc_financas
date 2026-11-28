import { isBenefitCard } from '@/lib/benefit/benefit'
import { toLocalDate } from '@/lib/format/date'
import { parseAmountCents } from './amount'
import { hashToken } from './token'

export const RATE_LIMIT_PER_HOUR = 60
/** Marca a compra feita com cartão de benefício (VR/VA). */
export const BENEFIT_PAYMENT_METHOD = 'BENEFIT'
const MERCHANT_MAX = 120
const CARD_MAX = 60

export interface ShortcutInsert {
  userId: string
  accountId: string
  date: string
  occurredAt: string
  amountCents: number
  descriptionRaw: string
  /** `BENEFIT` quando o cartão é de benefício: a linha nunca é fundida com a fatura de um cartão. */
  paymentMethod?: string | null
}

/** Acesso a dados do endpoint. Toda função recebe o `userId` do dono do token e filtra por ele. */
export interface IngestRepo {
  findUserByTokenHash(hash: string): Promise<string | null>
  /** Lançamentos do Atalho com `occurred_at >= since` (inclui os já fundidos). */
  countShortcutsSince(userId: string, sinceIso: string): Promise<number>
  listCreditAccounts(userId: string): Promise<{ id: string; name: string; institution: string }[]>
  /** Conta VR (BENEFIT) do usuário, se houver. */
  findBenefitAccount(userId: string): Promise<string | null>
  /** Conta MANUAL "Atalho", criada na primeira vez. */
  ensureManualAccount(userId: string): Promise<string>
  insertTransaction(row: ShortcutInsert): Promise<void>
  /** Aplica as regras na janela do dia. */
  classify(userId: string, date: string): Promise<void>
}

export interface IngestResponse {
  status: number
  body: { ok: true } | { error: string }
}

const fail = (status: number, error: string): IngestResponse => ({ status, body: { error } })

const MIN_WORD = 3

const words = (text: string) =>
  new Set(
    text
      .toLocaleLowerCase('pt-BR')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= MIN_WORD),
  )

/**
 * Cartão cujo nome/instituição tem alguma palavra (≥ 3 letras) em comum com a dica; senão o único
 * cartão; senão `null` (conta manual).
 */
export function pickAccount(
  accounts: { id: string; name: string; institution: string }[],
  card: string | null,
): string | null {
  const hint = words(card ?? '')
  if (hint.size) {
    const hit = accounts.find((a) => [...words(`${a.name} ${a.institution}`)].some((w) => hint.has(w)))
    if (hit) return hit.id
  }
  return accounts.length === 1 ? accounts[0].id : null
}

/** POST do Atalho do iPhone. Nunca loga token nem corpo. */
export async function ingestShortcut(
  repo: IngestRepo,
  req: { authorization: string | null; body: unknown },
  now: () => Date = () => new Date(),
  log: (m: string) => void = console.error,
): Promise<IngestResponse> {
  const m = /^Bearer\s+(\S+)$/.exec(req.authorization ?? '')
  const userId = m ? await repo.findUserByTokenHash(hashToken(m[1])) : null
  if (!userId) return fail(401, 'Token inválido. Gere um novo em Configurações › Atalho do iPhone.')

  const body = req.body
  if (typeof body !== 'object' || body === null) return fail(400, 'Envie um JSON com amount e merchant.')
  const { amount, merchant, card } = body as Record<string, unknown>
  const cents = parseAmountCents(amount)
  if (cents === null) return fail(400, 'Valor inválido. Exemplo: "R$ 9,90".')
  const name = typeof merchant === 'string' ? merchant.trim() : ''
  if (!name || name.length > MERCHANT_MAX) return fail(400, `Comerciante obrigatório, até ${MERCHANT_MAX} caracteres.`)
  if (card !== undefined && card !== null && typeof card !== 'string') return fail(400, 'Cartão inválido.')
  const cardHint = typeof card === 'string' ? card.trim() : ''
  if (cardHint.length > CARD_MAX) return fail(400, `Cartão com até ${CARD_MAX} caracteres.`)

  const at = now()
  const recent = await repo.countShortcutsSince(userId, new Date(at.getTime() - 3_600_000).toISOString())
  if (recent >= RATE_LIMIT_PER_HOUR) return fail(429, 'Limite de 60 lançamentos por hora atingido.')

  const benefitCard = isBenefitCard(cardHint)
  const benefitId = benefitCard ? await repo.findBenefitAccount(userId) : null
  const accountId =
    benefitId ?? pickAccount(await repo.listCreditAccounts(userId), cardHint || null) ?? (await repo.ensureManualAccount(userId))
  const date = toLocalDate(at)
  await repo.insertTransaction({
    userId,
    accountId,
    date,
    occurredAt: at.toISOString(),
    amountCents: -cents,
    descriptionRaw: name,
    ...(benefitCard ? { paymentMethod: BENEFIT_PAYMENT_METHOD } : {}),
  })
  try {
    await repo.classify(userId, date)
  } catch {
    // A próxima sync reclassifica; o lançamento já está gravado.
    log('atalho: classificação falhou')
  }
  return { status: 201, body: { ok: true } }
}
