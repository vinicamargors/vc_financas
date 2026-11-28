// Só `code`/`message` saem daqui: `details`/`hint` do PostgREST e headers do SDK podem ter CPF ou segredos.
/** Erros do SDK da Pluggy carregam a requisição (headers com segredos): só código/mensagem saem daqui. */
export function safeErrorMessage(e: unknown): string {
  let detail = 'erro desconhecido'
  if (typeof e === 'object' && e !== null) {
    const o = e as { code?: unknown; message?: unknown }
    if (typeof o.code === 'number' || typeof o.code === 'string') detail = String(o.code)
    else if (typeof o.message === 'string' && o.message) detail = o.message
  }
  return detail.slice(0, 200)
}
