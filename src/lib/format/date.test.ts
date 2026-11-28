import { describe, expect, it } from 'vitest'
import { TZ, formatDayLabel, formatDayMonth, formatTime, toLocalDate } from './date'
import { formatLocalDayMonth, isDateOnly, transactionDate } from './date'

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

describe('formatadores pt-BR', () => {
  it('formatTime usa Sao Paulo', () => expect(formatTime('2026-11-27T11:12:00Z')).toBe('08:12'))
  it('formatDayMonth usa Sao Paulo', () => expect(formatDayMonth('2026-11-28T02:30:00Z')).toBe('27/11'))
  it('formatDayLabel', () => expect(formatDayLabel('2026-11-27')).toMatch(/^27 de nov/))
})

describe('transactionDate', () => {
  it('meia-noite UTC é só data: não volta um dia', () => {
    expect(transactionDate('2026-11-27T00:00:00.000Z')).toBe('2026-11-27')
    expect(isDateOnly('2026-11-27T00:00:00.000Z')).toBe(true)
  })
  it('com hora converte para Brasília', () => {
    expect(transactionDate('2026-11-28T02:30:00.000Z')).toBe('2026-11-27')
    expect(isDateOnly('2026-11-28T02:30:00.000Z')).toBe(false)
  })
})

describe('formatLocalDayMonth', () => {
  it('dd/MM sem mexer no fuso', () => {
    expect(formatLocalDayMonth('2026-12-01')).toBe('01/12')
  })
})
