import { createProductionSync, runDailySync, safeErrorMessage } from '@/lib/sync/handlers'

export const maxDuration = 300

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(null, { status: 401 })
  }
  const sync = createProductionSync()
  const result = await runDailySync({
    listConnections: sync.listConnections,
    runSync: sync.runSync,
    log: (e) => sync.log(`cron: ${safeErrorMessage(e)}`),
  })
  return Response.json(result)
}
