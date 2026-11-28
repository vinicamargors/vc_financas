import { describe, expect, it } from 'vitest'
import { createConnectionDeleter, removeConnection, type ConnectionDeleteClient } from './remove'

type Row = { id: string; user_id: string }

/** Cliente falso: aplica os filtros .eq() recebidos sobre uma tabela em memória. */
function fakeClient(rows: Row[]) {
  const table = rows
  const client: ConnectionDeleteClient = {
    from(name) {
      expect(name).toBe('connections')
      return {
        delete() {
          const filters: [string, string][] = []
          const q = {
            eq(col: string, val: string) {
              filters.push([col, val])
              return q
            },
            select() {
              const hit = table.filter((r) => filters.every(([c, v]) => r[c as keyof Row] === v))
              for (const r of hit) table.splice(table.indexOf(r), 1)
              return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
            },
          }
          return q
        },
      }
    },
  }
  return { client, table }
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('removeConnection', () => {
  it('remove só a conexão do próprio usuário', async () => {
    const { client, table } = fakeClient([
      { id: A, user_id: 'u1' },
      { id: B, user_id: 'u1' },
    ])
    const r = await removeConnection({ deleteOwned: createConnectionDeleter(client) }, 'u1', A)
    expect(r).toEqual({ ok: true })
    expect(table.map((x) => x.id)).toEqual([B])
  })

  it('conexão de outro usuário não é afetada', async () => {
    const { client, table } = fakeClient([{ id: A, user_id: 'u2' }])
    const r = await removeConnection({ deleteOwned: createConnectionDeleter(client) }, 'u1', A)
    expect(r.ok).toBe(false)
    expect(table).toHaveLength(1)
  })

  it('id que não é uuid: nem consulta o banco', async () => {
    let called = false
    const r = await removeConnection({ deleteOwned: async () => ((called = true), 1) }, 'u1', 'abc')
    expect(r.ok).toBe(false)
    expect(called).toBe(false)
  })

  it('erro do banco vira mensagem fixa, sem vazar detalhe', async () => {
    const r = await removeConnection(
      { deleteOwned: async () => { throw new Error('segredo interno') } },
      'u1',
      A,
    )
    expect(r).toEqual({ ok: false, message: 'Não foi possível remover a conexão. Tente de novo.' })
  })
})
