'use server'

import { randomBytes } from 'node:crypto'
import { redirect } from 'next/navigation'
import { seal } from '@/lib/crypto/secret-box'
import {
  addItem,
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
    appUrl: process.env.APP_URL ?? '',
    runSync: sync.runSync,
  }
}

export async function saveCredentialsAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const result = await saveCredentials(
    productionDeps(),
    user.id,
    String(formData.get('clientId') ?? ''),
    String(formData.get('clientSecret') ?? ''),
  )
  redirect(result.ok ? `${PAGE}?salvo=1` : `${PAGE}?erro=${encodeURIComponent(result.message)}`)
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
    return { ok: false, message: 'Não foi possível consultar a Pluggy. Confira as credenciais no passo 2.' }
  }
}

export async function addItemsAction(itemIds: string[]): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser()
  const deps = productionDeps()
  try {
    // Sequencial: cada sync consulta a Pluggy e grava 90 dias de histórico.
    for (const id of itemIds.slice(0, 20)) await addItem(deps, user.id, String(id).trim())
    return { ok: true }
  } catch (e) {
    // addItem/runSync já relançam mensagens sanitizadas.
    return { ok: false, message: safeErrorMessage(e) }
  }
}
