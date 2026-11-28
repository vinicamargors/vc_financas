import { describe, expect, it } from 'vitest'
import { activeTabFor } from './app-tab-bar'

describe('activeTabFor', () => {
  it('raiz é início', () => expect(activeTabFor('/')).toBe('inicio'))
  it('extrato e subrotas', () => {
    expect(activeTabFor('/extrato')).toBe('extrato')
    expect(activeTabFor('/extrato/x')).toBe('extrato')
  })
  it('caixinhas', () => expect(activeTabFor('/caixinhas')).toBe('caixinhas'))
  it('não confunde prefixo parecido', () => expect(activeTabFor('/extratos')).toBeNull())
  it('outras rotas não ativam aba', () => expect(activeTabFor('/config/bancos')).toBeNull())
})
