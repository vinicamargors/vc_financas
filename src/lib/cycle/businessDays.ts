// Calendário de dias úteis brasileiro (feriados nacionais), datas como 'YYYY-MM-DD' no fuso de São Paulo.

export type DateRule = 'penultimate_business_day' | 'last_business_day' | 'fifth_business_day' | 'fixed_day'

const pad = (n: number) => String(n).padStart(2, '0')

export function ymd(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function parseYmd(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseYmd(date)
  return ymd(y, m, d + days)
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parseYmd(from)
  const [y2, m2, d2] = parseYmd(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(year, month, day)
}

const FIXED = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']

const cache = new Map<number, readonly string[]>()

/** Feriados nacionais do ano, em ordem. Carnaval (seg e ter), Sexta-feira Santa e Corpus Christi vêm da Páscoa. */
export function nationalHolidays(year: number): readonly string[] {
  const hit = cache.get(year)
  if (hit) return hit
  const e = easter(year)
  const list = [
    ...FIXED.map((md) => `${year}-${md}`),
    addDays(e, -48), addDays(e, -47), addDays(e, -2), addDays(e, 60),
  ].sort()
  Object.freeze(list)
  cache.set(year, list)
  return list
}

export function isBusinessDay(date: string): boolean {
  const [y, m, d] = parseYmd(date)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !nationalHolidays(y).includes(date)
}

/** Dia útil anterior ou igual a `date`. */
function businessDayOnOrBefore(date: string): string {
  let cur = date
  while (!isBusinessDay(cur)) cur = addDays(cur, -1)
  return cur
}

/** Data prevista do salário no mês (1–12). `fixed_day` cai para o dia útil anterior. */
export function expectedPayday(year: number, month: number, rule: DateRule, fixedDay?: number | null): string {
  const last = lastDayOfMonth(year, month)
  switch (rule) {
    case 'last_business_day':
      return businessDayOnOrBefore(ymd(year, month, last))
    case 'penultimate_business_day':
      return businessDayOnOrBefore(addDays(businessDayOnOrBefore(ymd(year, month, last)), -1))
    case 'fifth_business_day': {
      let cur = ymd(year, month, 1)
      let count = isBusinessDay(cur) ? 1 : 0
      while (count < 5) {
        cur = addDays(cur, 1)
        if (isBusinessDay(cur)) count++
      }
      return cur
    }
    case 'fixed_day': {
      if (!fixedDay || fixedDay < 1 || fixedDay > 31) throw new Error('fixed_day exige fixedDay entre 1 e 31')
      return businessDayOnOrBefore(ymd(year, month, Math.min(fixedDay, last)))
    }
  }
}
