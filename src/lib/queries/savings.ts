import { subDays } from 'date-fns'
import { dailyYieldCents } from '@/lib/cdi'
import { toLocalDate } from '@/lib/format/date'
import { createServerSupabase } from '@/lib/supabase/server'

export type SavingsBox = {
  id: string
  name: string | null
  balanceCents: number
  cdiPercent: number | null
  institution: string
  logoUrl: string | null
}

export type SavingsSummary = {
  totalCents: number
  /** Soma do rendimento estimado de um dia útil; nulo sem CDI. */
  dailyYieldCents: number | null
  /** Diferença entre o total do snapshot mais recente e do mais antigo (inclui depósitos e resgates). */
  change: { sinceDate: string; cents: number } | null
}

export type BoxSnapshot = { date: string; balanceCents: number }

/** Total guardado, rendimento diário estimado e variação entre o primeiro e o último dia com snapshot. */
export function summarizeSavings(boxes: SavingsBox[], snapshots: BoxSnapshot[], cdiAnnual: number | null): SavingsSummary {
  const totalCents = boxes.reduce((s, b) => s + b.balanceCents, 0)
  const daily =
    cdiAnnual == null ? null : boxes.reduce((s, b) => s + (b.cdiPercent ? dailyYieldCents(b.balanceCents, cdiAnnual, b.cdiPercent) : 0), 0)
  const byDate = new Map<string, number>()
  for (const s of snapshots) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.balanceCents)
  const dates = [...byDate.keys()].sort()
  const change =
    dates.length >= 2 ? { sinceDate: dates[0], cents: byDate.get(dates[dates.length - 1])! - byDate.get(dates[0])! } : null
  return { totalCents, dailyYieldCents: daily, change }
}

/** "120% do CDI" (até duas casas, sem zeros à direita). */
export function formatCdiPercent(pct: number): string {
  const n = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Math.round(pct * 100) / 100)
  return `${n}% do CDI`
}

const httpsOnly = (u: string | null | undefined) => (u && /^https:\/\//.test(u) ? u : null)

export async function loadSavings(days = 30): Promise<{ boxes: SavingsBox[]; snapshots: BoxSnapshot[] }> {
  const supabase = await createServerSupabase()
  const since = toLocalDate(subDays(new Date(), days))
  const [boxes, snaps] = await Promise.all([
    supabase
      .from('savings_boxes')
      .select('id, name, balance_cents, cdi_percent, accounts(institution, name, logo_url)')
      .order('balance_cents', { ascending: false }),
    supabase.from('savings_box_snapshots').select('date, balance_cents').gte('date', since),
  ])
  if (boxes.error) throw new Error('Falha ao carregar caixinhas')
  if (snaps.error) throw new Error('Falha ao carregar histórico das caixinhas')
  return {
    boxes: (boxes.data ?? []).map((b) => {
      const acc = Array.isArray(b.accounts) ? b.accounts[0] : b.accounts
      return {
        id: b.id,
        name: b.name,
        balanceCents: Number(b.balance_cents),
        cdiPercent: b.cdi_percent == null ? null : Number(b.cdi_percent),
        institution: acc?.institution ?? acc?.name ?? '',
        logoUrl: httpsOnly(acc?.logo_url),
      }
    }),
    snapshots: (snaps.data ?? []).map((s) => ({ date: s.date, balanceCents: Number(s.balance_cents) })),
  }
}
