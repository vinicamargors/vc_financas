import { formatInTimeZone } from 'date-fns-tz'

export const TZ = 'America/Sao_Paulo'

/** Data local (`YYYY-MM-DD`) em America/Sao_Paulo para um instante ISO ou Date. */
export function toLocalDate(iso: string | Date): string {
  return formatInTimeZone(iso, TZ, 'yyyy-MM-dd')
}

/** "27 nov." para uma data local `YYYY-MM-DD`. */
export function formatDayLabel(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d))
}

/** "HH:mm" em America/Sao_Paulo. */
export function formatTime(iso: string | Date): string {
  return formatInTimeZone(iso, TZ, 'HH:mm')
}

/** "dd/MM" em America/Sao_Paulo. */
export function formatDayMonth(iso: string | Date): string {
  return formatInTimeZone(iso, TZ, 'dd/MM')
}
