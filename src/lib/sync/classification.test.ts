import type { Account, Item, Transaction } from 'pluggy-sdk'
import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '@/lib/pluggy/fixtures'
import type { PluggySource } from '@/lib/pluggy/source'
import { reclassifyAll } from './classification'
import { createMemoryRepo } from './memory-repo'
import { syncItem } from './sync-item'

const U = 'user-1'
const CPF = '123.456.789-09'
const today = '2026-11-27'
const now = () => new Date('2026-11-27T15:00:00Z')

function source(accounts: Account[], txsByAccount: Record<string, Transaction[]>): PluggySource {
  return {
    fetchItem: async () => ({ id: 'item-1', connector: { name: 'Banco' }, status: 'UPDATED', executionStatus: 'SUCCESS', error: null, consentExpiresAt: null }) as unknown as Item,
    fetchAccounts: async () => accounts,
    fetchTransactions: async (id: string) => txsByAccount[id] ?? [],
  } as unknown as PluggySource
}

const pixToSelf = makeTransaction({
  id: 'pix-self',
  description: 'Pix enviado',
  amount: 300,
  paymentData: { paymentMethod: 'PIX', receiver: { documentNumber: { type: 'CPF', value: CPF }, name: 'Fulano' } },
} as Partial<Transaction>)
const market = makeTransaction({ id: 'mkt', description: 'Supermercado X', amount: 42, category: 'Groceries' })
const owner = { owner: 'Fulano de Tal da Silva', taxNumber: CPF }

describe('classificação na sincronização', () => {
  it('Pix para o próprio CPF vira transferência e grava o CPF no perfil (só dígitos)', async () => {
    const repo = createMemoryRepo()
    await syncItem({ source: source([makeAccount({ id: 'acc-1', ...owner })], { 'acc-1': [pixToSelf, market] }), repo, today, now }, U, 'item-1')
    const byExt = new Map(repo.dump().transactions.map((t) => [t.externalId, t]))
    expect(byExt.get('pix-self')?.kind).toBe('transfer')
    expect(repo.dump().profiles.get(U)?.cpf).toBe('12345678909')
  })

  it('não sobrescreve CPF já gravado', async () => {
    const repo = createMemoryRepo()
    repo.seed({ profileCpf: { [U]: '99999999999' } })
    await syncItem({ source: source([makeAccount({ id: 'acc-1', ...owner })], { 'acc-1': [market] }), repo, today, now }, U, 'item-1')
    expect(repo.dump().profiles.get(U)?.cpf).toBe('99999999999')
  })

  it('resolve categoryName para o id da categoria do usuário', async () => {
    const repo = createMemoryRepo()
    repo.seed({ categories: [{ id: 'cat-mercado', userId: U, name: 'Mercado' }, { id: 'cat-x', userId: 'outro', name: 'Mercado' }] })
    await syncItem({ source: source([makeAccount({ id: 'acc-1' })], { 'acc-1': [market] }), repo, today, now }, U, 'item-1')
    const t = repo.dump().transactions.find((x) => x.externalId === 'mkt')
    expect(t).toMatchObject({ kind: 'expense', categoryId: 'cat-mercado' })
  })

  it('linha classificada pelo usuário fica intacta', async () => {
    const repo = createMemoryRepo()
    const deps = { source: source([makeAccount({ id: 'acc-1' })], { 'acc-1': [market] }), repo, today, now }
    await syncItem(deps, U, 'item-1')
    const t = repo.dump().transactions[0]
    repo.patch(t.id, { kind: 'income', classifiedBy: 'user', categoryId: null })
    await syncItem(deps, U, 'item-1')
    expect(repo.dump().transactions[0]).toMatchObject({ kind: 'income', classifiedBy: 'user', categoryId: null })
  })

  it('aplica unlinked antes de links e liga par entre contas; segunda rodada não muda nada', async () => {
    const repo = createMemoryRepo()
    const accounts = [makeAccount({ id: 'acc-1', ...owner }), makeAccount({ id: 'acc-2', ...owner })]
    const out = makeTransaction({ id: 'o', description: 'Pix enviado', amount: 500, paymentData: { paymentMethod: 'PIX', receiver: { documentNumber: { type: 'CPF', value: CPF } } } } as Partial<Transaction>)
    const inn = makeTransaction({ id: 'i', description: 'Pix recebido', type: 'CREDIT', amount: 500 })
    const stale = makeTransaction({ id: 's', description: 'Compra', amount: 7 })
    const deps = { source: source(accounts, { 'acc-1': [out, stale], 'acc-2': [inn] }), repo, today, now }
    await syncItem(deps, U, 'item-1')
    const ids = new Map(repo.dump().transactions.map((t) => [t.externalId, t.id]))
    // `s` aponta para `o` com ligação velha (sem volta): deve ser desfeita; `o` mantém o par com `i`.
    repo.patch(ids.get('s')!, { linkedTransactionId: ids.get('o')! })
    await reclassifyAll({ repo, today }, U)
    const byExt = new Map(repo.dump().transactions.map((t) => [t.externalId, t]))
    expect(byExt.get('o')).toMatchObject({ kind: 'transfer', linkedTransactionId: ids.get('i') })
    expect(byExt.get('i')).toMatchObject({ kind: 'transfer', linkedTransactionId: ids.get('o') })
    expect(byExt.get('s')?.linkedTransactionId).toBeNull()
    expect(repo.calls.applyClassification.at(-1)?.unlinked).toEqual([ids.get('s')])

    const second = await reclassifyAll({ repo, today }, U)
    expect(second).toEqual({ changed: 0 })
  })

  it('linha antiga com kind nulo é classificada no reclassifyAll', async () => {
    const repo = createMemoryRepo()
    await syncItem({ source: source([makeAccount({ id: 'acc-1' })], { 'acc-1': [market] }), repo, today, now }, U, 'item-1')
    const t = repo.dump().transactions[0]
    repo.patch(t.id, { kind: null })
    const r = await reclassifyAll({ repo, today }, U)
    expect(r.changed).toBe(1)
    expect(repo.dump().transactions[0].kind).toBe('expense')
  })
})
