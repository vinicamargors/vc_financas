import { describe, expect, it } from 'vitest'
import { comparison, limitForPeriod, parsePeriodSel, periodQuery, resolvePeriod, shiftPeriod, type CycleAt } from './period'

// Ciclos fictícios: começam no dia 28 de cada mês.
const cycleAt: CycleAt = (d) => {
  const [y, m, day] = d.split('-').map(Number)
  const startMonth = day >= 28 ? m : m - 1
  const sy = startMonth === 0 ? y - 1 : y
  const sm = startMonth === 0 ? 12 : startMonth
  const ey = sm === 12 ? sy + 1 : sy
  const em = sm === 12 ? 1 : sm + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return { start: `${sy}-${pad(sm)}-28`, end: `${ey}-${pad(em)}-27` }
}
const today = '2026-11-12'

describe('parsePeriodSel', () => {
  it('padrão é o ciclo de hoje', () => expect(parsePeriodSel({}, today)).toEqual({ kind: 'ciclo', ref: today }))
  it('aceita tipo e referência válidos', () => expect(parsePeriodSel({ periodo: 'mes', ref: '2026-10-03' }, today)).toEqual({ kind: 'mes', ref: '2026-10-03' }))
  it('referência inválida ou futura vira hoje', () => {
    expect(parsePeriodSel({ periodo: 'mes', ref: '2026-13-40' }, today).ref).toBe(today)
    expect(parsePeriodSel({ periodo: 'mes', ref: '2027-01-01' }, today).ref).toBe(today)
  })
  it('tipo fora da lista permitida cai no padrão', () => {
    expect(parsePeriodSel({ periodo: 'dia' }, today, ['ciclo', 'mes'])).toEqual({ kind: 'ciclo', ref: today })
    expect(parsePeriodSel({ periodo: 'xx' }, today).kind).toBe('ciclo')
  })
  it('personalizado exige de ≤ até', () => {
    expect(parsePeriodSel({ periodo: 'livre', de: '2026-10-01', ate: '2026-10-15' }, today)).toEqual({ kind: 'livre', ref: '2026-10-15', from: '2026-10-01', to: '2026-10-15' })
    expect(parsePeriodSel({ periodo: 'livre', de: '2026-10-15', ate: '2026-10-01' }, today).kind).toBe('ciclo')
    expect(parsePeriodSel({ periodo: 'livre', de: '2026-10-15' }, today).kind).toBe('ciclo')
  })
  it('personalizado não passa de 5 anos', () => expect(parsePeriodSel({ periodo: 'livre', de: '2010-01-01', ate: '2026-10-01' }, today).kind).toBe('ciclo'))
})

describe('resolvePeriod', () => {
  it('dia', () => expect(resolvePeriod({ kind: 'dia', ref: '2026-11-05' }, cycleAt)).toMatchObject({ start: '2026-11-05', end: '2026-11-05' }))
  it('semana começa na segunda', () => {
    expect(resolvePeriod({ kind: 'semana', ref: '2026-11-12' }, cycleAt)).toMatchObject({ start: '2026-11-09', end: '2026-11-15' })
    expect(resolvePeriod({ kind: 'semana', ref: '2026-11-15' }, cycleAt)).toMatchObject({ start: '2026-11-09', end: '2026-11-15' })
  })
  it('mês e ano', () => {
    expect(resolvePeriod({ kind: 'mes', ref: '2026-02-10' }, cycleAt)).toMatchObject({ start: '2026-02-01', end: '2026-02-28' })
    expect(resolvePeriod({ kind: 'ano', ref: '2026-02-10' }, cycleAt)).toMatchObject({ start: '2026-01-01', end: '2026-12-31', label: '2026' })
  })
  it('ciclo usa cycleAt', () => expect(resolvePeriod({ kind: 'ciclo', ref: today }, cycleAt)).toMatchObject({ start: '2026-10-28', end: '2026-11-27' }))
  it('personalizado', () => expect(resolvePeriod({ kind: 'livre', ref: '2026-10-15', from: '2026-10-01', to: '2026-10-15' }, cycleAt)).toMatchObject({ start: '2026-10-01', end: '2026-10-15' }))
})

describe('comparison', () => {
  it('ciclo em andamento compara os mesmos dias do ciclo anterior', () => {
    const p = resolvePeriod({ kind: 'ciclo', ref: today }, cycleAt)
    expect(comparison(p, today, cycleAt)).toEqual({ days: 16, current: { start: '2026-10-28', end: '2026-11-12' }, previous: { start: '2026-09-28', end: '2026-10-13' } })
  })
  it('mês fechado compara com o mês anterior inteiro (cortado no fim dele)', () => {
    const p = resolvePeriod({ kind: 'mes', ref: '2026-03-10' }, cycleAt)
    expect(comparison(p, today, cycleAt)).toEqual({ days: 31, current: { start: '2026-03-01', end: '2026-03-31' }, previous: { start: '2026-02-01', end: '2026-02-28' } })
  })
  it('semana, dia, ano e personalizado', () => {
    expect(comparison(resolvePeriod({ kind: 'semana', ref: today }, cycleAt), today, cycleAt).previous).toEqual({ start: '2026-11-02', end: '2026-11-05' })
    expect(comparison(resolvePeriod({ kind: 'dia', ref: today }, cycleAt), today, cycleAt).previous).toEqual({ start: '2026-11-11', end: '2026-11-11' })
    expect(comparison(resolvePeriod({ kind: 'ano', ref: today }, cycleAt), today, cycleAt).previous).toEqual({ start: '2025-01-01', end: '2025-11-12' })
    const livre = resolvePeriod({ kind: 'livre', ref: '2026-10-10', from: '2026-10-01', to: '2026-10-10' }, cycleAt)
    expect(comparison(livre, today, cycleAt).previous).toEqual({ start: '2026-09-21', end: '2026-09-30' })
  })
})

describe('shiftPeriod', () => {
  it('anterior e próximo; nada depois de hoje', () => {
    const p = resolvePeriod({ kind: 'mes', ref: today }, cycleAt)
    expect(shiftPeriod(p, -1, today)).toEqual({ kind: 'mes', ref: '2026-10-31' })
    expect(shiftPeriod(p, 1, today)).toBeNull()
    expect(shiftPeriod(resolvePeriod({ kind: 'mes', ref: '2026-09-02' }, cycleAt), 1, today)).toEqual({ kind: 'mes', ref: '2026-10-01' })
  })
  it('personalizado anda pelo próprio tamanho', () => {
    const p = resolvePeriod({ kind: 'livre', ref: '2026-10-10', from: '2026-10-01', to: '2026-10-10' }, cycleAt)
    expect(shiftPeriod(p, -1, today)).toEqual({ kind: 'livre', ref: '2026-09-30', from: '2026-09-21', to: '2026-09-30' })
  })
})

describe('periodQuery', () => {
  it('omite a referência de hoje', () => expect(periodQuery({ kind: 'ciclo', ref: today }, today)).toBe('periodo=ciclo'))
  it('inclui ref e intervalo', () => {
    expect(periodQuery({ kind: 'mes', ref: '2026-10-01' }, today)).toBe('periodo=mes&ref=2026-10-01')
    expect(periodQuery({ kind: 'livre', ref: '2026-10-10', from: '2026-10-01', to: '2026-10-10' }, today)).toBe('periodo=livre&de=2026-10-01&ate=2026-10-10')
  })
})

describe('limitForPeriod', () => {
  it('mês de 28 a 31 dias usa o limite inteiro', () => {
    expect(limitForPeriod(60000, 31)).toBe(60000)
    expect(limitForPeriod(60000, 28)).toBe(60000)
  })
  it('outros tamanhos são proporcionais', () => {
    expect(limitForPeriod(60000, 7)).toBe(Math.round((60000 * 7 * 12) / 365.25))
    expect(limitForPeriod(60000, 365)).toBe(Math.round((60000 * 365 * 12) / 365.25))
  })
  it('sem limite', () => expect(limitForPeriod(null, 30)).toBeNull())
})
