'use client'

import { formatBRL } from '@/lib/format/money'
import { useHideValues } from './hide-values'

export function Money({ cents, sign, className }: { cents: number | bigint; sign?: boolean; className?: string }) {
  const { hidden } = useHideValues()
  return <span className={`money ${className ?? ''}`}>{formatBRL(cents, { hidden, sign })}</span>
}
