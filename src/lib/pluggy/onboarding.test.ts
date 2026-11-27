import { describe, expect, it, vi } from 'vitest'
import type { Item } from 'pluggy-sdk'
import { open, seal } from '@/lib/crypto/secret-box'
import { createMemoryRepo } from '@/lib/sync/memory-repo'
import { syncItem } from '@/lib/sync/sync-item'
import type { PluggySource } from './source'
import { addItem, APP_URL_MISSING_MESSAGE, DB_FAILED_MESSAGE, KEY_INVALID_MESSAGE, discoverItems, saveCredentials, type CredentialsRow, type OnboardingDeps } from './onboarding'

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
    deleteWebhook: async () => undefined,
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
    getWebhookId: vi.fn(async () => null),
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

  it('falha ao registrar webhook: salva mesmo assim, sem webhook, e não vaza detalhes do SDK', async () => {
    const boom = Object.assign(new Error('x'), { code: 500, request: { headers: { 'x-api-key': 'LEAK' } } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, saved } = setup({
      createSource: vi.fn(() => fakeSource({ registerWebhook: async () => Promise.reject(boom) })),
    })
    const r = await saveCredentials(deps, U, 'id', 'secret')
    expect(r.ok).toBe(true)
    expect(saved).toHaveLength(1)
    expect(saved[0].row.webhookId).toBeNull()
    expect(JSON.stringify(log.mock.calls)).not.toContain('LEAK')
    log.mockRestore()
  })

  it('CREDENTIALS_KEY inválida: mensagem específica e nada salvo', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, saved } = setup({ seal: () => { throw new Error('CREDENTIALS_KEY inválida') } })
    expect(await saveCredentials(deps, U, 'id', 'secret')).toEqual({ ok: false, message: KEY_INVALID_MESSAGE })
    expect(saved).toHaveLength(0)
    log.mockRestore()
  })
})

describe('saveCredentials: webhooks e APP_URL', () => {
  it('remove o webhook antigo antes de registrar o novo', async () => {
    const order: string[] = []
    const old = fakeSource({ deleteWebhook: async (id) => void order.push(`del:${id}`) })
    const fresh = fakeSource({ registerWebhook: async () => (order.push('reg'), 'wh-new') })
    const { deps } = setup({
      getWebhookId: async () => 'wh-old',
      loadSource: async () => old,
      createSource: () => fresh,
    })
    expect(await saveCredentials(deps, U, 'id', 'secret')).toEqual({ ok: true })
    expect(order).toEqual(['del:wh-old', 'reg'])
  })

  it('falha ao remover o antigo não impede salvar', async () => {
    const { deps, saved } = setup({
      getWebhookId: async () => 'wh-old',
      loadSource: async () => fakeSource({ deleteWebhook: async () => Promise.reject(new Error('x')) }),
    })
    expect((await saveCredentials(deps, U, 'id', 'secret')).ok).toBe(true)
    expect(saved).toHaveLength(1)
  })

  it('falha ao gravar a linha: remove o webhook recém-criado', async () => {
    const deleteWebhook = vi.fn(async () => undefined)
    const { deps } = setup({
      createSource: () => fakeSource({ registerWebhook: async () => 'wh-new', deleteWebhook }),
      saveCredentialsRow: async () => Promise.reject(new Error('db')),
    })
    expect(await saveCredentials(deps, U, 'id', 'secret')).toEqual({ ok: false, message: DB_FAILED_MESSAGE })
    expect(deleteWebhook).toHaveBeenCalledWith('wh-new')
  })

  it.each(['', 'ftp://x.com', 'http://app.example', 'não é url'])('APP_URL inválida (%s): nada acontece', async (appUrl) => {
    const { deps, saved } = setup({ appUrl })
    expect(await saveCredentials(deps, U, 'id', 'secret')).toEqual({ ok: false, message: APP_URL_MISSING_MESSAGE })
    expect(deps.testCredentials).not.toHaveBeenCalled()
    expect(saved).toHaveLength(0)
  })

  it('aceita http://localhost em desenvolvimento', async () => {
    const registerWebhook = vi.fn(async (_url: string, _secret: string) => 'w')
    const { deps } = setup({ appUrl: 'http://localhost:3000/', createSource: () => fakeSource({ registerWebhook }) })
    expect((await saveCredentials(deps, U, 'id', 'secret')).ok).toBe(true)
    expect(registerWebhook.mock.calls[0][0]).toBe('http://localhost:3000/api/webhooks/pluggy')
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
