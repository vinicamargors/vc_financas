import type { ElementType, ComponentPropsWithoutRef } from 'react'

type Props<T extends ElementType> = { as?: T; className?: string } & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className'>

export function GlassCard<T extends ElementType = 'div'>({ as, className, ...rest }: Props<T>) {
  const Tag: ElementType = as ?? 'div'
  return <Tag className={`glass ${className ?? ''}`} {...rest} />
}
