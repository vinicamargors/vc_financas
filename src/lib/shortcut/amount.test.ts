import { describe, expect, it } from 'vitest'
import { parseAmountCents } from './amount'

describe('parseAmountCents', () => {
  it.each([
    ['R$ 1.234,56', 123456],
    ['R$ 9,00', 900],
    ['R$ 9,00', 900],
    ['1234,56', 123456],
    ['1,234.56', 123456],
    ['1.234', 123400],
    ['12.5', 1250],
    ['-R$ 45,90', 4590],
    ['  7 ', 700],
    [12.34, 1234],
    [-3.5, 350],
  ] as const)('%s -> %s', (input, cents) => {
    expect(parseAmountCents(input)).toBe(cents)
  })

  it.each([['abc'], [''], ['R$'], ['0'], [0], [Number.NaN], [null], [undefined], [{}], ['1,2,3,4'], [1e12]])('rejeita %s', (input) => {
    expect(parseAmountCents(input)).toBeNull()
  })
})
