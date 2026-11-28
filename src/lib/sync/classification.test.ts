import type { Account, Item, Transaction } from 'pluggy-sdk'
import { describe, expect, it } from 'vitest'
import { makeAccount, makeTransaction } from '@/lib/pluggy/fixtures'
import type { PluggySource } from '@/lib/pluggy/source'
import { reclassifyAll } from './classification'
import { safeErrorMessage } from './safe-error'
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
  it.each([
    ['só nome', { owner: 'Fulano de Tal da Silva', taxNumber: null }, { name: 'Fulano de Tal da Silva' }],
    ['só CNPJ', { owner: null, taxNumber: '12.345.678/0001-90' }, { documentNumber: { type: 'CNPJ', value: '12345678000190' } }],
  ])('transferência própria por %s continua transferência no reclassifyAll', async (_l, acc, receiver) => {
    const repo = createMemoryRepo()
    const t = makeTransaction({ id: 'self', description: 'Pix enviado', amount: 2000, paymentData: { paymentMethod: 'PIX', receiver } } as Partial<Transaction>)
    await syncItem({ source: source([makeAccount({ id: 'acc-1', ...acc } as Partial<Account>)], { 'acc-1': [t] }), repo, today, now }, U, 'item-1')
    expect(repo.dump().transactions[0].kind).toBe('transfer')
    await reclassifyAll({ repo, today }, U)
    expect(repo.dump().transactions[0].kind).toBe('transfer')
  })

  it('entrada do pagador vira renda com a fonte; linha do usuário fica; fonte removida some no reclassifyAll', async () => {
    const repo = createMemoryRepo()
    const sal = makeTransaction({ id: 'sal', description: 'TED recebida', type: 'CREDIT', amount: 8500, paymentData: { payer: { documentNumber: { type: 'CNPJ', value: '12.345.678/0001-90' } } } } as Partial<Transaction>)
    const plr = makeTransaction({ id: 'plr', description: 'Credito PLR Acme Ltda', type: 'CREDIT', amount: 3200 })
    const mine = makeTransaction({ id: 'mine', description: 'Credito Acme Ltda', type: 'CREDIT', amount: 100 })
    await syncItem({ source: source([makeAccount({ id: 'acc-1' })], { 'acc-1': [sal, plr, mine] }), repo, today, now }, U, 'item-1')
    const byExt = () => new Map(repo.dump().transactions.map((t) => [t.externalId, t]))
    repo.patch(byExt().get('mine')!.id, { classifiedBy: 'user', kind: 'refund' })
    repo.seed({ incomeSources: [{ id: 'src-1', userId: U, payerDoc: '12345678000190', payerName: 'Acme Ltda' }] })
    await reclassifyAll({ repo, today }, U)
    expect(byExt().get('sal')).toMatchObject({ kind: 'income', incomeSourceId: 'src-1' })
    expect(byExt().get('plr')).toMatchObject({ kind: 'income', incomeSourceId: 'src-1' })
    expect(byExt().get('mine')).toMatchObject({ kind: 'refund', classifiedBy: 'user' })
    expect(byExt().get('mine')?.incomeSourceId ?? null).toBeNull()
    expect(await reclassifyAll({ repo, today }, U)).toEqual({ changed: 0 })

    repo.removeIncomeSource('src-1')
    await reclassifyAll({ repo, today }, U)
    expect(byExt().get('sal')).toMatchObject({ kind: 'income', incomeSourceId: null })
  })

  it('identidade do dono acumula (união) entre syncs', async () => {
    const repo = createMemoryRepo()
    await syncItem({ source: source([makeAccount({ id: 'acc-1', owner: 'A B C D E F G', taxNumber: CPF })], {}), repo, today, now }, U, 'item-1')
    await syncItem({ source: source([makeAccount({ id: 'acc-1', owner: 'Outro Nome Longo', taxNumber: '12.345.678/0001-90' })], {}), repo, today, now }, U, 'item-1')
    const p = repo.dump().profiles.get(U)!
    expect(p.ownerDocs.sort()).toEqual(['12345678000190', '12345678909'])
    expect(p.ownerNames.sort()).toEqual(['A B C D E F G', 'Outro Nome Longo'])
  })

  it('falha na classificação não derruba a sync nem marca SYNC_ERROR', async () => {
    const repo = createMemoryRepo()
    repo.loadClassificationData = async () => {
      throw Object.assign(new Error('boom'), { details: 'cpf 12345678909' })
    }
    const logs: string[] = []
    const r = await syncItem({ source: source([makeAccount({ id: 'acc-1' })], { 'acc-1': [market] }), repo, today, now, log: (m) => logs.push(m) }, U, 'item-1')
    expect(r.status).toBe('UPDATED')
    expect(repo.dump().connections[0]).toMatchObject({ status: 'UPDATED', lastSyncedAt: now().toISOString() })
    expect(repo.dump().transactions).toHaveLength(1)
    expect(logs.join()).toContain('boom')
    expect(logs.join()).not.toContain('12345678909')
  })
})

describe('safeErrorMessage', () => {
  it('nunca inclui details/hint do PostgREST', () => {
    const e = { code: '23505', message: 'dup', details: 'Key (cpf)=(12345678909)', hint: 'cpf 12345678909' }
    expect(safeErrorMessage(e)).toBe('23505')
    expect(safeErrorMessage({ message: 'x', details: '12345678909', hint: '12345678909' })).toBe('x')
  })
})

describe('classifierAccountType', () => {
  it('só a conta MANUAL do Atalho vira CREDIT', async () => {
    const { classifierAccountType } = await import('./repo')
    expect(classifierAccountType('MANUAL', 'atalho')).toBe('CREDIT')
    expect(classifierAccountType('MANUAL', 'outra')).toBe('MANUAL')
    expect(classifierAccountType('BANK', 'atalho')).toBe('BANK')
  })
  it('VR (BENEFIT) é tratado como cartão: compras não viram transferência', async () => {
    const { classifierAccountType } = await import('./repo')
    expect(classifierAccountType('BENEFIT', 'vr:x')).toBe('CREDIT')
  })
})
