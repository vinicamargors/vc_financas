'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { confirmPendingCore, teachPlaceCore, type PendingChoice, type TeachPlaceInput } from '@/lib/review/review'
import { createSupabaseReviewStore } from '@/lib/review/supabase-store'
import { safeErrorMessage } from '@/lib/sync/safe-error'
import { resolveSameEntry, type SameChoice } from '@/lib/reconcile/resolve'
import { createSupabaseSameEntryStore } from '@/lib/reconcile/supabase-store'

export type ReviewResult = { ok: true } | { ok: false; message: string }

const FAILED = 'Não deu para salvar. Tente de novo.'

function refresh() {
  for (const p of ['/revisar', '/', '/extrato']) revalidatePath(p)
}

async function run(fn: (store: ReturnType<typeof createSupabaseReviewStore>, userId: string) => Promise<void>): Promise<ReviewResult> {
  const user = await requireUser()
  try {
    await fn(createSupabaseReviewStore(await createServerSupabase()), user.id)
  } catch (e) {
    console.error(`revisar falhou: ${safeErrorMessage(e)}`)
    return { ok: false, message: FAILED }
  }
  refresh()
  return { ok: true }
}

export async function confirmPending(txId: string, choice: PendingChoice, categoryId?: string | null): Promise<ReviewResult> {
  return run((store, userId) => confirmPendingCore(store, userId, txId, choice, categoryId))
}

export async function teachPlace(input: TeachPlaceInput): Promise<ReviewResult> {
  const ids = Array.isArray(input?.ids) ? input.ids.filter((x): x is string => typeof x === 'string').slice(0, 1000) : []
  return run((store, userId) =>
    teachPlaceCore(store, userId, { displayName: String(input?.displayName ?? ''), categoryId: input?.categoryId ?? null, ids, remember: input?.remember !== false }),
  )
}

/** "É o mesmo lançamento?": funde o manual com o candidato ou marca como conferido. */
export async function resolveSame(manualId: string, choice: SameChoice): Promise<ReviewResult> {
  const user = await requireUser()
  try {
    await resolveSameEntry(createSupabaseSameEntryStore(await createServerSupabase()), user.id, String(manualId), choice)
  } catch (e) {
    console.error(`conferir lançamento falhou: ${safeErrorMessage(e)}`)
    return { ok: false, message: FAILED }
  }
  refresh()
  return { ok: true }
}
