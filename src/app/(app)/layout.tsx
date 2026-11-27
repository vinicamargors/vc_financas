import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { HideValuesProvider, HideValuesToggle } from '@/components/hide-values'
import { AppTabBar } from '@/components/glass/app-tab-bar'

function initialOf(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email
  return (source.match(/\p{L}|\p{N}/u)?.[0] ?? '·').toUpperCase()
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('profiles')
    .select('hide_values, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <HideValuesProvider initial={data?.hide_values ?? false}>
      <div className="app-shell">
        <header className="topbar">
          <span className="avatar" aria-hidden="true">
            {initialOf(data?.display_name, user.email)}
          </span>
          <div className="topbar-icons">
            <HideValuesToggle />
          </div>
        </header>
        {children}
      </div>
      <AppTabBar />
    </HideValuesProvider>
  )
}
