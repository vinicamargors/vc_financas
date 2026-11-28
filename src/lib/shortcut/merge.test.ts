import { describe, expect, it } from 'vitest'
import { matchShortcuts, type MergeCandidate, type ShortcutRow } from './merge'

const T0 = '2026-11-27T15:00:00.000Z'
const sc = (over: Partial<ShortcutRow> = {}): ShortcutRow => ({
  id: 's1', accountId: 'man', date: '2026-11-27', amountCents: -900, createdAt: T0, merchantId: 'm1', categoryId: 'c1', kind: 'expense', classifiedBy: 'auto', ...over,
})
const px = (over: Partial<MergeCandidate> = {}): MergeCandidate => ({
  id: 'p1', accountId: 'card', date: '2026-11-27', amountCents: -900, createdAt: '2026-11-28T09:00:00.000Z', ...over,
})
const pairs = (r: ReturnType<typeof matchShortcuts>) => r.map((m) => [m.shortcut.id, m.pluggyId])

describe('matchShortcuts', () => {
  it('casa mesmo valor e mesma data', () => {
    expect(matchShortcuts([sc()], [px()], new Set())).toEqual([{ shortcut: sc(), pluggyId: 'p1' }])
  })
  it('aceita 1 dia de diferença, recusa 2', () => {
    expect(matchShortcuts([sc()], [px({ date: '2026-11-28' })], new Set())).toHaveLength(1)
    expect(matchShortcuts([sc()], [px({ date: '2026-11-26' })], new Set())).toHaveLength(1)
    expect(matchShortcuts([sc()], [px({ date: '2026-11-29' })], new Set())).toHaveLength(0)
  })
  it('valor diferente não casa', () => {
    expect(matchShortcuts([sc()], [px({ amountCents: -901 })], new Set())).toHaveLength(0)
  })
  it('ignora entrada (estorno) e linha já ligada', () => {
    expect(matchShortcuts([sc()], [px({ amountCents: 900 })], new Set())).toHaveLength(0)
    expect(matchShortcuts([sc()], [px()], new Set(['p1']))).toHaveLength(0)
  })
  it('compra antiga de mesmo valor (gravada antes do Atalho) não casa', () => {
    expect(matchShortcuts([sc()], [px({ createdAt: '2026-11-27T10:00:00.000Z' })], new Set())).toHaveLength(0)
    // até 10 min antes ainda vale (relógios diferentes)
    expect(matchShortcuts([sc()], [px({ createdAt: '2026-11-27T14:51:00.000Z' })], new Set())).toHaveLength(1)
  })
  it('prefere a mesma conta, depois a data mais próxima, depois o menor id', () => {
    expect(pairs(matchShortcuts([sc({ accountId: 'card' })], [px({ id: 'p1', accountId: 'other' }), px({ id: 'p2', date: '2026-11-28' })], new Set()))).toEqual([['s1', 'p2']])
    expect(pairs(matchShortcuts([sc()], [px({ id: 'p1', date: '2026-11-28' }), px({ id: 'p2' })], new Set()))).toEqual([['s1', 'p2']])
    expect(pairs(matchShortcuts([sc()], [px({ id: 'p2' }), px({ id: 'p1' })], new Set()))).toEqual([['s1', 'p1']])
  })
  it('cada linha da Pluggy casa com um só atalho', () => {
    const r = matchShortcuts([sc({ id: 's1' }), sc({ id: 's2' })], [px({ id: 'p1' }), px({ id: 'p2', date: '2026-11-28' })], new Set())
    expect(pairs(r)).toEqual([['s1', 'p1'], ['s2', 'p2']])
  })
})
