import { describe, expect, it, vi } from 'vitest'
import type { Item } from 'pluggy-sdk'
import { open, seal } from '@/lib/crypto/secret-box'
import { createMemoryRepo } from '@/lib/sync/memory-repo'
import { syncItem } from '@/lib/sync/sync-item'
import type { PluggySource } from './source'
import { addItem, discoverItems, saveCredentials, type CredentialsRow, type OnboardingDeps } from './onboarding'

const KEY = Buffer.alloc(32, 7).toString('base64')
const U = 'user-1'
const ITEM = '3f2b1c9e-8a44-4d3e-9b0a-6c1d2e3f4a5b'

function fakeSource(over: Partial<PluggySource> = {}): PluggySource {
  return {
    fetchItem: async () =>
      ({ id: ITEM, status: 'UPDATED', connector: { name: 'Meu Pluggy' }, consentExpiresAt: null }) as unknown as Item,
    listItems: async () => 'unsupported',
    fetchAccounts: async () => [],
    fetchTransactions: async () => [],
    createConnectToken: async () => 'tok-1',
    registerWebhook: async () => 'wh-1',
    ...over,
  }
}

function setup(over: Partial<OnboardingDeps> = {}) {
  const saved: { userId: string; row: CredentialsRow }[] = []
  const source = fakeSource()
  const repo = createMemoryRepo()
  const deps: OnboardingDeps = {
    testCredentials: vi.fn(async () => ({ ok: true as const })),
    createSource: vi.fn(() => source),
    loadSource: vi.fn(async () => source),
    seal: (plain) => seal(plain, KEY),
    randomHex: () => 'ab'.repeat(32),
    saveCredentialsRow: vi.fn(async (userId, row) => void saved.push({ userId, row })),
    appUrl: 'https://app.example',
    runSync: (userId, itemId) =>
      syncItem({ source, repo, today: '2026-11-27' }, userId, itemId),
    ...over,
  }
  return { deps, saved, source, repo }
}

describe('saveCredentials', () => {
  it('credencial inválida: mensagem em português e nada salvo', async () => {
    const { deps, saved } = setup({ testCredentials: vi.fn(async () => ({ ok: false as const, reason: 'invalid' as const })) })
    const r = await saveCredentials(deps, U, 'id', 'secret')
    expect(r).toEqual({ ok: false, message: 'Client ID ou Secret incorretos. Confira no dashboard da Pluggy.' })
    expect(saved).toHaveLength(0)
  })

  it('falha de rede: mensagem distinta e nada salvo', async () => {
    const { deps, saved } = setup({ testCredentials: vi.fn(async () => ({ ok: false as const, reason: 'network' as const })) })
    const r = await saveCredentials(deps, U, 'id', 'secret')
    expect(r.ok).toBe(false)
    expect(saved).toHaveLength(0)
  })

  it('válida: salva segredo cifrado e registra o webhook com o segredo salvo', async () => {
    const registerWebhook = vi.fn(async () => 'wh-9')
    const { deps, saved } = setup({ createSource: vi.fn(() => fakeSource({ registerWebhook })) })
    const r = await saveCredentials(deps, U, ' my-id ', ' my-secret ')
    expect(r).toEqual({ ok: true })
    expect(saved).toHaveLength(1)
    const { userId, row } = saved[0]
    expect(userId).toBe(U)
    expect(row.clientId).toBe('my-id')
    expect(row.clientSecretEnc).not.toBe('my-secret')
    expect(open(row.clientSecretEnc, KEY)).toBe('my-secret')
    expect(row.webhookSecret).toBe('ab'.repeat(32))
    expect(row.webhookId).toBe('wh-9')
    expect(registerWebhook).toHaveBeenCalledWith('https://app.example/api/webhooks/pluggy', row.webhookSecret)
  })

  it('falha ao registrar webhook: não salva e não vaza detalhes do SDK', async () => {
    const boom = Object.assign(new Error('x'), { code: 500, request: { headers: { 'x-api-key': 'LEAK' } } })
    const { deps, saved } = setup({
      createSource: vi.fn(() => fakeSource({ registerWebhook: async () => Promise.reject(boom) })),
    })
    const r = await saveCredentials(deps, U, 'id', 'secret')
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('LEAK')
    expect(saved).toHaveLength(0)
  })
})

describe('discoverItems', () => {
  it('listItems com itens: modo listed', async () => {
    const items = [{ id: 'i1' }, { id: 'i2' }] as Item[]
    const { deps } = setup({ loadSource: async () => fakeSource({ listItems: async () => items }) })
    expect(await discoverItems(deps, U)).toEqual({ mode: 'listed', itemIds: ['i1', 'i2'] })
  })

  it('unsupported: modo widget com connect token', async () => {
    const { deps } = setup()
    expect(await discoverItems(deps, U)).toEqual({ mode: 'widget', connectToken: 'tok-1' })
  })
})

describe('addItem', () => {
  it('duas vezes com o mesmo item: uma conexão', async () => {
    const { deps, repo } = setup()
    await addItem(deps, U, ITEM)
    await addItem(deps, U, ITEM)
    expect(repo.dump().connections).toHaveLength(1)
  })

  it('rejeita itemId que não é UUID sem chamar a sincronização', async () => {
    const runSync = vi.fn()
    const { deps } = setup({ runSync })
    await expect(addItem(deps, U, '../etc')).rejects.toThrow('Item ID inválido')
    expect(runSync).not.toHaveBeenCalled()
  })
})
