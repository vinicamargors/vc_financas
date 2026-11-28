import { addDays, daysBetween, lastDayOfMonth, parseYmd, ymd } from '@/lib/cycle/businessDays'
import { formatLocalDayMonth } from '@/lib/format/date'

export type PeriodKind = 'dia' | 'semana' | 'ciclo' | 'mes' | 'ano' | 'livre'
export const PERIOD_KINDS: readonly PeriodKind[] = ['dia', 'semana', 'ciclo', 'mes', 'ano', 'livre']
export const PERIOD_LABEL: Record<PeriodKind, string> = {
  dia: 'Dia',
  semana: 'Semana',
  ciclo: 'Ciclo',
  mes: 'Mês',
  ano: 'Ano',
  livre: 'Personalizado',
}

/** Período escolhido na URL: o tipo e uma data dentro dele (ou o intervalo, no personalizado). */
export type PeriodSel = { kind: PeriodKind; ref: string; from?: string; to?: string }
export type Period = { kind: PeriodKind; ref: string; start: string; end: string; label: string }
export type Range = { start: string; end: string }
/** Ciclo (de salário a salário) que contém a data. */
export type CycleAt = (date: string) => Range

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_SPAN_DAYS = 5 * 366

/** `YYYY-MM-DD` que existe no calendário. */
export function isLocalDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false
  const [y, m, d] = parseYmd(v)
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDayOfMonth(y, m)
}

/** Lê `periodo`, `ref`, `de` e `ate` (vêm da URL, nunca confiáveis). Qualquer coisa inválida cai no ciclo de hoje. */
export function parsePeriodSel(
  params: { periodo?: string; ref?: string; de?: string; ate?: string },
  today: string,
  allowed: readonly PeriodKind[] = PERIOD_KINDS,
): PeriodSel {
  const fallback: PeriodSel = { kind: 'ciclo', ref: today }
  const kind = params.periodo as PeriodKind
  if (!allowed.includes(kind)) return fallback
  if (kind === 'livre') {
    const { de, ate } = params
    if (!isLocalDate(de) || !isLocalDate(ate) || de > ate || daysBetween(de, ate) > MAX_SPAN_DAYS) return fallback
    return { kind, ref: ate, from: de, to: ate }
  }
  const ref = isLocalDate(params.ref) && params.ref <= today ? params.ref : today
  return { kind, ref }
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function mondayOf(date: string): string {
  const [y, m, d] = parseYmd(date)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(date, -((dow + 6) % 7))
}

const span = (a: string, b: string) => `${formatLocalDayMonth(a)} – ${formatLocalDayMonth(b)}`

export function resolvePeriod(sel: PeriodSel, cycleAt: CycleAt): Period {
  const [y, m] = parseYmd(sel.ref)
  const base = { kind: sel.kind, ref: sel.ref }
  switch (sel.kind) {
    case 'dia':
      return { ...base, start: sel.ref, end: sel.ref, label: formatLocalDayMonth(sel.ref) }
    case 'semana': {
      const start = mondayOf(sel.ref)
      const end = addDays(start, 6)
      return { ...base, start, end, label: span(start, end) }
    }
    case 'mes':
      return { ...base, start: ymd(y, m, 1), end: ymd(y, m, lastDayOfMonth(y, m)), label: `${MONTHS[m - 1]} de ${y}` }
    case 'ano':
      return { ...base, start: ymd(y, 1, 1), end: ymd(y, 12, 31), label: String(y) }
    case 'livre': {
      const start = sel.from ?? sel.ref
      const end = sel.to ?? sel.ref
      return { ...base, start, end, label: span(start, end) }
    }
    default: {
      const c = cycleAt(sel.ref)
      return { ...base, kind: 'ciclo', start: c.start, end: c.end, label: span(c.start, c.end) }
    }
  }
}

/** Duração do período, em dias (inclusivo). */
export function periodDays(p: Range): number {
  return daysBetween(p.start, p.end) + 1
}

/** Início do período anterior equivalente (o fim é a véspera do início atual). */
function previousStart(p: Period, cycleAt: CycleAt): string {
  const [y, m] = parseYmd(p.start)
  switch (p.kind) {
    case 'dia':
      return addDays(p.start, -1)
    case 'semana':
      return addDays(p.start, -7)
    case 'mes':
      return m === 1 ? ymd(y - 1, 12, 1) : ymd(y, m - 1, 1)
    case 'ano':
      return ymd(y - 1, 1, 1)
    case 'ciclo':
      return cycleAt(addDays(p.start, -1)).start
    default:
      return addDays(p.start, -periodDays(p))
  }
}

/**
 * Janela atual (até hoje) e a do período anterior equivalente com o mesmo número de dias,
 * sem passar do fim dele.
 */
export function comparison(p: Period, today: string, cycleAt: CycleAt): { days: number; current: Range; previous: Range } {
  const curEnd = p.end < today ? p.end : today
  const days = Math.max(1, daysBetween(p.start, curEnd) + 1)
  const prevStart = previousStart(p, cycleAt)
  const prevLast = addDays(p.start, -1)
  const want = addDays(prevStart, days - 1)
  return { days, current: { start: p.start, end: curEnd }, previous: { start: prevStart, end: want < prevLast ? want : prevLast } }
}

/** Período anterior (-1) ou seguinte (+1); null quando o seguinte começaria depois de hoje. */
export function shiftPeriod(p: Period, dir: -1 | 1, today: string): PeriodSel | null {
  if (p.kind === 'livre') {
    const len = periodDays(p)
    const from = addDays(p.start, dir * len)
    const to = addDays(p.end, dir * len)
    if (from > today) return null
    return { kind: 'livre', ref: to, from, to }
  }
  const ref = dir < 0 ? addDays(p.start, -1) : addDays(p.end, 1)
  if (ref > today) return null
  return { kind: p.kind, ref }
}

/** Query string do período (sem `?`). A referência de hoje fica implícita. */
export function periodQuery(sel: PeriodSel, today: string): string {
  const q = new URLSearchParams({ periodo: sel.kind })
  if (sel.kind === 'livre') {
    q.set('de', sel.from ?? sel.ref)
    q.set('ate', sel.to ?? sel.ref)
  } else if (sel.ref !== today) q.set('ref', sel.ref)
  return q.toString()
}

/** Limite mensal ajustado à duração: períodos de 28 a 31 dias usam o limite inteiro; os outros, proporcional. */
export function limitForPeriod(monthlyCents: number | null, days: number): number | null {
  if (monthlyCents == null) return null
  if (days >= 28 && days <= 31) return monthlyCents
  return Math.round((monthlyCents * days * 12) / 365.25)
}
