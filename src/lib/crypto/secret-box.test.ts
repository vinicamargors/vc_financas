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

  const flip = (b64: string) => (b64[0] === 'A' ? 'B' : 'A') + b64.slice(1)

  it('detecta adulteração do tag e do iv', () => {
    const [v, iv, tag, ct] = seal('segredo', k).split('.')
    expect(() => open([v, iv, flip(tag), ct].join('.'), k)).toThrow()
    expect(() => open([v, flip(iv), tag, ct].join('.'), k)).toThrow()
  })

  it('rejeita tag truncado', () => {
    const [v, iv, tag, ct] = seal('segredo', k).split('.')
    const short = Buffer.from(tag, 'base64').subarray(0, 8).toString('base64')
    expect(() => open([v, iv, short, ct].join('.'), k)).toThrow('Formato de credencial inválido')
  })

  it('rejeita número de segmentos diferente de 4', () => {
    expect(() => open(seal('x', k) + '.junk', k)).toThrow('Formato de credencial inválido')
    expect(() => open('v1.a.b', k)).toThrow('Formato de credencial inválido')
  })

  it('rejeita outra chave válida de 32 bytes', () => {
    const other = Buffer.alloc(32, 9).toString('base64')
    expect(() => open(seal('segredo', k), other)).toThrow()
  })

  it('faz round-trip de string vazia', () => {
    expect(open(seal('', k), k)).toBe('')
  })
})
