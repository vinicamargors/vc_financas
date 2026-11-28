import { createSupabaseIngestRepo } from '@/lib/shortcut/supabase-repo'
import { ingestShortcut } from '@/lib/shortcut/ingest'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { safeErrorMessage } from '@/lib/sync/safe-error'

const MAX_BODY = 4096

/** Atalho do iPhone. Nunca loga o token nem o corpo. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown = null
  try {
    const text = await req.text()
    if (text.length <= MAX_BODY) body = JSON.parse(text)
  } catch {
    body = null
  }
  try {
    const r = await ingestShortcut(createSupabaseIngestRepo(createAdminSupabase()), {
      authorization: req.headers.get('authorization'),
      body,
    })
    return Response.json(r.body, { status: r.status })
  } catch (e) {
    console.error(`atalho falhou: ${safeErrorMessage(e)}`)
    return Response.json({ error: 'Não foi possível gravar. Tente de novo.' }, { status: 500 })
  }
}
