import Link from 'next/link'
import { Icon, type IconName } from '@/components/icons'

export type TabId = 'inicio' | 'extrato' | 'gastos' | 'caixinhas'

const TABS: { id: TabId; label: string; href?: string; icon: IconName }[] = [
  { id: 'inicio', label: 'Início', href: '/', icon: 'home' },
  { id: 'extrato', label: 'Extrato', href: '/extrato', icon: 'list' },
  // Ainda não existem: aparecem desabilitadas ("em breve").
  { id: 'gastos', label: 'Gastos', icon: 'pie' },
  { id: 'caixinhas', label: 'Caixinhas', icon: 'jar' },
]

export function TabBar({ active }: { active: TabId | null }) {
  return (
    <nav aria-label="Navegação principal" className="tabbar">
      {TABS.map((t) => {
        const content = (
          <>
            <span className="tab-icon">
              <Icon name={t.icon} />
            </span>
            <span>{t.label}</span>
          </>
        )
        if (!t.href) {
          return (
            <span key={t.id} className="tab" aria-disabled="true" title="Em breve">
              {content}
              <span className="sr-only">(em breve)</span>
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
