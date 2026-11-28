import type { GoalRow } from '@/lib/queries/invest'
import { goalOutlook } from './goal'
import { defaultTargetDate, monthsUntil } from './plan'

type Box = { id: string; balanceCents: number; cdiPercent: number | null }

/** Junta meta, caixinhas e FGTS: valores separados, potencial e cenários até a data-alvo. */
export function buildGoalView<B extends Box>(
  goal: GoalRow,
  ctx: {
    boxes: B[]
    cdi: number | null
    today: string
    paceCents: number
    fgts: { estimateCents: number; monthlyDepositCents: number } | null
  },
) {
  const boxes = ctx.boxes.filter((b) => goal.boxIds.includes(b.id))
  const boxesCents = boxes.reduce((s, b) => s + b.balanceCents, 0)
  const w = boxes.reduce((s, b) => s + (b.cdiPercent != null && b.balanceCents > 0 ? b.balanceCents : 0), 0)
  const cdiPercent = w > 0 ? boxes.reduce((s, b) => s + (b.cdiPercent != null && b.balanceCents > 0 ? b.balanceCents * b.cdiPercent : 0), 0) / w : 100
  const targetDate = goal.targetDate ?? defaultTargetDate(ctx.today)
  const months = monthsUntil(ctx.today, targetDate)
  const fgts = goal.includeFgts && ctx.fgts ? { balanceCents: ctx.fgts.estimateCents, monthlyDepositCents: ctx.fgts.monthlyDepositCents } : null
  const outlook = goalOutlook({
    boxesCents,
    cdiAnnualPct: ctx.cdi,
    cdiPercent,
    months,
    pace: { currentCents: Math.max(0, ctx.paceCents), minCents: goal.plannedMinCents, maxCents: goal.plannedMaxCents },
    fgts,
  })
  return { boxes, boxesCents, fgtsCents: fgts?.balanceCents ?? null, targetDate, months, ...outlook }
}
