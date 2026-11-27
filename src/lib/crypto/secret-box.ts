import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'

function loadKey(keyB64?: string): Buffer {
  const key = Buffer.from(keyB64 ?? process.env.CREDENTIALS_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('CREDENTIALS_KEY inválida')
  return key
}

export function seal(plain: string, keyB64?: string): string {
  const key = loadKey(keyB64)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

export function open(sealed: string, keyB64?: string): string {
  const key = loadKey(keyB64)
  const [version, iv, tag, ct] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || ct === undefined) {
    throw new Error('Formato de credencial inválido')
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8')
}
