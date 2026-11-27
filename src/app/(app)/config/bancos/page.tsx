import { createAdminSupabase } from '@/lib/supabase/admin'
import { GlassCard } from '@/components/glass/glass-card'
import { requireUser } from '@/lib/supabase/server'
import { saveCredentialsAction } from './actions'
import { ConnectWidget } from './connect-widget'

const ERROR_MESSAGES: Record<string, string> = {
  credenciais: 'Client ID ou Secret incorretos. Confira no dashboard da Pluggy.',
  'app-url': 'APP_URL não configurada.',
  falha: 'Não foi possível concluir a configuração. Tente de novo.',
}

export const metadata = { title: 'Conectar bancos' }

export default async function BancosPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const user = await requireUser()
  const { erro, salvo } = await searchParams
  // Só a existência da linha; o segredo nunca sai do servidor.
  const { data } = await createAdminSupabase()
    .from('pluggy_credentials')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const hasCredentials = Boolean(data)

  return (
    <main className="flex flex-col gap-4">
      <h1>Conectar bancos</h1>

      <GlassCard as="section" className="p-5">
        <h2>1. Meu Pluggy e seus bancos</h2>
        <p>
          Crie sua conta no <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">Meu Pluggy</a> e conecte
          os bancos e cartões que quiser acompanhar.
        </p>
      </GlassCard>

      <GlassCard as="section" className="p-5">
        <h2>2. Credenciais da Pluggy</h2>
        <p>
          No <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">dashboard da Pluggy</a>, crie uma
          aplicação e cole o Client ID e o Client Secret abaixo.
        </p>
        {salvo && <p role="status">Credenciais salvas.</p>}
        {erro && <p role="alert">{ERROR_MESSAGES[erro] ?? ERROR_MESSAGES.falha}</p>}
        <form action={saveCredentialsAction}>
          <label>
            Client ID
            <input name="clientId" required autoComplete="off" />
          </label>
          <label>
            Client Secret
            <input name="clientSecret" type="password" required autoComplete="off" />
          </label>
          <button type="submit">Testar e salvar</button>
        </form>
      </GlassCard>

      <GlassCard as="section" className="p-5">
        <h2>3. Entrar com o Meu Pluggy</h2>
        {hasCredentials ? <ConnectWidget /> : <p>Salve as credenciais no passo 2 para continuar.</p>}
      </GlassCard>
    </main>
  )
}
