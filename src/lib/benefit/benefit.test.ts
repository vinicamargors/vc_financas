import { describe, expect, it } from 'vitest'
import { isBenefitCard, rechargeExternalId, rechargesDue } from './benefit'

describe('isBenefitCard', () => {
  it('reconhece cartões de benefício pelo nome', () => {
    for (const c of ['Alelo Refeição', 'Ticket', 'VR', 'meu vr', 'Pluxee', 'Sodexo', 'Flash', 'Caju', 'Swile', 'Ben Visa Vale', 'Vale Alimentação'])
      expect(isBenefitCard(c), c).toBe(true)
  })
  it('não confunde com outros cartões', () => {
    for (const c of ['Nubank', 'Itaú Visa', 'Inter', 'Crédito', 'ouro', '', null]) expect(isBenefitCard(c), String(c)).toBe(false)
  })
})

describe('rechargesDue', () => {
  it('uma recarga por mês, no dia (limitado ao fim do mês), desde o cadastro até hoje', () => {
    expect(rechargesDue({ day: 31, since: '2026-12-15', today: '2027-03-01' })).toEqual([
      { month: '2026-12', date: '2026-12-31' },
      { month: '2027-01', date: '2027-01-31' },
      { month: '2027-02', date: '2027-02-28' },
    ])
  })
  it('não gera recarga anterior ao cadastro nem futura', () => {
    expect(rechargesDue({ day: 5, since: '2026-11-28', today: '2026-12-04' })).toEqual([])
    expect(rechargesDue({ day: 5, since: '2026-11-28', today: '2026-12-05' })).toEqual([{ month: '2026-12', date: '2026-12-05' }])
  })
  it('id externo estável por conta e mês', () => {
    expect(rechargeExternalId('acc', '2026-12')).toBe('vr:acc:2026-12')
  })
})

describe('parseVrForm', async () => {
  const { parseVrForm } = await import('./benefit')
  const g = (o: Record<string, string>) => (k: string) => o[k] ?? null
  it('aceita nome, valor mensal e dia', () => {
    expect(parseVrForm(g({ name: ' VR Alelo ', monthly: '800,00', day: '5' }))).toEqual({ ok: true, value: { name: 'VR Alelo', monthlyCents: 80_000, day: 5 } })
  })
  it('recusa campos inválidos', () => {
    expect(parseVrForm(g({ name: '', monthly: '800', day: '5' }))).toEqual({ ok: false, error: 'nome' })
    expect(parseVrForm(g({ name: 'VR', monthly: '0', day: '5' }))).toEqual({ ok: false, error: 'valor' })
    expect(parseVrForm(g({ name: 'VR', monthly: '800', day: '32' }))).toEqual({ ok: false, error: 'dia' })
    expect(parseVrForm(g({ name: 'VR', monthly: '800', day: '1.5' }))).toEqual({ ok: false, error: 'dia' })
  })
})
