import { describe, expect, it } from 'vitest'
import { matchShortcuts, type MergeCandidate, type ShortcutRow } from './merge'

const sc = (over: Partial<ShortcutRow> = {}): ShortcutRow => ({
  id: 's1', date: '2026-11-27', amountCents: -900, merchantId: 'm1', categoryId: 'c1', kind: 'expense', classifiedBy: 'auto', ...over,
})
const px = (over: Partial<MergeCandidate> = {}): MergeCandidate => ({ id: 'p1', date: '2026-11-27', amountCents: -900, ...over })

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
  it('cada linha da Pluggy casa com um só atalho, preferindo a mesma data', () => {
    const r = matchShortcuts(
      [sc({ id: 's1' }), sc({ id: 's2' })],
      [px({ id: 'p1', date: '2026-11-28' }), px({ id: 'p2' })],
      new Set(),
    )
    expect(r.map((m) => [m.shortcut.id, m.pluggyId])).toEqual([['s1', 'p2'], ['s2', 'p1']])
  })
})
