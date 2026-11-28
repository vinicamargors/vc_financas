import { describe, expect, it } from 'vitest'
import { easter, expectedPayday, isBusinessDay, nationalHolidays } from './businessDays'

describe('easter', () => {
  it('Páscoa pelo algoritmo de Meeus/Butcher', () => {
    expect(easter(2026)).toBe('2026-04-05')
    expect(easter(2025)).toBe('2025-04-20')
    expect(easter(2027)).toBe('2027-03-28')
  })
})

describe('nationalHolidays', () => {
  it('feriados de 2026', () => {
    expect(nationalHolidays(2026)).toEqual([
      '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01',
      '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
    ])
  })
})

describe('isBusinessDay', () => {
  it('fim de semana e feriado não são úteis', () => {
    expect(isBusinessDay('2026-11-28')).toBe(false) // sábado
    expect(isBusinessDay('2026-11-29')).toBe(false) // domingo
    expect(isBusinessDay('2026-11-20')).toBe(false) // Consciência Negra (sexta)
    expect(isBusinessDay('2026-02-17')).toBe(false) // Carnaval
    expect(isBusinessDay('2026-11-27')).toBe(true)
    expect(isBusinessDay('2026-11-30')).toBe(true)
  })
})

describe('expectedPayday', () => {
  it('penúltimo dia útil de novembro/2026 é 27/11', () => {
    expect(expectedPayday(2026, 11, 'penultimate_business_day')).toBe('2026-11-27')
  })
  it('último dia útil', () => {
    expect(expectedPayday(2026, 11, 'last_business_day')).toBe('2026-11-30')
    expect(expectedPayday(2026, 10, 'last_business_day')).toBe('2026-10-30') // 31 é sábado
  })
  it('quinto dia útil pula feriados', () => {
    // jan/2026: 1 feriado, 2 sex, 5 seg, 6, 7, 8 → quinto = 08
    expect(expectedPayday(2026, 1, 'fifth_business_day')).toBe('2026-01-08')
  })
  it('dia fixo cai para o dia útil anterior e limita ao fim do mês', () => {
    expect(expectedPayday(2026, 11, 'fixed_day', 10)).toBe('2026-11-10')
    expect(expectedPayday(2026, 11, 'fixed_day', 15)).toBe('2026-11-13') // 15 domingo e feriado
    expect(expectedPayday(2026, 2, 'fixed_day', 31)).toBe('2026-02-27') // 28 sábado
  })
  it('dia fixo sem fixedDay é erro', () => {
    expect(() => expectedPayday(2026, 11, 'fixed_day')).toThrow()
  })
})
