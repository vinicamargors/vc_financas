import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const BAD_FORMAT = 'Formato de credencial inválido'

function loadKey(keyB64?: string): Buffer {
  const key = Buffer.from(keyB64 ?? process.env.CREDENTIALS_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('CREDENTIALS_KEY inválida')
  return key
}

export function seal(plain: string, keyB64?: string): string {
  const key = loadKey(keyB64)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN })
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

export function open(sealed: string, keyB64?: string): string {
  const key = loadKey(keyB64)
  const parts = sealed.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error(BAD_FORMAT)
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const ct = Buffer.from(parts[3], 'base64')
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) throw new Error(BAD_FORMAT)
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN })
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
