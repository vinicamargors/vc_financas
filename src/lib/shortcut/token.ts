import { createHash, randomBytes } from 'node:crypto'

/** SHA-256 em hex: é só isso que fica no banco. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** 32 bytes aleatórios em base64url. O token aparece uma única vez para o usuário. */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashToken(token) }
}
