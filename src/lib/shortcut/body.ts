export const MAX_BODY_BYTES = 4096

/**
 * Lê o corpo JSON com teto de tamanho. `too_large` antes de ler quando o `content-length` já
 * passa do teto; depois confere os bytes reais. JSON inválido vira `body: null`.
 */
export async function readLimitedJson(req: Request, max = MAX_BODY_BYTES): Promise<{ tooLarge: true } | { tooLarge: false; body: unknown }> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return { tooLarge: true }
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > max) return { tooLarge: true }
  try {
    return { tooLarge: false, body: JSON.parse(text) }
  } catch {
    return { tooLarge: false, body: null }
  }
}
