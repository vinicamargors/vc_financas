import { describe, expect, it } from 'vitest'
import { TZ, toLocalDate } from './date'

describe('toLocalDate', () => {
  it('usa America/Sao_Paulo', () => {
    expect(TZ).toBe('America/Sao_Paulo')
  })
  it('antes da meia-noite local mantém o dia', () => {
    expect(toLocalDate('2026-11-28T02:30:00Z')).toBe('2026-11-27')
  })
  it('à meia-noite local vira o dia seguinte', () => {
    expect(toLocalDate('2026-11-28T03:00:00Z')).toBe('2026-11-28')
  })
  it('aceita Date', () => {
    expect(toLocalDate(new Date('2026-11-28T02:30:00Z'))).toBe('2026-11-27')
  })
})
