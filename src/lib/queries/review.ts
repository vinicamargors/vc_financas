import { createServerSupabase } from '@/lib/supabase/server'
import { toLocalDate } from '@/lib/format/date'
import { prettyDescription } from '@/lib/format/description'
import { minusDays } from '@/lib/sync/classification'
import { recentWindowStart } from './totals'
import { groupNewPlaces, type NewPlaceGroup } from '@/lib/review/places'

/** Mesma janela da reclassificação: regra nova alcança tudo o que aparece aqui. */
const PLACES_DAYS = 90

export interface PendingItem {
  id: string
  name: string
  amountCents: number
  date: string
  bank: string
}
export interface Category {
  id: string
  name: string
}
/** Lançamento manual em dúvida e o candidato da Pluggy. */
export interface SameItem {
  id: string
  manual: PendingItem
  candidate: PendingItem
}
export interface ReviewData {
  same: SameItem[]
  pending: PendingItem[]
  places: NewPlaceGroup[]
  categories: Category[]
}

type Row = { id: string; date: string; amount_cents: number; description_raw: string; accounts: { institution: string; name?: string } | null }

/** Itens da revisão do usuário logado (RLS). */
export async function loadReview(): Promise<ReviewData> {
  const db = await createServerSupabase()
  const today = toLocalDate(new Date())
  const cols = 'id, date, amount_cents, description_raw, accounts(institution)'
  const conns = await db.from('connections').select('created_at').order('created_at', { ascending: true }).limit(1)
  // Só pede revisão do que aconteceu depois de conectar o banco; histórico antigo não incomoda.
  const since = conns.data?.[0]?.created_at ? toLocalDate(conns.data[0].created_at as string) : today
  const [pending, places, categories] = await Promise.all([
    db
      .from('transactions')
      .select(cols)
      .eq('kind', 'pending_review')
      .is('deleted_at', null)
      .gte('date', maxDate(since, recentWindowStart(today)))
      .order('date', { ascending: false })
      .limit(200),
    db
      .from('transactions')
      .select('id, date, amount_cents, description_raw')
      .eq('kind', 'expense')
      .is('merchant_id', null)
      .is('deleted_at', null)
      .gte('date', minusDays(today, PLACES_DAYS))
      .order('date', { ascending: false })
      .limit(1000),
    db.from('categories').select('id, name').order('name'),
  ])
  if (pending.error || places.error || categories.error) throw new Error('Falha ao carregar a revisão')
  const same = await loadSameItems(db)
  return {
    same,
    pending: (pending.data as unknown as Row[]).map((r) => ({
      id: r.id,
      name: prettyDescription(r.description_raw),
      amountCents: r.amount_cents,
      date: r.date,
      bank: r.accounts?.institution ?? '',
    })),
    places: placesSince(
      groupNewPlaces((places.data ?? []).map((r) => ({ id: r.id, date: r.date, amountCents: r.amount_cents, description: r.description_raw }))),
      new Set((places.data ?? []).filter((r) => r.date >= since).map((r) => r.id)),
    ),
    categories: categories.data ?? [],
  }
}

/** Contador do atalho "Revisar" no Início. */
export function reviewCount(d: Pick<ReviewData, 'pending' | 'places'> & Partial<Pick<ReviewData, 'same'>>): number {
  return d.pending.length + d.places.length + (d.same?.length ?? 0)
}

const toItem = (r: Row): PendingItem => ({
  id: r.id,
  name: prettyDescription(r.description_raw),
  amountCents: Number(r.amount_cents),
  date: r.date,
  bank: r.accounts?.institution ?? r.accounts?.name ?? '',
})

/** Manuais em dúvida com o candidato (RLS). Sem a migração da conferência, a seção some. */
async function loadSameItems(db: Awaited<ReturnType<typeof createServerSupabase>>): Promise<SameItem[]> {
  const cols = 'id, date, amount_cents, description_raw, reconcile_candidate_id, accounts(institution, name)'
  const { data, error } = await db
    .from('transactions')
    .select(cols)
    .eq('source', 'manual')
    .eq('reconciled', false)
    .is('deleted_at', null)
    .not('reconcile_candidate_id', 'is', null)
    .order('date', { ascending: false })
    .limit(100)
  if (error) {
    if (error.code === '42703' || error.code === 'PGRST204') return []
    throw new Error('Falha ao carregar a revisão')
  }
  const manuals = (data ?? []) as unknown as (Row & { reconcile_candidate_id: string })[]
  if (manuals.length === 0) return []
  const { data: cands, error: cErr } = await db
    .from('transactions')
    .select('id, date, amount_cents, description_raw, accounts(institution, name)')
    .in('id', manuals.map((m) => m.reconcile_candidate_id))
    .is('deleted_at', null)
  if (cErr) throw new Error('Falha ao carregar a revisão')
  // Candidato já ligado a outro Atalho/manual (vivo ou apagado) não pode ser fundido de novo.
  const { data: linked, error: lErr } = await db
    .from('transactions')
    .select('linked_transaction_id')
    .in('source', ['shortcut', 'manual'])
    .in('linked_transaction_id', manuals.map((m) => m.reconcile_candidate_id))
  if (lErr) throw new Error('Falha ao carregar a revisão')
  const taken = new Set((linked ?? []).map((l) => l.linked_transaction_id as string))
  const byId = new Map(((cands ?? []) as unknown as Row[]).map((c) => [c.id, c]))
  return manuals.flatMap((m) => {
    const c = taken.has(m.reconcile_candidate_id) ? undefined : byId.get(m.reconcile_candidate_id)
    return c ? [{ id: m.id, manual: toItem(m), candidate: toItem(c) }] : []
  })
}

const maxDate = (a: string, b: string) => (a > b ? a : b)

/** Só lugares que reapareceram depois da conexão; o histórico conta, mas não dispara pedido. */
export function placesSince(groups: NewPlaceGroup[], recentIds: Set<string>): NewPlaceGroup[] {
  return groups.filter((g) => g.ids.some((id) => recentIds.has(id)))
}
