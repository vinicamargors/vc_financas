export const REMOVE_FAILED_MESSAGE = 'Não foi possível remover a conexão. Tente de novo.'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Forma mínima do client do Supabase usada aqui (facilita o teste). */
export interface ConnectionDeleteQuery {
  eq(column: string, value: string): ConnectionDeleteQuery
  select(columns: string): PromiseLike<{ data: { id: string }[] | null; error: unknown }>
}
export interface ConnectionDeleteClient {
  from(table: 'connections'): { delete(): ConnectionDeleteQuery }
}

export interface RemoveDeps {
  /** Apaga a conexão do usuário e devolve quantas linhas saíram. */
  deleteOwned(userId: string, connectionId: string): Promise<number>
}

/**
 * Apaga a conexão sempre filtrando por id e user_id. O cascade do banco leva contas, lançamentos,
 * snapshots e caixinhas (accounts -> savings_boxes -> savings_box_entries). Webhook e credenciais ficam.
 */
export function createConnectionDeleter(client: ConnectionDeleteClient): RemoveDeps['deleteOwned'] {
  return async (userId, connectionId) => {
    const { data, error } = await client
      .from('connections')
      .delete()
      .eq('id', connectionId)
      .eq('user_id', userId)
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  }
}

export async function removeConnection(
  deps: RemoveDeps,
  userId: string,
  connectionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!UUID.test(connectionId)) return { ok: false, message: REMOVE_FAILED_MESSAGE }
  try {
    const removed = await deps.deleteOwned(userId, connectionId)
    return removed > 0 ? { ok: true } : { ok: false, message: REMOVE_FAILED_MESSAGE }
  } catch {
    return { ok: false, message: REMOVE_FAILED_MESSAGE }
  }
}
