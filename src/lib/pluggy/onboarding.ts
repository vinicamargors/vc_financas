import { safeErrorMessage } from '@/lib/sync/handlers'
import type { PluggySource } from './source'

export interface CredentialsRow {
  clientId: string
  clientSecretEnc: string
  webhookSecret: string
  webhookId: string
}

export interface OnboardingDeps {
  testCredentials(clientId: string, clientSecret: string): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'network' }>
  createSource(clientId: string, clientSecret: string): PluggySource
  loadSource(userId: string): Promise<PluggySource>
  seal(plain: string): string
  /** 32 bytes aleatórios em hex (64 caracteres). */
  randomHex(): string
  /** Upsert em `pluggy_credentials` (service role) filtrado por `userId`. */
  saveCredentialsRow(userId: string, row: CredentialsRow): Promise<void>
  appUrl: string
  /** Sincronização que registra falha na conexão e relança erro sanitizado. */
  runSync(userId: string, itemId: string): Promise<unknown>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const INVALID_CREDENTIALS_MESSAGE = 'Client ID ou Secret incorretos. Confira no dashboard da Pluggy.'
const NETWORK_MESSAGE = 'Não foi possível falar com a Pluggy agora. Tente de novo em instantes.'
const SAVE_FAILED_MESSAGE = 'Não foi possível concluir a configuração. Tente de novo.'

export async function saveCredentials(
  deps: OnboardingDeps,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = clientId.trim()
  const secret = clientSecret.trim()
  if (!id || !secret) return { ok: false, message: INVALID_CREDENTIALS_MESSAGE }

  const test = await deps.testCredentials(id, secret)
  if (!test.ok) return { ok: false, message: test.reason === 'invalid' ? INVALID_CREDENTIALS_MESSAGE : NETWORK_MESSAGE }

  try {
    const webhookSecret = deps.randomHex()
    const url = `${deps.appUrl.replace(/\/+$/, '')}/api/webhooks/pluggy`
    const webhookId = await deps.createSource(id, secret).registerWebhook(url, webhookSecret)
    await deps.saveCredentialsRow(userId, {
      clientId: id,
      clientSecretEnc: deps.seal(secret),
      webhookSecret,
      webhookId,
    })
    return { ok: true }
  } catch (e) {
    // Erros do SDK carregam headers com segredos: só a mensagem sanitizada é registrada.
    console.error(`falha ao salvar credenciais Pluggy: ${safeErrorMessage(e)}`)
    return { ok: false, message: SAVE_FAILED_MESSAGE }
  }
}

export async function discoverItems(
  deps: OnboardingDeps,
  userId: string,
): Promise<{ mode: 'listed'; itemIds: string[] } | { mode: 'widget'; connectToken: string }> {
  const source = await deps.loadSource(userId)
  const items = await source.listItems()
  if (items !== 'unsupported' && items.length > 0) return { mode: 'listed', itemIds: items.map((i) => i.id) }
  return { mode: 'widget', connectToken: await source.createConnectToken() }
}

/** Idempotente: a primeira sync cria a conexão (upsert por usuário + item). */
export async function addItem(deps: OnboardingDeps, userId: string, itemId: string): Promise<void> {
  if (!UUID.test(itemId)) throw new Error('Item ID inválido')
  await deps.runSync(userId, itemId)
}
