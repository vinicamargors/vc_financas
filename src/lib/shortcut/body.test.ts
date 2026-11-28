import { describe, expect, it, vi } from 'vitest'
import { readLimitedJson } from './body'

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://x/api/ingest/shortcut', { method: 'POST', body, headers })

describe('readLimitedJson', () => {
  it('lê JSON pequeno', async () => {
    expect(await readLimitedJson(post('{"a":1}'))).toEqual({ tooLarge: false, body: { a: 1 } })
  })
  it('JSON inválido vira null', async () => {
    expect(await readLimitedJson(post('{'))).toEqual({ tooLarge: false, body: null })
  })
  it('recusa pelo content-length sem ler o corpo', async () => {
    const req = post('{}', { 'content-length': '5000' })
    const text = vi.spyOn(req, 'text')
    expect(await readLimitedJson(req)).toEqual({ tooLarge: true })
    expect(text).not.toHaveBeenCalled()
  })
  it('conta bytes, não caracteres', async () => {
    const accents = 'é'.repeat(1500) // 3000 bytes em UTF-8
    expect(await readLimitedJson(post(JSON.stringify({ m: accents })), 2000)).toEqual({ tooLarge: true })
    expect((await readLimitedJson(post(JSON.stringify({ m: accents })), 4096)).tooLarge).toBe(false)
  })
})
