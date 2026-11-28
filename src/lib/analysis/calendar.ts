import { addDays, lastDayOfMonth, parseYmd, ymd } from '@/lib/cycle/businessDays'
import { niceStep, type ChartBox } from '@/lib/invest/chart'
import { isSpend } from './by-category'

type Tx = { date: string; amountCents: number; kind: string | null; accountId: string }

const MONTH_RE = /^(\d{4})-(\d{2})$/

/** `YYYY-MM` válido e não futuro; senão o mês de hoje. */
export function parseMonth(v: string | undefined, today: string): string {
  const current = today.slice(0, 7)
  const m = v ? MONTH_RE.exec(v) : null
  if (!m || Number(m[1]) < 2000 || Number(m[2]) < 1 || Number(m[2]) > 12 || v! > current) return current
  return v!
}

export const MIN_MONTH = '2000-01'

/** Mês anterior/seguinte em `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const idx = y * 12 + (m - 1) + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = parseYmd(`${month}-01`)
  return { start: ymd(y, m, 1), end: ymd(y, m, lastDayOfMonth(y, m)) }
}

/** Grade do mês em semanas de segunda a domingo; `null` fora do mês. */
export function monthGrid(month: string): (string | null)[][] {
  const { start, end } = monthRange(month)
  const [y, m] = parseYmd(start)
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Gasto (despesa − estorno) por dia. */
export function dailySpend(txs: Tx[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of txs) if (isSpend(t.kind)) out.set(t.date, (out.get(t.date) ?? 0) - t.amountCents)
  return out
}

/** Intensidade da cor do dia (0–1), linear ao maior gasto do mês. */
export function heat(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  return Math.round(Math.min(1, value / max) * 100) / 100
}

export type WeekInOut = { start: string; end: string; inCents: number; outCents: number }

/** Entradas (renda fora do VR) e gasto de cada semana da grade. */
export function weeklyInOut(txs: Tx[], weeks: (string | null)[][], accountTypes: Map<string, string>): WeekInOut[] {
  const out: WeekInOut[] = weeks.map((w) => {
    const days = w.filter((d): d is string => d !== null)
    return { start: days[0], end: days[days.length - 1], inCents: 0, outCents: 0 }
  })
  for (const t of txs) {
    const wk = out.find((w) => t.date >= w.start && t.date <= w.end)
    if (!wk) continue
    if (isSpend(t.kind)) wk.outCents -= t.amountCents
    else if (t.kind === 'income' && t.amountCents > 0 && accountTypes.get(t.accountId) !== 'BENEFIT') wk.inCents += t.amountCents
  }
  return out
}

const TICKS = 4
const r1 = (n: number) => Math.round(n * 10) / 10

/** Barras agrupadas (entradas × saídas) a partir de zero, com marcas "redondas" do eixo. */
export function buildBars(series: { inCents: number; outCents: number }[], box: ChartBox) {
  const max = Math.max(0, ...series.flatMap((s) => [s.inCents, s.outCents]))
  const step = niceStep(max / TICKS)
  const yMax = step * Math.max(1, Math.ceil(max / step))
  const ticks: number[] = []
  for (let v = 0; v <= yMax + step / 2; v += step) ticks.push(v)
  const plotW = box.width - box.padLeft - box.padRight
  const plotH = box.height - box.padTop - box.padBottom
  const base = box.padTop + plotH
  const y = (v: number) => r1(base - (v / yMax) * plotH)
  const slot = plotW / Math.max(1, series.length)
  const barW = r1(Math.min(18, slot * 0.32))
  const bar = (v: number, x: number) => {
    const h = r1((Math.max(0, v) / yMax) * plotH)
    return { x, y: r1(base - h), w: barW, h }
  }
  const groups = series.map((s, i) => {
    const cx = box.padLeft + slot * i + slot / 2
    return { cx: r1(cx), in: bar(s.inCents, r1(cx - barW - 1)), out: bar(s.outCents, r1(cx + 1)) }
  })
  return { yMax, ticks, y, base, groups }
}
