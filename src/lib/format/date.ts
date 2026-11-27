import { formatInTimeZone } from 'date-fns-tz'

export const TZ = 'America/Sao_Paulo'

/** Data local (`YYYY-MM-DD`) em America/Sao_Paulo para um instante ISO ou Date. */
export function toLocalDate(iso: string | Date): string {
  return formatInTimeZone(iso, TZ, 'yyyy-MM-dd')
}
