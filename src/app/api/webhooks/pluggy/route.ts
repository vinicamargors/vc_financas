import { after } from 'next/server'
import { createProductionSync, handlePluggyWebhook, safeErrorMessage } from '@/lib/sync/handlers'

export const maxDuration = 60

export async function POST(req: Request): Promise<Response> {
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // corpo inválido: o handler responde 400 (ou 401 se o segredo falhar antes)
  }
  try {
    const sync = createProductionSync()
    const { status } = await handlePluggyWebhook(
      {
        findUserByWebhookSecret: sync.findUserByWebhookSecret,
        runSync: sync.runSync,
        runDelete: sync.runDelete,
        schedule: (fn) =>
          after(async () => {
            try {
              await fn()
            } catch (e) {
              sync.log(`webhook: ${safeErrorMessage(e)}`)
            }
          }),
      },
      { secret: req.headers.get('x-vc-secret'), body },
    )
    return new Response(null, { status })
  } catch (e) {
    console.error(`webhook: ${safeErrorMessage(e)}`)
    return new Response(null, { status: 500 })
  }
}
