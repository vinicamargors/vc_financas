import { describe, expect, it } from 'vitest'
import { generateToken, hashToken } from './token'

describe('token', () => {
  it('gera 32 bytes base64url e guarda só o sha256', () => {
    const { token, hash } = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashToken(token))
    expect(generateToken().token).not.toBe(token)
  })
})
