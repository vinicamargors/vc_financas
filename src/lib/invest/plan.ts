import type { Flow } from './index'

const FALLBACK_DAYS = 90
const CYCLES = 3

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Data-alvo padrão: 31 de janeiro do ano seguinte + 1 (em 2026 → jan/2028). */
export function defaultTargetDate(today: string): string {
  return `${Number(today.slice(0, 4)) + 2}-01-31`
}

/** Meses de calendário até a data-alvo, no mínimo 1. */
export function monthsUntil(today: string, target: string): number {
  const m = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7))
  return Math.max(1, m(target) - m(today))
}

/** Aporte líquido (aportes − resgates) de uma lista de lançamentos, em centavos positivos para aporte. */
function net(flows: Flow[], from: string, to: string): number {
  let s = 0
  for (const f of flows) {
    if (f.date < from || f.date > to) continue
    s += f.kind === 'investment_in' ? Math.abs(f.amountCents) : -Math.abs(f.amountCents)
  }
  return s
}

/**
 * Ritmo atual: média mensal dos aportes líquidos nos últimos 3 ciclos (início = datas de salário reconhecidas).
 * Sem ciclos reconhecidos, usa os últimos 90 dias ÷ 3.
 */
export function averageMonthlyNet(flows: Flow[], cycleStarts: string[], today: string): number {
  const starts = [...cycleStarts].filter((d) => d <= today).sort().slice(-CYCLES)
  if (starts.length === 0) return Math.round(net(flows, shiftDays(today, -FALLBACK_DAYS + 1), today) / CYCLES)
  return Math.round(net(flows, starts[0], today) / starts.length)
}

/** Guardado no ciclo: aportes − resgates entre o início do ciclo e hoje. */
export function cycleSaved(flows: Flow[], cycleStart: string, today: string): number {
  return net(flows, cycleStart, today)
}

/** Salários depois da data do saldo do FGTS (o saldo informado já inclui os anteriores). */
export function salariesSince(salaries: { date: string; amountCents: number }[], balanceDate: string): number[] {
  return salaries.filter((s) => s.date > balanceDate).map((s) => s.amountCents)
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** `YYYY-MM-DD` → "jan/2028". */
export function monthLabel(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]}/${date.slice(0, 4)}`
}

/** Data `months` meses depois (dia limitado ao fim do mês). */
export function addMonths(date: string, months: number): string {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7)) - 1 + months
  const ny = y + Math.floor(m / 12)
  const nm = ((m % 12) + 12) % 12
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  const d = Math.min(Number(date.slice(8, 10)), last)
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
