import type { Account, Transaction } from 'pluggy-sdk'

export function makeTransaction(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    date: new Date('2026-11-20T12:00:00Z'),
    description: 'Compra teste',
    descriptionRaw: null,
    type: 'DEBIT',
    amount: 9,
    amountInAccountCurrency: null,
    balance: 0,
    currencyCode: 'BRL',
    category: null,
    creditCardMetadata: null,
    categoryId: null,
    operationType: null,
    operationTypeAdditionalInfo: null,
    providerId: null,
    ...over,
  } as Transaction
}

export function makeAccount(over: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    itemId: 'item-1',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '0001',
    balance: 0,
    name: 'Conta teste',
    marketingName: null,
    owner: null,
    taxNumber: null,
    currencyCode: 'BRL',
    bankData: null,
    creditData: null,
    ...over,
  } as Account
}
