'use client'

import { formatBRL } from '@/lib/format/money'
import { useHideValues } from './hide-values'

type Props = {
  cents: number | bigint
  sign?: boolean
  className?: string
  /** `small`: "R$" menor e apagado (saldo grande); `none`: sem "R$". */
  currency?: 'inline' | 'small' | 'none'
}

export function Money({ cents, sign, className, currency = 'inline' }: Props) {
  const { hidden } = useHideValues()
  const text = formatBRL(cents, { hidden, sign })
  const cls = `money ${className ?? ''}`
  const m = currency !== 'inline' ? /^(-?)R\$ (.*)$/.exec(text) : null
  if (!m) return <span className={cls}>{text}</span>
  const [, neg, rest] = m
  if (currency === 'none') return <span className={cls}>{`${neg ? '−' : ''}${rest}`}</span>
  return (
    <span className={cls}>
      {neg && '−'}
      <small>R$</small>
      {rest}
    </span>
  )
}
