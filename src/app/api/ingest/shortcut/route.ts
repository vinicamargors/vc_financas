import { readLimitedJson } from '@/lib/shortcut/body'
import { createSupabaseIngestRepo } from '@/lib/shortcut/supabase-repo'
import { ingestShortcut } from '@/lib/shortcut/ingest'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { safeErrorMessage } from '@/lib/sync/safe-error'

/** Atalho do iPhone. Nunca loga o token nem o corpo. */
export async function POST(req: Request): Promise<Response> {
  try {
    const read = await readLimitedJson(req)
    if (read.tooLarge) return Response.json({ error: 'Corpo grande demais.' }, { status: 413 })
    const r = await ingestShortcut(createSupabaseIngestRepo(createAdminSupabase()), {
      authorization: req.headers.get('authorization'),
      body: read.body,
    })
    return Response.json(r.body, { status: r.status })
  } catch (e) {
    console.error(`atalho falhou: ${safeErrorMessage(e)}`)
    return Response.json({ error: 'Não foi possível gravar. Tente de novo.' }, { status: 500 })
  }
}
