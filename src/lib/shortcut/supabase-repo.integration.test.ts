import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '@/lib/pluggy/fixtures'
import type { PluggySource } from '@/lib/pluggy/source'
import { createSupabaseSyncRepo } from '@/lib/sync/repo'
import { syncItem } from '@/lib/sync/sync-item'
import { ingestShortcut } from './ingest'
import { createSupabaseIngestRepo } from './supabase-repo'
import { generateToken } from './token'

// Roda só com a stack local do Supabase (`supabase start`) e as variáveis em .env.local.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const enabled = Boolean(url && key && /127\.0\.0\.1|localhost/.test(url))

describe.skipIf(!enabled)('Atalho no Supabase local', () => {
  const admin = createClient(url ?? 'http://localhost', key ?? 'x', { auth: { persistSession: false } })
  const users: string[] = []

  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id) // cascata limpa o resto
  })

  async function newUser(tag: string) {
    const created = await admin.auth.admin.createUser({ email: `${tag}-${Date.now()}@example.test`, email_confirm: true })
    if (created.error) throw created.error
    const id = created.data.user.id
    users.push(id)
    const { token, hash } = generateToken()
    const { error } = await admin.from('shortcut_tokens').insert({ user_id: id, token_hash: hash })
    if (error) throw error
    return { id, token }
  }

  const repo = createSupabaseIngestRepo(admin)
  const post = (token: string, body: unknown) => ingestShortcut(repo, { authorization: `Bearer ${token}`, body })
  const shortcuts = async (uid: string) => {
    const { data, error } = await admin
      .from('transactions')
      .select('id, account_id, external_id, amount_cents, description_raw, deleted_at, linked_transaction_id, created_at')
      .eq('user_id', uid)
      .eq('source', 'shortcut')
      .order('created_at')
    if (error) throw error
    return data ?? []
  }

  it('grava na conta Atalho criada uma vez, isolada por usuário', async () => {
    const a = await newUser('sca')
    const b = await newUser('scb')
    expect((await post(a.token, { amount: 'R$ 9,00', merchant: 'Padaria' })).status).toBe(201)
    expect((await post(a.token, { amount: '12,50', merchant: 'Café' })).status).toBe(201)
    expect((await ingestShortcut(repo, { authorization: 'Bearer nope', body: { amount: 1, merchant: 'X' } })).status).toBe(401)

    const rows = await shortcuts(a.id)
    expect(rows.map((r) => [r.amount_cents, r.description_raw, r.external_id])).toEqual([
      [-900, 'Padaria', null],
      [-1250, 'Café', null],
    ])
    const accs = await admin.from('accounts').select('id, type, name, connection_id, user_id').eq('external_id', 'atalho').in('user_id', [a.id, b.id])
    expect(accs.data).toEqual([{ id: rows[0].account_id, type: 'MANUAL', name: 'Atalho', connection_id: null, user_id: a.id }])
    expect(rows[1].account_id).toBe(rows[0].account_id)
    expect(await shortcuts(b.id)).toEqual([])
    expect(await repo.countShortcutsSince(a.id, new Date(Date.now() - 3_600_000).toISOString())).toBe(2)
    expect(await repo.countShortcutsSince(b.id, new Date(Date.now() - 3_600_000).toISOString())).toBe(0)
  })

  it('escolhe o cartão pela dica e funde com a compra que a Pluggy traz depois', async () => {
    const u = await newUser('scm')
    const today = new Date().toISOString().slice(0, 10)
    const card = makeAccount({ id: 'card-x', type: 'CREDIT' as never, subtype: 'CREDIT_CARD' as never, name: 'Nubank Ultravioleta' })
    const buy = (id: string, amount: number) =>
      makeTransaction({ id, type: 'DEBIT', amount, description: 'PADARIA*1', date: new Date(`${today}T00:00:00Z`) } as never)
    let txs = [buy('p-old', 5)]
    const source = {
      fetchItem: async () => ({ id: 'item-sc', connector: { name: 'Nubank' }, status: 'UPDATED', executionStatus: 'SUCCESS', error: null, consentExpiresAt: null }),
      fetchAccounts: async () => [card],
      fetchTransactions: async () => txs,
    } as unknown as PluggySource
    const sync = () => syncItem({ source, repo: createSupabaseSyncRepo(admin), today }, u.id, 'item-sc')
    await sync()
    // Compra antiga: gravada uma hora antes do Atalho (fora da tolerância de 10 min).
    await admin
      .from('transactions')
      .update({ created_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq('user_id', u.id)
      .eq('external_id', 'p-old')

    expect((await post(u.token, { amount: 9, merchant: 'Padaria', card: 'Cartão nubank' })).status).toBe(201)
    expect((await post(u.token, { amount: 5, merchant: 'Antiga' })).status).toBe(201)
    const [s9, s5] = await shortcuts(u.id)
    const { data: cardRow } = await admin.from('accounts').select('id').eq('user_id', u.id).eq('external_id', 'card-x').single()
    expect(s9.account_id).toBe(cardRow!.id)
    expect(s5.account_id).toBe(cardRow!.id) // único cartão

    // O usuário escolhe a categoria no atalho.
    const { data: cat } = await admin.from('categories').select('id').eq('user_id', u.id).eq('name', 'Alimentação').single()
    await admin.from('transactions').update({ category_id: cat!.id, kind: 'expense', classified_by: 'user' }).eq('id', s9.id)

    txs = [buy('p-old', 5), buy('p9', 9)]
    await sync()
    const after = await shortcuts(u.id)
    const { data: p9 } = await admin.from('transactions').select('id, category_id, classified_by').eq('user_id', u.id).eq('external_id', 'p9').single()
    expect(after.find((r) => r.id === s9.id)).toMatchObject({ linked_transaction_id: p9!.id })
    expect(after.find((r) => r.id === s9.id)?.deleted_at).not.toBeNull()
    expect(p9).toMatchObject({ category_id: cat!.id, classified_by: 'user' })
    // A compra de R$ 5 já existia antes do Atalho: não funde.
    expect(after.find((r) => r.id === s5.id)).toMatchObject({ deleted_at: null, linked_transaction_id: null })

    // Reaplicar a mesma fusão não faz nada (guarda no soft delete).
    const syncRepo = createSupabaseSyncRepo(admin)
    await syncRepo.applyShortcutMerges(u.id, [
      { shortcut: { id: s9.id, accountId: s9.account_id, date: today, amountCents: -900, createdAt: s9.created_at, merchantId: null, categoryId: 'x', kind: null, classifiedBy: 'auto' }, pluggyId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    ])
    expect((await shortcuts(u.id)).find((r) => r.id === s9.id)?.linked_transaction_id).toBe(p9!.id)
  })
})
