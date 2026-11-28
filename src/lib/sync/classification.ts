import { classify, type ClassifyTx, type Kind } from '@/lib/classify/classify'
import { normalizeText, onlyDigits } from '@/lib/classify/normalize'
import type { ClassificationPatch, SyncRepo } from './repo'

const DAY_MS = 86_400_000
const RECLASSIFY_DAYS = 90

/** `YYYY-MM-DD` menos `days` dias (aritmética em meio-dia UTC, sem efeito de DST). */
export function minusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10)
}

/** Distância em dias entre duas datas `YYYY-MM-DD`. */
export function dayDistance(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY_MS
}

export interface ClassifyWindow {
  from: string
  to: string
  /** CPF/CNPJ do dono vindos da Pluggy nesta sync (somados aos já gravados no perfil). */
  ownerDocs?: string[]
  ownerNames?: string[]
}

/**
 * Carrega a janela (todas as contas do usuário, mais os pares já ligados), roda o classificador
 * e grava só o que mudou. Linhas `classified_by = 'user'` nunca são tocadas.
 */
export async function classifyWindow(repo: SyncRepo, userId: string, w: ClassifyWindow): Promise<{ changed: number }> {
  const data = await repo.loadClassificationData(userId, w.from, w.to)
  const ownerDocs = [...new Set([...(w.ownerDocs ?? []), ...data.ownerDocs, data.ownerCpf ?? ''].map(onlyDigits).filter(Boolean))]
  const ownerNames = [...new Set([...(w.ownerNames ?? []), ...data.ownerNames].filter(Boolean))]
  const txs: ClassifyTx[] = data.transactions
  const result = classify(txs, {
    ownerDocs,
    ownerNames,
    accounts: data.accounts,
    rules: data.rules,
    merchantsById: Object.fromEntries(data.merchants.map((m) => [m.id, { categoryId: m.categoryId }])),
  })

  const categoryByName = new Map(data.categories.map((c) => [normalizeText(c.name), c.id]))
  const byId = new Map(data.transactions.map((t) => [t.id, t]))
  const auto = (id: string) => byId.get(id)?.classifiedBy === 'auto'

  const decisions: ClassificationPatch[] = []
  for (const d of result.decisions) {
    const cur = byId.get(d.id)
    if (!cur || cur.classifiedBy !== 'auto') continue
    const categoryId = d.categoryId ?? (d.categoryName ? categoryByName.get(normalizeText(d.categoryName)) : undefined) ?? null
    const merchantId = d.merchantId ?? null
    if (cur.kind === d.kind && cur.categoryId === categoryId && cur.merchantId === merchantId) continue
    decisions.push({ id: d.id, kind: d.kind as Kind, categoryId, merchantId })
  }
  const unlinked = result.unlinked.filter((id) => auto(id) && byId.get(id)?.linkedTransactionId !== null)
  const links = result.links.filter((l) => auto(l.id) && byId.get(l.id)?.linkedTransactionId !== l.linkedId)

  const changed = new Set([...decisions.map((d) => d.id), ...unlinked, ...links.map((l) => l.id)]).size
  if (changed > 0) await repo.applyClassification(userId, { unlinked, links, decisions })
  return { changed }
}

/** Reprocessa os últimos 90 dias (depois de criar uma regra, ou no "Sincronizar agora"). */
export async function reclassifyAll(deps: { repo: SyncRepo; today: string }, userId: string): Promise<{ changed: number }> {
  return classifyWindow(deps.repo, userId, { from: minusDays(deps.today, RECLASSIFY_DAYS), to: deps.today })
}
