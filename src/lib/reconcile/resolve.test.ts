import { describe, expect, it } from 'vitest'
import { resolveSameEntry, type SameEntryStore } from './resolve'

function store() {
  const manuals = new Map([
    ['m1', { userId: 'A', id: 'm1', candidateId: 'p1', kind: 'expense' as const, categoryId: 'c', merchantId: null }],
    ['m2', { userId: 'A', id: 'm2', candidateId: null, kind: 'expense' as const, categoryId: null, merchantId: null }],
  ])
  const calls: string[] = []
  const s: SameEntryStore = {
    async getPendingManual(userId, id) {
      const m = manuals.get(id)
      return m && m.userId === userId ? m : null
    },
    async merge(userId, m, candidateId) {
      calls.push(`merge:${userId}:${m.id}->${candidateId}:${m.categoryId}`)
    },
    async markReconciled(userId, id) {
      calls.push(`ok:${userId}:${id}`)
    },
  }
  return { s, calls }
}

describe('resolveSameEntry', () => {
  it('"É o mesmo" funde com o candidato gravado', async () => {
    const { s, calls } = store()
    await resolveSameEntry(s, 'A', 'm1', 'same')
    expect(calls).toEqual(['merge:A:m1->p1:c'])
  })
  it('"São diferentes" marca como conferido', async () => {
    const { s, calls } = store()
    await resolveSameEntry(s, 'A', 'm1', 'different')
    expect(calls).toEqual(['ok:A:m1'])
  })
  it('outro usuário, id desconhecido ou sem candidato: erro, nada muda', async () => {
    const { s, calls } = store()
    await expect(resolveSameEntry(s, 'B', 'm1', 'same')).rejects.toThrow()
    await expect(resolveSameEntry(s, 'A', 'zz', 'different')).rejects.toThrow()
    await expect(resolveSameEntry(s, 'A', 'm2', 'same')).rejects.toThrow()
    await expect(resolveSameEntry(s, 'A', 'm1', 'talvez' as 'same')).rejects.toThrow()
    expect(calls).toEqual([])
  })
})
