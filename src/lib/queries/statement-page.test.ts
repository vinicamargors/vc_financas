import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, filterPredicate, keysetOr, mergeGroups } from './statement-page'

const id = '123e4567-e89b-12d3-a456-426614174000'

describe('cursor', () => {
  it('faz round-trip com e sem occurredAt', () => {
    const a = { date: '2026-11-27', occurredAt: '2026-11-27T14:03:00+00:00', id }
    const b = { date: '2026-11-27', occurredAt: null, id }
    expect(decodeCursor(encodeCursor(a))).toEqual(a)
    expect(decodeCursor(encodeCursor(b))).toEqual(b)
  })
  it('rejeita lixo e injeção', () => {
    expect(() => decodeCursor('xx')).toThrow()
    const evil = Buffer.from(JSON.stringify(['2026-11-27', null, 'a),id.gt.0'])).toString('base64url')
    expect(() => decodeCursor(evil)).toThrow()
    const evil2 = Buffer.from(JSON.stringify(['2026-11-27', 'x,y', id])).toString('base64url')
    expect(() => decodeCursor(evil2)).toThrow()
  })
})

describe('keysetOr', () => {
  it('cursor sem hora só avança entre os sem hora do mesmo dia', () => {
    expect(keysetOr({ date: '2026-11-27', occurredAt: null, id })).toBe(
      `date.lt.2026-11-27,and(date.eq.2026-11-27,occurred_at.is.null,id.lt.${id})`,
    )
  })
  it('cursor com hora inclui os sem hora do dia (nulls last)', () => {
    const s = keysetOr({ date: '2026-11-27', occurredAt: '2026-11-27T10:00:00+00:00', id })
    expect(s).toContain('and(date.eq.2026-11-27,occurred_at.is.null)')
    expect(s).toContain(`occurred_at.eq.2026-11-27T10:00:00+00:00,id.lt.${id}`)
  })
})

describe('filterPredicate', () => {
  it('mapeia cada filtro', () => {
    expect(filterPredicate('tudo')).toBeNull()
    expect(filterPredicate('entradas')).toEqual({ column: 'amount_cents', op: 'gt', value: 0 })
    expect(filterPredicate('saidas')).toEqual({ column: 'amount_cents', op: 'lt', value: 0 })
    expect(filterPredicate('cartao')).toEqual({ column: 'card_last4', op: 'not.is', value: null })
  })
})

describe('mergeGroups', () => {
  const t = (i: string, date: string, amountCents: number) => ({ id: i, date, amountCents, deletedAt: null })
  it('funde dia que continua, sem duplicar', () => {
    const base = [{ date: '2026-11-27', totalCents: 100, items: [t('a', '2026-11-27', 100)] }]
    const next = [
      { date: '2026-11-27', totalCents: 50, items: [t('a', '2026-11-27', 100), t('b', '2026-11-27', -50)] },
      { date: '2026-11-26', totalCents: 5, items: [t('c', '2026-11-26', 5)] },
    ]
    const r = mergeGroups(base, next)
    expect(r.map((g) => g.date)).toEqual(['2026-11-27', '2026-11-26'])
    expect(r[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(r[0].totalCents).toBe(50)
  })
})
