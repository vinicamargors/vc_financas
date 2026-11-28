import { describe, expect, it } from 'vitest'
import { parseSourceForm } from './source-form'

const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}

describe('parseSourceForm', () => {
  it('salário: exige pagador e regra; fixed_day exige dia', () => {
    expect(parseSourceForm(form({ kind: 'salary', payerName: ' Acme ', dateRule: 'last_business_day' }))).toEqual({
      ok: true, value: { kind: 'salary', payerDoc: null, payerName: 'Acme', dateRule: 'last_business_day', fixedDay: null },
    })
    expect(parseSourceForm(form({ kind: 'salary', dateRule: 'last_business_day' }))).toEqual({ ok: false, error: 'dados' })
    expect(parseSourceForm(form({ kind: 'salary', payerName: 'A', dateRule: 'fixed_day', fixedDay: '40' }))).toEqual({ ok: false, error: 'dia' })
    expect(parseSourceForm(form({ kind: 'salary', payerName: 'A', dateRule: 'fixed_day', fixedDay: '5' }))).toMatchObject({ ok: true, value: { fixedDay: 5 } })
  })

  it('renda extra: a regra de data não importa (usa o padrão, sem dia)', () => {
    expect(parseSourceForm(form({ kind: 'extra', payerDoc: '12.345.678/0001-90', dateRule: 'fixed_day' }))).toEqual({
      ok: true, value: { kind: 'extra', payerDoc: '12345678000190', payerName: null, dateRule: 'penultimate_business_day', fixedDay: null },
    })
  })

  it('kind ausente ou desconhecido é recusado', () => {
    expect(parseSourceForm(form({ payerName: 'A', dateRule: 'last_business_day' }))).toEqual({ ok: false, error: 'dados' })
    expect(parseSourceForm(form({ kind: 'x', payerName: 'A', dateRule: 'last_business_day' }))).toEqual({ ok: false, error: 'dados' })
  })
})
