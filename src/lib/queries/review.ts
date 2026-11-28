import { createServerSupabase } from '@/lib/supabase/server'
import { toLocalDate } from '@/lib/format/date'
import { prettyDescription } from '@/lib/format/description'
import { minusDays } from '@/lib/sync/classification'
import { groupNewPlaces, type NewPlaceGroup } from '@/lib/review/places'

const PENDING_DAYS = 30
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
export interface ReviewData {
  pending: PendingItem[]
  places: NewPlaceGroup[]
  categories: Category[]
}

type Row = { id: string; date: string; amount_cents: number; description_raw: string; accounts: { institution: string } | null }

/** Itens da revisão do usuário logado (RLS). */
export async function loadReview(): Promise<ReviewData> {
  const db = await createServerSupabase()
  const today = toLocalDate(new Date())
  const cols = 'id, date, amount_cents, description_raw, accounts(institution)'
  const [pending, places, categories] = await Promise.all([
    db
      .from('transactions')
      .select(cols)
      .eq('kind', 'pending_review')
      .is('deleted_at', null)
      .gte('date', minusDays(today, PENDING_DAYS))
      .order('date', { ascending: false })
      .limit(200),
    db
      .from('transactions')
      .select('id, date, amount_cents, description_raw')
      .eq('kind', 'expense')
      .is('merchant_id', null)
      .is('deleted_at', null)
      .gte('date', minusDays(today, PLACES_DAYS))
      .limit(1000),
    db.from('categories').select('id, name').order('name'),
  ])
  if (pending.error || places.error || categories.error) throw new Error('Falha ao carregar a revisão')
  return {
    pending: (pending.data as unknown as Row[]).map((r) => ({
      id: r.id,
      name: prettyDescription(r.description_raw),
      amountCents: r.amount_cents,
      date: r.date,
      bank: r.accounts?.institution ?? '',
    })),
    places: groupNewPlaces(
      (places.data ?? []).map((r) => ({ id: r.id, date: r.date, amountCents: r.amount_cents, description: r.description_raw })),
    ),
    categories: categories.data ?? [],
  }
}

/** Contador do atalho "Revisar" no Início. */
export function reviewCount(d: Pick<ReviewData, 'pending' | 'places'>): number {
  return d.pending.length + d.places.length
}
