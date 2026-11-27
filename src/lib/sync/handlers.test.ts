import { describe, expect, it, vi } from 'vitest'
import type { Item } from 'pluggy-sdk'
import type { PluggySource } from '@/lib/pluggy/source'
import {
  handlePluggyWebhook,
  runDailySync,
  runSyncRecordingFailure,
  safeErrorMessage,
} from './handlers'
import { createMemoryRepo } from './memory-repo'

function setup(over: Partial<Parameters<typeof handlePluggyWebhook>[0]> = {}) {
  const scheduled: (() => Promise<void>)[] = []
  const deps = {
    findUserByWebhookSecret: vi.fn(async (s: string) => (s === 'good' ? 'user-1' : null)),
    schedule: vi.fn((fn: () => Promise<void>) => void scheduled.push(fn)),
    runSync: vi.fn(async () => undefined),
    runDelete: vi.fn(async () => undefined),
    ...over,
  }
  return { deps, scheduled }
}

describe('handlePluggyWebhook', () => {
  it('401 sem segredo ou com segredo desconhecido, sem agendar', async () => {
    const { deps } = setup()
    const body = { event: 'item/updated', itemId: 'i1' }
    expect(await handlePluggyWebhook(deps, { secret: null, body })).toEqual({ status: 401 })
    expect(await handlePluggyWebhook(deps, { secret: 'bad', body })).toEqual({ status: 401 })
    expect(deps.schedule).not.toHaveBeenCalled()
  })

  it('400 sem event ou itemId', async () => {
    const { deps } = setup()
    expect(await handlePluggyWebhook(deps, { secret: 'good', body: { itemId: 'i1' } })).toEqual({ status: 400 })
    expect(await handlePluggyWebhook(deps, { secret: 'good', body: { event: 'item/updated' } })).toEqual({ status: 400 })
    expect(await handlePluggyWebhook(deps, { secret: 'good', body: null })).toEqual({ status: 400 })
    expect(deps.schedule).not.toHaveBeenCalled()
  })

  it('item/updated agenda runSync(usuário do segredo, itemId)', async () => {
    const { deps, scheduled } = setup()
    const r = await handlePluggyWebhook(deps, { secret: 'good', body: { event: 'item/updated', itemId: 'i1' } })
    expect(r).toEqual({ status: 200 })
    expect(deps.schedule).toHaveBeenCalledTimes(1)
    expect(deps.runSync).not.toHaveBeenCalled()
    await scheduled[0]()
    expect(deps.runSync).toHaveBeenCalledWith('user-1', 'i1')
  })

  it.each(['transactions/created', 'transactions/updated'])('%s dispara runSync', async (event) => {
    const { deps, scheduled } = setup()
    await handlePluggyWebhook(deps, { secret: 'good', body: { event, itemId: 'i1' } })
    await scheduled[0]()
    expect(deps.runSync).toHaveBeenCalledWith('user-1', 'i1')
  })

  it('transactions/deleted agenda runDelete com os ids', async () => {
    const { deps, scheduled } = setup()
    const r = await handlePluggyWebhook(deps, {
      secret: 'good',
      body: { event: 'transactions/deleted', itemId: 'i1', transactionIds: ['a', 'b'] },
    })
    expect(r).toEqual({ status: 200 })
    await scheduled[0]()
    expect(deps.runDelete).toHaveBeenCalledWith('user-1', ['a', 'b'])
    expect(deps.runSync).not.toHaveBeenCalled()
  })

  it('transactions/deleted sem transactionIds válidos é 400', async () => {
    const { deps } = setup()
    const r = await handlePluggyWebhook(deps, {
      secret: 'good',
      body: { event: 'transactions/deleted', itemId: 'i1', transactionIds: 'x' },
    })
    expect(r).toEqual({ status: 400 })
  })

  it('outros eventos: 200 sem ação', async () => {
    const { deps } = setup()
    const r = await handlePluggyWebhook(deps, { secret: 'good', body: { event: 'item/created', itemId: 'i1' } })
    expect(r).toEqual({ status: 200 })
    expect(deps.schedule).not.toHaveBeenCalled()
  })

  it('retorna antes de runSync terminar', async () => {
    let finish!: () => void
    const pending = new Promise<void>((res) => (finish = res))
    let started = false
    const { deps, scheduled } = setup({
      runSync: vi.fn(async () => {
        started = true
        await pending
      }),
    })
    const r = await handlePluggyWebhook(deps, { secret: 'good', body: { event: 'item/updated', itemId: 'i1' } })
    expect(r.status).toBe(200)
    expect(started).toBe(false)
    const run = scheduled[0]()
    finish()
    await run
    expect(started).toBe(true)
  })
})

describe('runDailySync', () => {
  it('continua após falha e conta ok/failed', async () => {
    const conns = [
      { userId: 'u', itemId: '1' },
      { userId: 'u', itemId: '2' },
      { userId: 'u', itemId: '3' },
    ]
    const runSync = vi.fn(async (_u: string, item: string) => {
      if (item === '2') throw new Error('boom')
    })
    const log = vi.fn()
    const r = await runDailySync({ listConnections: async () => conns, runSync, log })
    expect(r).toEqual({ ok: 2, failed: 1 })
    expect(log).toHaveBeenCalledTimes(1)
    expect(runSync).toHaveBeenCalledTimes(3)
  })
})

describe('safeErrorMessage', () => {
  it('só mensagem, sem headers/objeto', () => {
    const e = Object.assign(new Error('falhou'), { request: { headers: { 'X-API-KEY': 'segredo' } } })
    expect(safeErrorMessage(e)).toBe('falhou')
    expect(safeErrorMessage({ code: 401, config: { headers: 'segredo' } })).toBe('401')
    expect(safeErrorMessage('x')).toBe('erro desconhecido')
  })
})

describe('runSyncRecordingFailure', () => {
  const failingSource = (err: unknown): PluggySource =>
    ({ fetchItem: async () => { throw err } }) as unknown as PluggySource

  it('grava SYNC_ERROR sanitizado e relança', async () => {
    const repo = createMemoryRepo()
    await repo.upsertConnection({
      userId: 'u', pluggyItemId: 'i1', connectorName: 'B', status: 'UPDATED',
      statusDetail: null, consentExpiresAt: null, lastSyncedAt: '2026-11-01T00:00:00.000Z',
    })
    const err = Object.assign(new Error('x'), { code: 500, request: { headers: { 'X-API-KEY': 'segredo' } } })
    const log = vi.fn()
    await expect(
      runSyncRecordingFailure({ loadSource: async () => failingSource(err), repo, today: '2026-11-27', log }, 'u', 'i1'),
    ).rejects.toThrow()
    const c = await repo.getConnection('u', 'i1')
    expect(c?.status).toBe('SYNC_ERROR')
    expect(c?.statusDetail).toContain('500')
    expect(JSON.stringify(c)).not.toContain('segredo')
    expect(c?.lastSyncedAt).toBe('2026-11-01T00:00:00.000Z')
    expect(JSON.stringify(log.mock.calls)).not.toContain('segredo')
  })

  it('sucesso devolve o resultado e não marca erro', async () => {
    const repo = createMemoryRepo()
    const source = {
      fetchItem: async () => ({ id: 'i1', connector: { name: 'B' }, status: 'LOGIN_ERROR', error: null }) as unknown as Item,
    } as unknown as PluggySource
    const r = await runSyncRecordingFailure({ loadSource: async () => source, repo, today: '2026-11-27', log: vi.fn() }, 'u', 'i1')
    expect(r).toMatchObject({ status: 'LOGIN_ERROR' })
    expect((await repo.getConnection('u', 'i1'))?.status).toBe('LOGIN_ERROR')
  })

  it('falha ao carregar credenciais sem conexão existente: relança sem criar linha', async () => {
    const repo = createMemoryRepo()
    await expect(
      runSyncRecordingFailure({ loadSource: async () => { throw new Error('sem credenciais') }, repo, today: '2026-11-27', log: vi.fn() }, 'u', 'i1'),
    ).rejects.toThrow('sem credenciais')
    expect(await repo.getConnection('u', 'i1')).toBeNull()
  })
})
