import { describe, expect, it } from 'vitest'
import { isCategoryKey, parseCategoryForm } from './form'

const get = (o: Record<string, string>) => (k: string) => o[k] ?? null

describe('parseCategoryForm', () => {
  it('nome e limite', () => expect(parseCategoryForm(get({ name: ' Mercado ', limit: '1.200,50' }))).toEqual({ ok: true, value: { name: 'Mercado', monthlyLimitCents: 120050 } }))
  it('limite vazio = sem limite', () => expect(parseCategoryForm(get({ name: 'Lazer', limit: '' }))).toEqual({ ok: true, value: { name: 'Lazer', monthlyLimitCents: null } }))
  it('nome vazio ou longo', () => {
    expect(parseCategoryForm(get({ name: '  ' }))).toEqual({ ok: false, error: 'nome' })
    expect(parseCategoryForm(get({ name: 'x'.repeat(41) }))).toEqual({ ok: false, error: 'nome' })
  })
  it('limite inválido, zero ou negativo', () => {
    expect(parseCategoryForm(get({ name: 'A', limit: 'abc' }))).toEqual({ ok: false, error: 'limite' })
    expect(parseCategoryForm(get({ name: 'A', limit: '0' }))).toEqual({ ok: false, error: 'limite' })
    expect(parseCategoryForm(get({ name: 'A', limit: '-5' }))).toEqual({ ok: false, error: 'limite' })
  })
})

describe('isCategoryKey', () => {
  it('aceita uuid e "sem"', () => {
    expect(isCategoryKey('sem')).toBe(true)
    expect(isCategoryKey('3f2b8a1c-1234-4abc-9def-0123456789ab')).toBe(true)
  })
  it('recusa o resto', () => {
    expect(isCategoryKey('x),or(')).toBe(false)
    expect(isCategoryKey('')).toBe(false)
  })
})
