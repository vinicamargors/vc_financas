import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { HideValuesProvider, HideValuesToggle } from '@/components/hide-values'
import { TabBar } from '@/components/glass/tab-bar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('profiles').select('hide_values').eq('user_id', user.id).maybeSingle()

  return (
    <HideValuesProvider initial={data?.hide_values ?? false}>
      <div className="app-shell">
        <header className="app-header">
          <span className="app-title">VC Finanças</span>
          <HideValuesToggle />
        </header>
        {children}
      </div>
      {/* Aba ativa: por ora só Início; as próximas telas passam a decidir pela rota. */}
      <TabBar active="inicio" />
    </HideValuesProvider>
  )
}
