import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '@/lib/pluggy/fixtures'
import type { PluggySource } from '@/lib/pluggy/source'
import { createSupabaseSyncRepo } from './repo'
import { syncItem } from './sync-item'

// Roda só com a stack local do Supabase (`supabase start`) e as variáveis em .env.local.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const enabled = Boolean(url && key && /127\.0\.0\.1|localhost/.test(url))

describe.skipIf(!enabled)('createSupabaseSyncRepo (Supabase local)', () => {
  const admin = createClient(url ?? 'http://localhost', key ?? 'x', { auth: { persistSession: false } })
  let userId: string | undefined

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId) // cascata limpa o resto
  })

  it('sincroniza duas vezes sem duplicar e preserva deleted_at', async () => {
    const created = await admin.auth.admin.createUser({ email: `sync-${Date.now()}@example.test`, email_confirm: true })
    if (created.error) throw created.error
    userId = created.data.user.id
    const uid = userId
    const repo = createSupabaseSyncRepo(admin)
    const source = {
      fetchItem: async () => ({ id: 'item-int', connector: { name: 'Banco Teste' }, status: 'UPDATED', executionStatus: 'SUCCESS', error: null, consentExpiresAt: null }),
      fetchAccounts: async () => [
        makeAccount({
          id: 'acc-int',
          balance: 12.34,
          bankData: { reservedBalances: [{ name: 'Cofrinho', identification: 'box-int', availableAmounts: [{ amount: 50.25, currencyCode: 'BRL', remuneration: { indexer: 'CDI', postFixedIndexerPercentage: 1.2 } }] }] },
        } as never),
      ],
      fetchTransactions: async () => [makeTransaction({ id: 'ti1' }), makeTransaction({ id: 'ti2', amount: 5 })],
    } as unknown as PluggySource
    const deps = { source, repo, today: '2026-11-27' }

    await syncItem(deps, uid, 'item-int')
    await repo.markTransactionsDeleted(uid, ['ti1'])
    await syncItem(deps, uid, 'item-int')

    const tx = await admin.from('transactions').select('external_id, deleted_at').eq('user_id', uid)
    expect(tx.data).toHaveLength(2)
    expect(tx.data?.find((t) => t.external_id === 'ti1')?.deleted_at).not.toBeNull()
    const snaps = await admin.from('balance_snapshots').select('balance_cents').eq('user_id', uid)
    expect(snaps.data).toEqual([{ balance_cents: 1234 }])
    const conns = await admin.from('connections').select('status, last_synced_at').eq('user_id', uid)
    expect(conns.data).toHaveLength(1)
    const boxes = await admin.from('savings_boxes').select('name, balance_cents, cdi_percent').eq('user_id', uid)
    expect(boxes.data).toEqual([{ name: 'Cofrinho', balance_cents: 5025, cdi_percent: 120 }])
    const boxSnaps = await admin.from('savings_box_snapshots').select('balance_cents').eq('user_id', uid)
    expect(boxSnaps.data).toEqual([{ balance_cents: 5025 }])
    expect(conns.data?.[0].last_synced_at).not.toBeNull()
  })
})
