import Link from 'next/link'

export type TabId = 'inicio' | 'extrato' | 'categorias' | 'caixinhas'

const TABS: { id: TabId; label: string; href?: string; icon: string }[] = [
  { id: 'inicio', label: 'Início', href: '/', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { id: 'extrato', label: 'Extrato', href: '/extrato', icon: 'M5 4h14M5 9h14M5 14h14M5 19h9' },
  // Habilitadas nos planos 4 (categorias) e 5 (caixinhas).
  { id: 'categorias', label: 'Categorias', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'caixinhas', label: 'Caixinhas', icon: 'M4 8h16v12H4zM8 8V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3' },
]

export function TabBar({ active }: { active: TabId }) {
  return (
    <nav aria-label="Navegação principal" className="tab-bar glass">
      {TABS.map((t) => {
        const content = (
          <>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
            {!t.href && <small>em breve</small>}
          </>
        )
        if (!t.href) {
          return (
            <span key={t.id} className="tab" aria-disabled="true">
              {content}
            </span>
          )
        }
        return (
          <Link key={t.id} href={t.href} className="tab" aria-current={t.id === active ? 'page' : undefined}>
            {content}
          </Link>
        )
      })}
    </nav>
  )
}
