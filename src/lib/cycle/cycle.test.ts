import { describe, expect, it } from 'vitest'
import { currentCycle } from './cycle'

const rule = 'penultimate_business_day' as const

describe('currentCycle', () => {
  it('começa no salário que caiu e termina na véspera do próximo previsto', () => {
    expect(currentCycle({ today: '2026-11-28', salaryDates: ['2026-10-29', '2026-11-27'], rule })).toEqual({
      start: '2026-11-27', end: '2026-12-29', nextPayday: '2026-12-30', source: 'salary', late: false,
    })
  })
  it('salário de novembro ainda não caiu: usa o previsto do mês anterior', () => {
    // sem salário registrado; previsto de nov (27/11) ainda não chegou em 20/11
    expect(currentCycle({ today: '2026-11-20', salaryDates: [], rule })).toEqual({
      start: '2026-10-29', end: '2026-11-26', nextPayday: '2026-11-27', source: 'expected', late: false,
    })
  })
  it('sem salário registrado e o previsto do mês já passou: usa o previsto do mês', () => {
    expect(currentCycle({ today: '2026-11-28', salaryDates: [], rule })).toEqual({
      start: '2026-11-27', end: '2026-12-29', nextPayday: '2026-12-30', source: 'expected', late: false,
    })
  })
  it('ignora datas futuras', () => {
    expect(currentCycle({ today: '2026-11-28', salaryDates: ['2026-12-30'], rule }).source).toBe('expected')
  })
  it('virada de ano', () => {
    // dez/2026: 31 qui, 30 qua → penúltimo = 30/12; jan/2027: 29 sex último, 28 qui penúltimo
    expect(currentCycle({ today: '2027-01-05', salaryDates: ['2026-12-30'], rule })).toEqual({
      start: '2026-12-30', end: '2027-01-27', nextPayday: '2027-01-28', source: 'salary', late: false,
    })
  })
  it('salário atrasado: segue do último salário, próximo é o previsto vencido, fim = véspera do mês seguinte', () => {
    expect(currentCycle({ today: '2026-12-01', salaryDates: ['2026-10-29'], rule })).toEqual({
      start: '2026-10-29', end: '2026-12-29', nextPayday: '2026-11-27', source: 'salary', late: true,
    })
  })
  it('hoje é o dia previsto e o salário ainda não caiu', () => {
    expect(currentCycle({ today: '2026-11-27', salaryDates: ['2026-10-29'], rule })).toEqual({
      start: '2026-10-29', end: '2026-12-29', nextPayday: '2026-11-27', source: 'salary', late: true,
    })
  })
  it('salário sumido há mais de 40 dias continua atrasado, sem ciclo fantasma', () => {
    expect(currentCycle({ today: '2026-12-10', salaryDates: ['2026-10-29'], rule })).toEqual({
      start: '2026-10-29', end: '2026-12-29', nextPayday: '2026-11-27', source: 'salary', late: true,
    })
  })
  it('mais de 45 dias sem salário: mês do calendário', () => {
    expect(currentCycle({ today: '2026-12-15', salaryDates: ['2026-10-29'], rule })).toEqual({
      start: '2026-12-01', end: '2026-12-31', nextPayday: null, source: 'calendar', late: false,
    })
  })
  it('salário no meio do mês (12/11) pertence a outubro', () => {
    expect(currentCycle({ today: '2026-11-20', salaryDates: ['2026-11-12'], rule })).toEqual({
      start: '2026-11-12', end: '2026-11-26', nextPayday: '2026-11-27', source: 'salary', late: false,
    })
  })
  it('salário pago antes do previsto conta como o do mês', () => {
    expect(currentCycle({ today: '2026-11-28', salaryDates: ['2026-11-26'], rule }).nextPayday).toBe('2026-12-30')
  })
  it('sem regra de salário: mês do calendário', () => {
    expect(currentCycle({ today: '2026-02-10', salaryDates: [], rule: null })).toEqual({
      start: '2026-02-01', end: '2026-02-28', nextPayday: null, source: 'calendar', late: false,
    })
  })
  it('dia fixo', () => {
    expect(currentCycle({ today: '2026-11-28', salaryDates: [], rule: 'fixed_day', fixedDay: 10 })).toEqual({
      start: '2026-11-10', end: '2026-12-09', nextPayday: '2026-12-10', source: 'expected', late: false,
    })
  })
})
