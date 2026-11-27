'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { seal } from '@/lib/crypto/secret-box'
import {
  addItem,
  APP_URL_MISSING_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  discoverItems,
  saveCredentials,
  type OnboardingDeps,
} from '@/lib/pluggy/onboarding'
import { createPluggySource, loadPluggySource, testCredentials } from '@/lib/pluggy/source'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/server'
import { createProductionSync, safeErrorMessage } from '@/lib/sync/handlers'

const PAGE = '/config/bancos'

function productionDeps(): OnboardingDeps {
  const sync = createProductionSync()
  return {
    testCredentials,
    createSource: createPluggySource,
    loadSource: loadPluggySource,
    seal: (plain) => seal(plain),
    randomHex: () => randomBytes(32).toString('hex'),
    async saveCredentialsRow(userId, row) {
      const { error } = await createAdminSupabase()
        .from('pluggy_credentials')
        .upsert(
          {
            user_id: userId,
            client_id: row.clientId,
            client_secret_enc: row.clientSecretEnc,
            webhook_secret: row.webhookSecret,
            webhook_id: row.webhookId,
          },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    async getWebhookId(userId) {
      const { data, error } = await createAdminSupabase()
        .from('pluggy_credentials')
        .select('webhook_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return (data?.webhook_id as string | null | undefined) ?? null
    },
    appUrl: process.env.APP_URL ?? '',
    runSync: sync.runSync,
  }
}

/** O redirect carrega só um código; a página mapeia para texto fixo. */
function errorCodeFor(message: string): string {
  if (message === INVALID_CREDENTIALS_MESSAGE) return 'credenciais'
  if (message === APP_URL_MISSING_MESSAGE) return 'app-url'
  return 'falha'
}

export async function saveCredentialsAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const result = await saveCredentials(
    productionDeps(),
    user.id,
    String(formData.get('clientId') ?? ''),
    String(formData.get('clientSecret') ?? ''),
  )
  redirect(result.ok ? `${PAGE}?salvo=1` : `${PAGE}?erro=${errorCodeFor(result.message)}`)
}

export type DiscoverResult =
  | { ok: true; mode: 'listed'; itemIds: string[] }
  | { ok: true; mode: 'widget'; connectToken: string }
  | { ok: false; message: string }

export async function discoverItemsAction(): Promise<DiscoverResult> {
  const user = await requireUser()
  try {
    return { ok: true, ...(await discoverItems(productionDeps(), user.id)) }
  } catch (e) {
    console.error(`falha ao buscar itens: ${safeErrorMessage(e)}`)
    return { ok: false, message: 'Não foi possível falar com a Pluggy. Tente de novo.' }
  }
}

const ADD_FAILED = 'Não foi possível adicionar a conexão. Confira o Item ID e tente de novo.'
const INVALID_ITEM = 'Item ID inválido'

export async function addItemsAction(itemIds: string[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser()
  const deps = productionDeps()
  const ids = itemIds.slice(0, 20)
  let added = 0
  let invalid = false
  // Sequencial: cada sync consulta a Pluggy e grava 90 dias de histórico. Uma falha não interrompe as demais.
  for (const id of ids) {
    try {
      await addItem(deps, user.id, String(id).trim())
      added++
    } catch (e) {
      const detail = safeErrorMessage(e)
      if (detail === INVALID_ITEM) invalid = true
      console.error(`falha ao adicionar item: ${detail}`)
    }
  }
  if (added === ids.length) return { ok: true }
  if (added === 0) return { ok: false, message: invalid && ids.length === 1 ? INVALID_ITEM : ADD_FAILED }
  return { ok: false, message: `${added} de ${ids.length} conexões adicionadas. Tente de novo para as demais.` }
}
