import { detectInstitution, inheritInstitution, isMeuPluggy } from '@/lib/pluggy/institution'
import type { PluggySource } from '@/lib/pluggy/source'
import {
  mapAccount,
  mapReservedBalances,
  mapTransaction,
  type AccountRow,
  type SavingsBoxRow,
  type TransactionRow,
} from '@/lib/pluggy/map'
import { toLocalDate } from '@/lib/format/date'
import type { SyncRepo } from './repo'

export interface SyncDeps {
  source: PluggySource
  repo: SyncRepo
  /** Data local de hoje (`YYYY-MM-DD`, America/Sao_Paulo). */
  today: string
  /** Relógio para `last_synced_at`; padrão `new Date()`. */
  now?: () => Date
}

export interface SyncResult {
  accounts: number
  transactions: number
  status: string
}

const DAY_MS = 86_400_000
const INITIAL_DAYS = 90
const OVERLAP_DAYS = 3
/** Status em que não há dados novos a buscar. */
const MERCADO_PAGO_RE = /mercado\s*pago/i
const BLOCKED_STATUSES = new Set(['LOGIN_ERROR', 'WAITING_USER_INPUT'])

/** `YYYY-MM-DD` menos `days` dias (aritmética em meio-dia UTC, sem efeito de DST). */
function minusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10)
}

/** Erros do SDK carregam a requisição (headers com segredos): só propagamos código/mensagem. */
async function guarded<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    let detail = 'erro desconhecido'
    if (typeof e === 'object' && e !== null) {
      const o = e as {
        code?: unknown
        message?: unknown
        response?: { statusCode?: unknown }
      }
      const code = [o.code, o.response?.statusCode].find((v) => typeof v === 'number' || typeof v === 'string')
      detail = code != null ? String(code) : typeof o.message === 'string' ? o.message : detail
    }
    throw new Error(`Falha ao consultar a Pluggy: ${detail}`)
  }
}

export async function syncItem(deps: SyncDeps, userId: string, itemId: string): Promise<SyncResult> {
  const { source, repo, today } = deps
  const now = (deps.now ?? (() => new Date()))()
  const item = await guarded(source.fetchItem(itemId))
  const existing = await repo.getConnection(userId, itemId)

  const base = {
    userId,
    pluggyItemId: itemId,
    connectorName: item.connector?.name ?? existing?.connectorName ?? '',
    connectorImageUrl: item.connector?.imageUrl ?? existing?.connectorImageUrl ?? null,
    status: item.status,
    statusDetail: item.error?.code ?? item.executionStatus ?? null,
    consentExpiresAt: item.consentExpiresAt ? new Date(item.consentExpiresAt).toISOString() : null,
  }
  const connection = await repo.upsertConnection({
    ...base,
    lastSyncedAt: existing?.lastSyncedAt ?? null,
  })
  if (BLOCKED_STATUSES.has(item.status)) return { accounts: 0, transactions: 0, status: item.status }

  const from = connection.lastSyncedAt
    ? minusDays(toLocalDate(connection.lastSyncedAt), OVERLAP_DAYS)
    : minusDays(today, INITIAL_DAYS)

  const accounts = await guarded(source.fetchAccounts(itemId))
  const logoCache = new Map<string, string | null>()
  const logoFor = async (institution: string): Promise<string | null> => {
    if (!isMeuPluggy(base.connectorName) && institution === base.connectorName) return base.connectorImageUrl ?? null
    if (!source.findConnectorLogo) return null
    if (!logoCache.has(institution)) {
      // Logo é enfeite: falha na busca não pode derrubar a sincronização.
      logoCache.set(institution, await source.findConnectorLogo(institution).catch(() => null))
    }
    return logoCache.get(institution) ?? null
  }
  const accountRows: AccountRow[] = []
  const institutions = inheritInstitution(accounts.map((a) => detectInstitution(a, base.connectorName)))
  for (const [i, a] of accounts.entries()) {
    const institution = institutions[i]
    accountRows.push(
      mapAccount(a, {
        userId,
        connectionId: connection.id,
        institution,
        logoUrl: await logoFor(institution),
      }),
    )
  }
  const rows = await repo.upsertAccounts(accountRows)
  const byExternal = new Map(rows.map((r) => [r.externalId, r]))

  // Caixinhas (saldo reservado, fora do saldo livre). As que somem da Pluggy ficam como estão.
  const boxRows: SavingsBoxRow[] = []
  for (const a of accounts) {
    const row = byExternal.get(a.id)
    if (row) boxRows.push(...mapReservedBalances(a, { userId, accountRowId: row.id }))
  }
  const accountsWithBoxes = new Set(boxRows.map((b) => b.accountId))
  if (boxRows.length) {
    const stored = await repo.upsertSavingsBoxes(boxRows)
    const cents = new Map(boxRows.map((b) => [b.externalId, b.balanceCents]))
    await repo.upsertSavingsBoxSnapshots(
      userId,
      today,
      stored.map((b) => ({
        boxId: b.id,
        balanceCents: cents.get(b.externalId) ?? 0,
      })),
    )
  }

  let txCount = 0
  for (const [i, a] of accounts.entries()) {
    const row = byExternal.get(a.id)
    if (!row) continue
    const accountType = row.type as 'BANK' | 'CREDIT'
    const txs = await guarded(source.fetchTransactions(a.id, from))
    const mapped: TransactionRow[] = txs.map((t) =>
      mapTransaction(t, {
        userId,
        accountRowId: row.id,
        accountType,
        hasBoxes: accountsWithBoxes.has(row.id) || MERCADO_PAGO_RE.test(accountRows[i].institution),
      }),
    )
    txCount += await repo.upsertTransactions(mapped)
    await repo.upsertBalanceSnapshot(userId, row.id, today, accountRows[i].balanceCents)
  }

  await repo.upsertConnection({ ...base, lastSyncedAt: now.toISOString() })
  return {
    accounts: accounts.length,
    transactions: txCount,
    status: item.status,
  }
}

export async function deleteTransactions(deps: Pick<SyncDeps, 'repo'>, userId: string, externalIds: string[]): Promise<void> {
  if (externalIds.length === 0) return
  await deps.repo.markTransactionsDeleted(userId, externalIds)
}
