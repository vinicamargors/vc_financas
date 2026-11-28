import 'server-only'
import { PluggyClient } from 'pluggy-sdk'
import type { Account, Item, Transaction } from 'pluggy-sdk'
import { open } from '@/lib/crypto/secret-box'
import { createAdminSupabase } from '@/lib/supabase/admin'

export interface PluggySource {
  fetchItem(id: string): Promise<Item>
  listItems(): Promise<Item[] | 'unsupported'>
  fetchAccounts(itemId: string): Promise<Account[]>
  /** `from` no formato YYYY-MM-DD. */
  fetchTransactions(accountId: string, from: string): Promise<Transaction[]>
  createConnectToken(): Promise<string>
  /** Registra o webhook e devolve o id. O segredo é enviado no header `x-vc-secret`. */
  registerWebhook(url: string, secret: string): Promise<string>
  deleteWebhook(id: string): Promise<void>
  /** Logo do conector com esse nome (Brasil), se houver. */
  findConnectorLogo?(name: string): Promise<string | null>
}

/** O SDK rejeita com o corpo da resposta (`{ code }`) ou com um HTTPError (`response.statusCode`). */
function httpStatus(e: unknown): number | undefined {
  if (typeof e !== 'object' || e === null) return undefined
  const o = e as { code?: unknown; status?: unknown; response?: { statusCode?: unknown } }
  for (const v of [o.code, o.status, o.response?.statusCode]) {
    if (typeof v === 'number') return v
  }
  return undefined
}

export function createPluggySource(clientId: string, clientSecret: string): PluggySource {
  const client = new PluggyClient({ clientId, clientSecret })
  return {
    fetchItem: (id) => client.fetchItem(id),
    async listItems() {
      try {
        return await client.fetchAllItems()
      } catch (e) {
        const s = httpStatus(e)
        if (s === 401 || s === 403 || s === 404) return 'unsupported'
        throw e
      }
    },
    async fetchAccounts(itemId) {
      return (await client.fetchAccounts(itemId)).results
    },
    fetchTransactions: (accountId, from) => client.fetchAllTransactions(accountId, { dateFrom: from }),
    async findConnectorLogo(name) {
      const { results } = await client.fetchConnectors({ name, countries: ['BR'] })
      const hit = results.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? results[0]
      return hit?.imageUrl ?? null
    },
    async createConnectToken() {
      return (await client.createConnectToken()).accessToken
    },
    async registerWebhook(url, secret) {
      const w = await client.createWebhook('all', url, { 'x-vc-secret': secret })
      return w.id
    },
    deleteWebhook: (id) => client.deleteWebhook(id),
  }
}

export async function loadPluggySource(userId: string): Promise<PluggySource> {
  const { data, error } = await createAdminSupabase()
    .from('pluggy_credentials')
    .select('client_id, client_secret_enc')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Credenciais da Pluggy não configuradas')
  return createPluggySource(data.client_id, open(data.client_secret_enc))
}

export async function testCredentials(
  clientId: string,
  clientSecret: string,
): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'network' }> {
  try {
    // Criar um connect token exige POST /auth válido, sem efeitos colaterais.
    await new PluggyClient({ clientId, clientSecret }).createConnectToken()
    return { ok: true }
  } catch (e) {
    const s = httpStatus(e)
    return { ok: false, reason: s === 401 || s === 403 ? 'invalid' : 'network' }
  }
}
