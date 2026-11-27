'use client'

import { usePathname } from 'next/navigation'
import { TabBar, type TabId } from './tab-bar'

export function activeTabFor(pathname: string): TabId | null {
  if (pathname === '/') return 'inicio'
  if (pathname === '/extrato' || pathname.startsWith('/extrato/')) return 'extrato'
  return null
}

export function AppTabBar() {
  return <TabBar active={activeTabFor(usePathname())} />
}
