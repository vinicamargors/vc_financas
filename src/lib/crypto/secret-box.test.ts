import { describe, expect, it } from 'vitest'
import { open, seal } from './secret-box'

const k = Buffer.alloc(32, 7).toString('base64')

describe('secret-box', () => {
  it('faz round-trip', () => {
    expect(open(seal('segredo', k), k)).toBe('segredo')
  })

  it('usa IV aleatório', () => {
    expect(seal('x', k)).not.toBe(seal('x', k))
  })

  it('detecta adulteração do ct', () => {
    const [v, iv, tag, ct] = seal('segredo', k).split('.')
    const first = ct[0] === 'A' ? 'B' : 'A'
    expect(() => open([v, iv, tag, first + ct.slice(1)].join('.'), k)).toThrow()
  })

  it('rejeita chave com tamanho inválido', () => {
    const bad = Buffer.alloc(16).toString('base64')
    expect(() => seal('x', bad)).toThrow('CREDENTIALS_KEY inválida')
    expect(() => open('v1.a.b.c', bad)).toThrow('CREDENTIALS_KEY inválida')
  })
})
