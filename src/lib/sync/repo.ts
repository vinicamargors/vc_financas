import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClassifyTx, IncomeSourceMatch, Kind, Rule } from '@/lib/classify/classify'
import type { AccountRow, SavingsBoxRow, TransactionRow } from '@/lib/pluggy/map'
import { minusDays } from './classification'
import type { ManualRow, ReconcileCandidate } from '@/lib/reconcile/reconcile'
import type { MergeCandidate, ShortcutMatch, ShortcutRow } from '@/lib/shortcut/merge'

/** Espelha as colunas de `connections` (camelCase). */
export interface ConnectionRow {
  id: string
  userId: string
  pluggyItemId: string
  connectorName: string
  /** Logo oficial do banco (Pluggy `connector.imageUrl`). */
  connectorImageUrl?: string | null
  status: string
  statusDetail: string | null
  consentExpiresAt: string | null
  /** Última busca da Pluggy no banco (item.lastUpdatedAt). */
  bankDataAt?: string | null
  lastSyncedAt: string | null
  createdAt: string
}

/** Lançamento como o classificador vê, mais a categoria/merchant gravados (para comparar). */
export type StoredClassifyTx = ClassifyTx & { categoryId: string | null; merchantId: string | null; incomeSourceId: string | null }

export interface ClassificationData {
  /** Janela `[from, to]` em todas as contas, mais os pares de linhas ligadas (mesmo fora da janela). */
  transactions: StoredClassifyTx[]
  accounts: { id: string; type: 'BANK' | 'CREDIT' }[]
  rules: Rule[]
  merchants: { id: string; categoryId: string | null }[]
  categories: { id: string; name: string }[]
  incomeSources: IncomeSourceMatch[]
  ownerCpf: string | null
  ownerDocs: string[]
  ownerNames: string[]
}

export interface ClassificationPatch {
  id: string
  kind: Kind
  categoryId: string | null
  merchantId: string | null
  incomeSourceId: string | null
}

export interface ClassificationChanges {
  /** Zerar `linked_transaction_id` (aplicado antes de `links`). */
  unlinked: string[]
  links: { id: string; linkedId: string }[]
  decisions: ClassificationPatch[]
}

export type ConnectionInput = Omit<ConnectionRow, 'id' | 'createdAt'>

export interface SyncRepo {
  getConnection(userId: string, itemId: string): Promise<ConnectionRow | null>
  upsertConnection(row: ConnectionInput): Promise<ConnectionRow>
  upsertAccounts(rows: AccountRow[]): Promise<{ id: string; externalId: string; type: string }[]>
  upsertTransactions(rows: TransactionRow[]): Promise<number>
  markTransactionsDeleted(userId: string, externalIds: string[]): Promise<void>
  /** Conflito em `user_id,account_id,date`: sincronizar de novo no mesmo dia sobrescreve. */
  upsertBalanceSnapshot(userId: string, accountId: string, date: string, balanceCents: number): Promise<void>
  /** Conflito em `user_id,external_id`. Caixinhas que somem da Pluggy não são apagadas. */
  upsertSavingsBoxes(rows: SavingsBoxRow[]): Promise<{ id: string; externalId: string }[]>
  /** Conflito em `user_id,box_id,date`: mesmo dia sobrescreve. */
  upsertSavingsBoxSnapshots(userId: string, date: string, rows: { boxId: string; balanceCents: number }[]): Promise<void>
  /**
   * União em `profiles.owner_docs` (só dígitos, CPF e CNPJ) e `owner_names`; grava `profiles.cpf`
   * com o primeiro CPF quando vazio. Nunca logar.
   */
  mergeOwnerIdentity(userId: string, docs: string[], names: string[]): Promise<void>
  loadClassificationData(userId: string, from: string, to: string): Promise<ClassificationData>
  /** Aplica na ordem unlinked → links → decisions, só em linhas `classified_by = 'auto'`. */
  applyClassification(userId: string, changes: ClassificationChanges): Promise<void>
  /**
   * Para a fusão com o Atalho, na janela `[from, to]`: linhas do Atalho vivas e sem par, saídas da
   * Pluggy em contas CREDIT, e ids da Pluggy já apontados por atalhos fundidos (`taken`).
   */
  loadShortcutMerge(userId: string, from: string, to: string): Promise<{ shortcuts: ShortcutRow[]; candidates: MergeCandidate[]; taken: string[] }>
  /**
   * Copia merchant/categoria do atalho para a linha da Pluggy (com `kind` e `classified_by = 'user'`
   * quando o atalho foi classificado pelo usuário; nunca sobrescreve linha da Pluggy já do usuário)
   * e apaga o atalho (soft delete) com `linked_transaction_id` apontando para a da Pluggy.
   */
  applyShortcutMerges(userId: string, matches: ShortcutMatch[]): Promise<void>
  /**
   * Conferência do lançamento manual, na janela `[from, to]`: manuais vivos, sem par, não conferidos e fora do VR;
   * lançamentos da Pluggy de mesmo sinal na janela (±1 dia); e ids da Pluggy já ligados a um atalho/manual.
   */
  loadManualReconcile(userId: string, from: string, to: string): Promise<{ manuals: ManualRow[]; candidates: ReconcileCandidate[]; taken: string[] }>
  /** Grava a dúvida (`reconcile_candidate_id`) em manuais vivos e não conferidos do usuário. */
  setReconcileCandidates(userId: string, doubts: { manualId: string; candidateId: string }[]): Promise<void>
}

const CHUNK = 500
/** Linhas provisórias que a Pluggy substitui ao chegar: Atalho e lançamento manual. */
const MERGEABLE_SOURCES = ['shortcut', 'manual']

/** `external_id` da conta MANUAL criada pelo Atalho do iPhone. */
export const SHORTCUT_ACCOUNT_EXTERNAL_ID = 'atalho'

/**
 * A conta do Atalho só recebe compras de cartão: o classificador a vê como CREDIT (assim uma
 * compra nunca vira par de transferência). Outras contas seguem como estão.
 */
export function classifierAccountType(type: string, externalId: string | null): 'BANK' | 'CREDIT' {
  // VR (BENEFIT) se comporta como cartão: compra não é transferência e não pareia com o banco.
  if (type === 'BENEFIT') return 'CREDIT'
  return (type === 'MANUAL' && externalId === SHORTCUT_ACCOUNT_EXTERNAL_ID ? 'CREDIT' : type) as 'BANK' | 'CREDIT'
}


/** Listas de uuid vão na URL (`in.(...)`): lotes menores. */
const ID_CHUNK = 100
/** Teto de linhas por resposta do PostgREST (`max_rows`). */
const PAGE = 1000

function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

interface ConnectionDb {
  id: string
  user_id: string
  pluggy_item_id: string
  connector_name: string
  connector_image_url: string | null
  status: string
  status_detail: string | null
  consent_expires_at: string | null
  bank_data_at?: string | null
  last_synced_at: string | null
  created_at: string
}

interface TxDb {
  id: string
  account_id: string
  date: string
  amount_cents: number
  description_raw: string
  pluggy_category: string | null
  counterparty_name: string | null
  counterparty_doc: string | null
  payment_method: string | null
  kind: Kind | null
  classified_by: 'auto' | 'user'
  linked_transaction_id: string | null
  category_id: string | null
  merchant_id: string | null
  income_source_id: string | null
}

const TX_COLUMNS =
  'id, account_id, date, amount_cents, description_raw, pluggy_category, counterparty_name, counterparty_doc, payment_method, kind, classified_by, linked_transaction_id, category_id, merchant_id, income_source_id'

const txFromDb = (r: TxDb): StoredClassifyTx => ({
  id: r.id,
  accountId: r.account_id,
  date: r.date,
  amountCents: Number(r.amount_cents),
  descriptionRaw: r.description_raw,
  pluggyCategory: r.pluggy_category,
  counterpartyName: r.counterparty_name,
  counterpartyDoc: r.counterparty_doc,
  paymentMethod: r.payment_method,
  kind: r.kind,
  classifiedBy: r.classified_by,
  linkedTransactionId: r.linked_transaction_id,
  categoryId: r.category_id,
  merchantId: r.merchant_id,
  incomeSourceId: r.income_source_id,
})

const fromDb = (r: ConnectionDb): ConnectionRow => ({
  id: r.id,
  userId: r.user_id,
  pluggyItemId: r.pluggy_item_id,
  connectorName: r.connector_name,
  connectorImageUrl: r.connector_image_url,
  status: r.status,
  statusDetail: r.status_detail,
  consentExpiresAt: r.consent_expires_at,
  bankDataAt: r.bank_data_at ?? null,
  lastSyncedAt: r.last_synced_at,
  createdAt: r.created_at,
})

export function createSupabaseSyncRepo(admin: SupabaseClient): SyncRepo {
  return {
    async getConnection(userId, itemId) {
      const { data, error } = await admin
        .from('connections')
        .select('*')
        .eq('user_id', userId)
        .eq('pluggy_item_id', itemId)
        .maybeSingle()
      if (error) throw error
      return data ? fromDb(data as ConnectionDb) : null
    },

    async upsertConnection(row) {
      const { data, error } = await admin
        .from('connections')
        .upsert(
          {
            user_id: row.userId,
            pluggy_item_id: row.pluggyItemId,
            connector_name: row.connectorName,
            connector_image_url: row.connectorImageUrl ?? null,
            status: row.status,
            status_detail: row.statusDetail,
            consent_expires_at: row.consentExpiresAt,
            ...(row.bankDataAt !== undefined ? { bank_data_at: row.bankDataAt } : {}),
            last_synced_at: row.lastSyncedAt,
          },
          { onConflict: 'user_id,pluggy_item_id' },
        )
        .select('*')
        .single()
      if (error) throw error
      return fromDb(data as ConnectionDb)
    },

    async upsertAccounts(rows) {
      if (rows.length === 0) return []
      const { data, error } = await admin
        .from('accounts')
        .upsert(
          rows.map((r) => ({
            user_id: r.userId,
            connection_id: r.connectionId,
            external_id: r.externalId,
            type: r.type,
            subtype: r.subtype,
            name: r.name,
            institution: r.institution,
            logo_url: r.logoUrl ?? null,
            balance_cents: r.balanceCents,
            credit_limit_cents: r.creditLimitCents,
            closing_day: r.closingDay,
            due_day: r.dueDay,
          })),
          { onConflict: 'user_id,external_id' },
        )
        .select('id, external_id, type')
      if (error) throw error
      return (data ?? []).map((a) => ({
        id: a.id,
        externalId: a.external_id,
        type: a.type,
      }))
    },

    async upsertTransactions(rows) {
      // O Postgres rejeita a mesma chave duas vezes no mesmo upsert.
      const unique = [...new Map(rows.map((r) => [`${r.userId}:${r.externalId}`, r])).values()]
      for (const part of chunks(unique)) {
        // `deleted_at`, `kind`, `category_id` etc. ficam fora do payload: não são sobrescritos.
        // Exceção: rendimento de caixinha grava `kind` (lote separado, pois colunas ausentes viram null).
        for (const group of [part.filter((r) => !r.kind), part.filter((r) => r.kind)]) {
          if (group.length === 0) continue
          const { error } = await admin.from('transactions').upsert(
            group.map((r) => ({
              user_id: r.userId,
              account_id: r.accountId,
              external_id: r.externalId,
              source: r.source,
              date: r.date,
              occurred_at: r.occurredAt,
              amount_cents: r.amountCents,
              description_raw: r.descriptionRaw,
              pluggy_category: r.pluggyCategory,
              counterparty_name: r.counterpartyName,
              counterparty_doc: r.counterpartyDoc,
              payment_method: r.paymentMethod,
              installment_number: r.installmentNumber,
              installment_total: r.installmentTotal,
              card_last4: r.cardLast4,
              status: r.status,
              ...(r.kind ? { kind: r.kind } : {}),
              raw: r.raw,
            })),
            { onConflict: 'user_id,external_id' },
          )
          if (error) throw error
        }
      }
      return unique.length
    },

    async markTransactionsDeleted(userId, externalIds) {
      for (const part of chunks(externalIds)) {
        const { error } = await admin
          .from('transactions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('user_id', userId)
          .in('external_id', part)
        if (error) throw error
      }
    },

    async upsertBalanceSnapshot(userId, accountId, date, balanceCents) {
      const { error } = await admin.from('balance_snapshots').upsert(
        {
          user_id: userId,
          account_id: accountId,
          date,
          balance_cents: balanceCents,
        },
        { onConflict: 'user_id,account_id,date' },
      )
      if (error) throw error
    },

    async upsertSavingsBoxes(rows) {
      if (rows.length === 0) return []
      const unique = [...new Map(rows.map((r) => [`${r.userId}:${r.externalId}`, r])).values()]
      const { data, error } = await admin
        .from('savings_boxes')
        .upsert(
          unique.map((r) => ({
            user_id: r.userId,
            account_id: r.accountId,
            external_id: r.externalId,
            name: r.name,
            balance_cents: r.balanceCents,
            cdi_percent: r.cdiPercent,
          })),
          { onConflict: 'user_id,external_id' },
        )
        .select('id, external_id')
      if (error) throw error
      return (data ?? []).map((b) => ({ id: b.id, externalId: b.external_id }))
    },

    async upsertSavingsBoxSnapshots(userId, date, rows) {
      if (rows.length === 0) return
      const { error } = await admin.from('savings_box_snapshots').upsert(
        rows.map((r) => ({
          user_id: userId,
          box_id: r.boxId,
          date,
          balance_cents: r.balanceCents,
        })),
        { onConflict: 'user_id,box_id,date' },
      )
      if (error) throw error
    },

    async mergeOwnerIdentity(userId, docs, names) {
      const cleanDocs = docs.map((d) => d.replace(/\D/g, '')).filter(Boolean)
      const cleanNames = names.map((n) => n.trim()).filter(Boolean)
      if (cleanDocs.length === 0 && cleanNames.length === 0) return
      const { data, error } = await admin.from('profiles').select('cpf, owner_docs, owner_names').eq('user_id', userId).maybeSingle()
      if (error) throw error
      if (!data) return
      const ownerDocs = [...new Set([...((data.owner_docs as string[]) ?? []), ...cleanDocs])]
      const ownerNames = [...new Set([...((data.owner_names as string[]) ?? []), ...cleanNames])]
      const cpf = (data.cpf as string | null) || cleanDocs.find((d) => d.length === 11) || null
      const { error: upErr } = await admin
        .from('profiles')
        .update({ owner_docs: ownerDocs, owner_names: ownerNames, cpf })
        .eq('user_id', userId)
      if (upErr) throw upErr
    },

    async loadClassificationData(userId, from, to) {
      const [accounts, rules, merchants, categories, profile, sources] = await Promise.all([
        admin.from('accounts').select('id, type, external_id').eq('user_id', userId),
        admin.from('rules').select('match_field, pattern, merchant_id, category_id, kind').eq('user_id', userId).order('created_at'),
        admin.from('merchants').select('id, category_id').eq('user_id', userId),
        admin.from('categories').select('id, name').eq('user_id', userId),
        admin.from('profiles').select('cpf, owner_docs, owner_names').eq('user_id', userId).maybeSingle(),
        admin.from('income_sources').select('id, payer_doc, payer_name').eq('user_id', userId).order('created_at'),
      ])
      for (const r of [accounts, rules, merchants, categories, profile, sources]) if (r.error) throw r.error
      const rows: StoredClassifyTx[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await admin
          .from('transactions')
          .select(TX_COLUMNS)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .gte('date', from)
          .lte('date', to)
          .order('id')
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        rows.push(...((data ?? []) as TxDb[]).map(txFromDb))
        if ((data ?? []).length < PAGE) break
      }
      const have = new Set(rows.map((t) => t.id))
      const missing = [...new Set(rows.map((t) => t.linkedTransactionId).filter((id): id is string => !!id && !have.has(id)))]
      for (const part of chunks(missing, ID_CHUNK)) {
        const { data, error } = await admin.from('transactions').select(TX_COLUMNS).eq('user_id', userId).is('deleted_at', null).in('id', part)
        if (error) throw error
        rows.push(...((data ?? []) as TxDb[]).map(txFromDb))
      }
      return {
        transactions: rows,
        accounts: (accounts.data ?? []).map((a) => ({ id: a.id as string, type: classifierAccountType(a.type as string, a.external_id as string) })),
        rules: (rules.data ?? []).map((r) => ({
          matchField: r.match_field as Rule['matchField'],
          pattern: r.pattern as string,
          merchantId: (r.merchant_id as string | null) ?? null,
          categoryId: (r.category_id as string | null) ?? null,
          kind: (r.kind as Kind | null) ?? null,
        })),
        merchants: (merchants.data ?? []).map((m) => ({ id: m.id as string, categoryId: (m.category_id as string | null) ?? null })),
        categories: (categories.data ?? []).map((c) => ({ id: c.id as string, name: c.name as string })),
        incomeSources: (sources.data ?? []).map((x) => ({
          id: x.id as string,
          payerDoc: (x.payer_doc as string | null) ?? null,
          payerName: (x.payer_name as string | null) ?? null,
        })),
        ownerCpf: (profile.data?.cpf as string | null | undefined) ?? null,
        ownerDocs: (profile.data?.owner_docs as string[] | undefined) ?? [],
        ownerNames: (profile.data?.owner_names as string[] | undefined) ?? [],
      }
    },

    async applyClassification(userId, { unlinked, links, decisions }) {
      // Não é atômico (vários UPDATEs): se cair no meio, a próxima rodada compara com o gravado e
      // completa só o que faltou (o serviço envia apenas diferenças).
      // Toda escrita filtra user_id e classified_by = 'auto' (a escolha do usuário nunca é sobrescrita).
      const autoRows = () => admin.from('transactions')
      for (const part of chunks(unlinked, ID_CHUNK)) {
        const { error } = await autoRows()
          .update({ linked_transaction_id: null })
          .eq('user_id', userId)
          .eq('classified_by', 'auto')
          .in('id', part)
        if (error) throw error
      }
      // Ligações são poucas (pares) e cada uma tem valor próprio.
      for (const l of links) {
        const { error } = await autoRows()
          .update({ linked_transaction_id: l.linkedId })
          .eq('user_id', userId)
          .eq('classified_by', 'auto')
          .eq('id', l.id)
        if (error) throw error
      }
      // Decisões agrupadas por valor: um UPDATE por combinação (kind, categoria, merchant, fonte de renda).
      const groups = new Map<string, { patch: Omit<ClassificationPatch, 'id'>; ids: string[] }>()
      for (const d of decisions) {
        const key = `${d.kind}|${d.categoryId ?? ''}|${d.merchantId ?? ''}|${d.incomeSourceId ?? ''}`
        const g = groups.get(key) ?? {
          patch: { kind: d.kind, categoryId: d.categoryId, merchantId: d.merchantId, incomeSourceId: d.incomeSourceId },
          ids: [],
        }
        g.ids.push(d.id)
        groups.set(key, g)
      }
      for (const { patch, ids } of groups.values()) {
        for (const part of chunks(ids, ID_CHUNK)) {
          const { error } = await autoRows()
            .update({ kind: patch.kind, category_id: patch.categoryId, merchant_id: patch.merchantId, income_source_id: patch.incomeSourceId })
            .eq('user_id', userId)
            .eq('classified_by', 'auto')
            .in('id', part)
          if (error) throw error
        }
      }
    },
    async loadShortcutMerge(userId, from, to) {
      const lo = minusDays(from, 1)
      const hi = minusDays(to, -1)
      const [shortcuts, credit] = await Promise.all([
        admin
          .from('transactions')
          .select('id, account_id, date, amount_cents, created_at, merchant_id, category_id, kind, classified_by')
          .eq('user_id', userId)
          .eq('source', 'shortcut')
          .is('deleted_at', null)
          .is('linked_transaction_id', null)
          .gte('date', from)
          .lte('date', to)
          .limit(PAGE),
        admin.from('accounts').select('id').eq('user_id', userId).eq('type', 'CREDIT'),
      ])
      for (const r of [shortcuts, credit]) if (r.error) throw r.error
      const scRows = shortcuts.data ?? []
      const creditIds = (credit.data ?? []).map((a) => a.id as string)
      let candidates: MergeCandidate[] = []
      const taken: string[] = []
      if (scRows.length && creditIds.length) {
        const amounts = [...new Set(scRows.map((s) => Number(s.amount_cents)))]
        const { data, error } = await admin
          .from('transactions')
          .select('id, account_id, date, amount_cents, created_at')
          .eq('user_id', userId)
          .eq('source', 'pluggy')
          .is('deleted_at', null)
          .in('account_id', creditIds)
          .in('amount_cents', amounts.slice(0, ID_CHUNK))
          .gte('date', lo)
          .lte('date', hi)
          .order('date')
          .limit(PAGE)
        if (error) throw error
        candidates = (data ?? []).map((c) => ({
          id: c.id as string,
          accountId: c.account_id as string,
          date: c.date as string,
          amountCents: Number(c.amount_cents),
          createdAt: c.created_at as string,
        }))
        for (const part of chunks(candidates.map((c) => c.id), ID_CHUNK)) {
          const { data: merged, error: mErr } = await admin
            .from('transactions')
            .select('linked_transaction_id')
            .eq('user_id', userId)
            .in('source', MERGEABLE_SOURCES)
            .in('linked_transaction_id', part)
          if (mErr) throw mErr
          taken.push(...(merged ?? []).map((m) => m.linked_transaction_id as string))
        }
      }
      return {
        shortcuts: scRows.map((s) => ({
          id: s.id as string,
          accountId: s.account_id as string,
          date: s.date as string,
          amountCents: Number(s.amount_cents),
          createdAt: s.created_at as string,
          merchantId: (s.merchant_id as string | null) ?? null,
          categoryId: (s.category_id as string | null) ?? null,
          kind: (s.kind as Kind | null) ?? null,
          classifiedBy: s.classified_by as 'auto' | 'user',
        })),
        candidates,
        taken,
      }
    },

    async applyShortcutMerges(userId, matches) {
      for (const { shortcut: s, pluggyId } of matches) {
        // Primeiro apaga o atalho, só se ainda estiver vivo e sem par: uma rodada concorrente não funde duas vezes.
        const { data: gone, error: delErr } = await admin
          .from('transactions')
          .update({ deleted_at: new Date().toISOString(), linked_transaction_id: pluggyId })
          .eq('user_id', userId)
          .eq('id', s.id)
          .in('source', MERGEABLE_SOURCES)
          .is('deleted_at', null)
          .is('linked_transaction_id', null)
          .select('id')
        if (delErr) throw delErr
        if ((gone ?? []).length !== 1) continue
        if (s.merchantId === null && s.categoryId === null && s.classifiedBy !== 'user') continue
        const patch =
          s.classifiedBy === 'user'
            ? { merchant_id: s.merchantId, category_id: s.categoryId, kind: s.kind, classified_by: 'user' }
            : { merchant_id: s.merchantId, category_id: s.categoryId }
        const { error } = await admin
          .from('transactions')
          .update(patch)
          .eq('user_id', userId)
          .eq('id', pluggyId)
          .eq('classified_by', 'auto')
        if (error) throw error
      }
    },
    async loadManualReconcile(userId, from, to) {
      const { data: accs, error: aErr } = await admin.from('accounts').select('id, type, connection_id').eq('user_id', userId)
      if (aErr) throw aErr
      const bankKey = new Map((accs ?? []).map((a) => [a.id as string, (a.connection_id as string | null) ?? null]))
      const eligible = (accs ?? []).filter((a) => a.type === 'BANK' || a.type === 'CREDIT').map((a) => a.id as string)
      if (eligible.length === 0) return { manuals: [], candidates: [], taken: [] }
      const { data: mRows, error: mErr } = await admin
        .from('transactions')
        .select('id, account_id, date, amount_cents, created_at, occurred_at, description_raw, merchant_id, category_id, kind, classified_by, reconcile_candidate_id')
        .eq('user_id', userId)
        .eq('source', 'manual')
        .eq('reconciled', false)
        .is('deleted_at', null)
        .is('linked_transaction_id', null)
        .in('account_id', eligible)
        .gte('date', from)
        .lte('date', to)
        .limit(PAGE)
      if (mErr) throw mErr
      const manuals: ManualRow[] = (mRows ?? []).map((s) => ({
        id: s.id as string,
        accountId: s.account_id as string,
        bankKey: bankKey.get(s.account_id as string) ?? null,
        date: s.date as string,
        amountCents: Number(s.amount_cents),
        createdAt: s.created_at as string,
        occurredAt: (s.occurred_at as string | null) ?? null,
        description: (s.description_raw as string) ?? '',
        merchantId: (s.merchant_id as string | null) ?? null,
        categoryId: (s.category_id as string | null) ?? null,
        kind: (s.kind as Kind | null) ?? null,
        classifiedBy: s.classified_by as 'auto' | 'user',
        reconcileCandidateId: (s.reconcile_candidate_id as string | null) ?? null,
      }))
      if (manuals.length === 0) return { manuals, candidates: [], taken: [] }
      const { data: cRows, error: cErr } = await admin
        .from('transactions')
        .select('id, account_id, date, amount_cents, created_at, occurred_at, description_raw')
        .eq('user_id', userId)
        .eq('source', 'pluggy')
        .is('deleted_at', null)
        .in('account_id', eligible)
        .gte('date', minusDays(from, 1))
        .lte('date', minusDays(to, -1))
        .order('date')
        .limit(PAGE)
      if (cErr) throw cErr
      const amounts = manuals.map((m) => Math.abs(m.amountCents))
      const candidates: ReconcileCandidate[] = (cRows ?? [])
        .filter((c) => amounts.some((a) => Math.abs(Math.abs(Number(c.amount_cents)) - a) <= a * 0.05))
        .map((c) => ({
          id: c.id as string,
          accountId: c.account_id as string,
          bankKey: bankKey.get(c.account_id as string) ?? null,
          date: c.date as string,
          amountCents: Number(c.amount_cents),
          createdAt: c.created_at as string,
          occurredAt: (c.occurred_at as string | null) ?? null,
          description: (c.description_raw as string) ?? '',
        }))
      const taken: string[] = []
      for (const part of chunks(candidates.map((c) => c.id), ID_CHUNK)) {
        const { data, error } = await admin
          .from('transactions')
          .select('linked_transaction_id')
          .eq('user_id', userId)
          .in('source', MERGEABLE_SOURCES)
          .in('linked_transaction_id', part)
        if (error) throw error
        taken.push(...(data ?? []).map((m) => m.linked_transaction_id as string))
      }
      return { manuals, candidates, taken }
    },

    async setReconcileCandidates(userId, doubts) {
      for (const d of doubts) {
        const { error } = await admin
          .from('transactions')
          .update({ reconcile_candidate_id: d.candidateId })
          .eq('user_id', userId)
          .eq('id', d.manualId)
          .eq('source', 'manual')
          .eq('reconciled', false)
          .is('deleted_at', null)
        if (error) throw error
      }
    },
  }
}
