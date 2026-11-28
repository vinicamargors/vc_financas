import { describe, expect, it, vi } from 'vitest'
import { confirmPendingCore, teachPlaceCore, type ReviewStore } from './review'

function store(): ReviewStore & { calls: unknown[][] } {
  const calls: unknown[][] = []
  return {
    calls,
    updateTransactions: vi.fn(async (...a) => void calls.push(['update', ...a])),
    createMerchant: vi.fn(async (...a) => (calls.push(['merchant', ...a]), 'm1')),
    upsertRule: vi.fn(async (...a) => void calls.push(['rule', ...a])),
    reclassify: vi.fn(async (...a) => void calls.push(['reclassify', ...a])),
  }
}

describe('confirmPendingCore', () => {
  it.each([
    ['expense', 'expense'],
    ['transfer', 'transfer'],
    ['loan', 'transfer'],
  ] as const)('%s grava kind %s sem categoria, como escolha do usuário', async (choice, kind) => {
    const s = store()
    await confirmPendingCore(s, 'u', 'tx1', choice)
    expect(s.updateTransactions).toHaveBeenCalledWith('u', ['tx1'], { kind, categoryId: null })
    // Reclassifica para o par ligado (se houver) acompanhar a decisão.
    expect(s.calls.map((c) => c[0])).toEqual(['update', 'reclassify'])
  })
  it('outro vira gasto com a categoria escolhida', async () => {
    const s = store()
    await confirmPendingCore(s, 'u', 'tx1', 'other', 'c1')
    expect(s.updateTransactions).toHaveBeenCalledWith('u', ['tx1'], { kind: 'expense', categoryId: 'c1' })
  })
  it('recusa escolha inválida', async () => {
    await expect(confirmPendingCore(store(), 'u', 'tx1', 'xx' as never)).rejects.toThrow()
  })
})

describe('teachPlaceCore', () => {
  const input = { pattern: 'padaria x', displayName: ' Padaria do X ', categoryId: 'c1', ids: ['t1', 't2'] }
  it('lembrar: cria merchant e regra, marca só a linha editada e reclassifica', async () => {
    const s = store()
    await teachPlaceCore(s, 'u', { ...input, remember: true })
    expect(s.calls.map((c) => c[0])).toEqual(['merchant', 'rule', 'update', 'reclassify'])
    expect(s.createMerchant).toHaveBeenCalledWith('u', 'Padaria do X', 'c1')
    expect(s.upsertRule).toHaveBeenCalledWith('u', { matchField: 'description', pattern: 'padaria x', merchantId: 'm1', categoryId: 'c1', kind: null })
    expect(s.updateTransactions).toHaveBeenCalledWith('u', ['t1'], { kind: 'expense', categoryId: 'c1', merchantId: 'm1' })
    expect(s.reclassify).toHaveBeenCalledWith('u')
  })
  it('sem lembrar: não grava regra nem reclassifica, marca todas as linhas do grupo', async () => {
    const s = store()
    await teachPlaceCore(s, 'u', { ...input, remember: false })
    expect(s.upsertRule).not.toHaveBeenCalled()
    expect(s.reclassify).not.toHaveBeenCalled()
    expect(s.updateTransactions).toHaveBeenCalledWith('u', ['t1', 't2'], { kind: 'expense', categoryId: 'c1', merchantId: 'm1' })
  })
  it('recusa nome vazio ou padrão curto', async () => {
    await expect(teachPlaceCore(store(), 'u', { ...input, displayName: ' ', remember: true })).rejects.toThrow()
    await expect(teachPlaceCore(store(), 'u', { ...input, pattern: 'ab', remember: true })).rejects.toThrow()
  })
})
