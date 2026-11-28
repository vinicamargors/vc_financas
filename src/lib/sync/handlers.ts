import 'server-only'
import { toLocalDate } from '@/lib/format/date'
import { loadPluggySource, type PluggySource } from '@/lib/pluggy/source'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { reclassifyAll } from './classification'
import { createSupabaseSyncRepo, type SyncRepo } from './repo'
import { deleteTransactions, syncItem, type SyncResult } from './sync-item'

export interface WebhookDeps {
  findUserByWebhookSecret(secret: string): Promise<string | null>
  schedule(fn: () => Promise<void>): void
  runSync(userId: string, itemId: string): Promise<unknown>
  runDelete(userId: string, ids: string[]): Promise<void>
}

export async function handlePluggyWebhook(
  deps: WebhookDeps,
  req: { secret: string | null; body: unknown },
): Promise<{ status: 200 | 401 | 400 }> {
  if (!req.secret) return { status: 401 }
  const userId = await deps.findUserByWebhookSecret(req.secret)
  if (!userId) return { status: 401 }

  const body = req.body as { event?: unknown; itemId?: unknown; transactionIds?: unknown } | null
  if (typeof body !== 'object' || body === null) return { status: 400 }
  const { event, itemId } = body
  if (typeof event !== 'string' || typeof itemId !== 'string' || !event || !itemId) return { status: 400 }

  switch (event) {
    case 'item/updated':
    case 'transactions/created':
    case 'transactions/updated':
      deps.schedule(async () => void (await deps.runSync(userId, itemId)))
      return { status: 200 }
    case 'transactions/deleted': {
      const ids = body.transactionIds
      if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) return { status: 400 }
      deps.schedule(() => deps.runDelete(userId, ids as string[]))
      return { status: 200 }
    }
    default:
      return { status: 200 }
  }
}

export async function runDailySync(deps: {
  listConnections(): Promise<{ userId: string; itemId: string }[]>
  runSync(userId: string, itemId: string): Promise<unknown>
  log(e: unknown): void
}): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  for (const c of await deps.listConnections()) {
    try {
      await deps.runSync(c.userId, c.itemId)
      ok++
    } catch (e) {
      failed++
      deps.log(e)
    }
  }
  return { ok, failed }
}

/** Erros do SDK da Pluggy carregam a requisição (headers com segredos): só código/mensagem saem daqui. */
export function safeErrorMessage(e: unknown): string {
  let detail = 'erro desconhecido'
  if (typeof e === 'object' && e !== null) {
    const o = e as { code?: unknown; message?: unknown }
    if (typeof o.code === 'number' || typeof o.code === 'string') detail = String(o.code)
    else if (typeof o.message === 'string' && o.message) detail = o.message
  }
  return detail.slice(0, 200)
}

export interface RecordingSyncDeps {
  loadSource(userId: string): Promise<PluggySource>
  repo: SyncRepo
  today: string
  log(message: string): void
}

/** `syncItem` que, ao falhar, marca a conexão como SYNC_ERROR e relança um erro sanitizado. */
export async function runSyncRecordingFailure(
  deps: RecordingSyncDeps,
  userId: string,
  itemId: string,
): Promise<SyncResult> {
  try {
    const source = await deps.loadSource(userId)
    return await syncItem({ source, repo: deps.repo, today: deps.today }, userId, itemId)
  } catch (e) {
    const message = safeErrorMessage(e)
    deps.log(`sync falhou (item ${itemId}): ${message}`)
    try {
      const existing = await deps.repo.getConnection(userId, itemId)
      if (existing) {
        await deps.repo.upsertConnection({
          userId: existing.userId,
          pluggyItemId: existing.pluggyItemId,
          connectorName: existing.connectorName,
          connectorImageUrl: existing.connectorImageUrl ?? null,
          consentExpiresAt: existing.consentExpiresAt,
          lastSyncedAt: existing.lastSyncedAt,
          status: 'SYNC_ERROR',
          statusDetail: message,
        })
      }
    } catch (recordError) {
      deps.log(`falha ao registrar SYNC_ERROR: ${safeErrorMessage(recordError)}`)
    }
    throw new Error(message)
  }
}

/** Dependências de produção (service role). Sempre filtram por user_id. */
export function createProductionSync() {
  const admin = createAdminSupabase()
  const repo = createSupabaseSyncRepo(admin)
  const log = (message: string) => console.error(message)
  return {
    runSync: (userId: string, itemId: string) =>
      runSyncRecordingFailure(
        { loadSource: loadPluggySource, repo, today: toLocalDate(new Date()), log },
        userId,
        itemId,
      ),
    runDelete: (userId: string, ids: string[]) => deleteTransactions({ repo }, userId, ids),
    reclassifyAll: (userId: string) => reclassifyAll({ repo, today: toLocalDate(new Date()) }, userId),
    async findUserByWebhookSecret(secret: string) {
      const { data, error } = await admin
        .from('pluggy_credentials')
        .select('user_id')
        .eq('webhook_secret', secret)
        .maybeSingle()
      if (error) throw new Error(safeErrorMessage(error))
      return (data?.user_id as string | undefined) ?? null
    },
    async listConnections() {
      const { data, error } = await admin.from('connections').select('user_id, pluggy_item_id')
      if (error) throw new Error(safeErrorMessage(error))
      return (data ?? []).map((c) => ({ userId: c.user_id as string, itemId: c.pluggy_item_id as string }))
    },
    log,
  }
}
