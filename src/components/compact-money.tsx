'use client'

import { formatCompactBRL } from '@/lib/format/money'
import { useHideValues } from './hide-values'

/** Valor curto ("1,2 mil") para espaços apertados; respeita o "ocultar valores". */
export function CompactMoney({ cents, className }: { cents: number; className?: string }) {
  const { hidden } = useHideValues()
  return <span className={`money ${className ?? ''}`}>{formatCompactBRL(cents, { hidden })}</span>
}
