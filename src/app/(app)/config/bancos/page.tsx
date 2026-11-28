import { formatDayLabel, formatTime, toLocalDate } from '@/lib/format/date'
import Link from 'next/link'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/server'
import { saveCredentialsAction, syncNowAction } from './actions'
import { RemoveConnection } from './remove-connection'
import { ConnectWidget } from './connect-widget'
import { SyncButton } from './sync-button'

const ERROR_MESSAGES: Record<string, string> = {
  credenciais: 'Client ID ou Secret incorretos. Confira no dashboard da Pluggy.',
  'app-url': 'APP_URL não configurada.',
  chave: 'CREDENTIALS_KEY inválida na Vercel. Gere com: openssl rand -base64 32',
  banco: 'Não foi possível salvar no Supabase. Confira SUPABASE_SERVICE_ROLE_KEY na Vercel.',
  falha: 'Não foi possível concluir a configuração. Tente de novo.',
}

const STATUS_LABEL: Record<string, string> = {
  UPDATED: 'Atualizada',
  UPDATING: 'Atualizando',
  LOGIN_ERROR: 'Erro de login',
  OUTDATED: 'Desatualizada',
  WAITING_USER_INPUT: 'Aguardando você',
}

export const metadata = { title: 'Conectar bancos' }
export const maxDuration = 60

export default async function BancosPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string; sync?: string }> }) {
  const user = await requireUser()
  const { erro, salvo, sync } = await searchParams
  // Só a existência da linha; o segredo nunca sai do servidor.
  const { data } = await createAdminSupabase()
    .from('pluggy_credentials')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const hasCredentials = Boolean(data)
  const { data: conns } = await createAdminSupabase()
    .from('connections')
    .select('id, connector_name, status, bank_data_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
  const list = conns ?? []
  const bankDataAt =
    list
      .map((c) => c.bank_data_at as string | null)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? null

  return (
    <main className="flow">
      <h1 className="title">Conectar bancos</h1>
      <p className="flow-lead">Três passos. Seus dados ficam entre você, a Pluggy e este app.</p>
      <div className="steps" aria-label={`Passo ${hasCredentials ? 3 : 2} de 3`}>
        <i className="on" />
        <i className="on" />
        <i className={hasCredentials ? 'on' : undefined} />
      </div>

      <section className="step">
        <p className="step-k">Passo 1 de 3</p>
        <h2>Meu Pluggy e seus bancos</h2>
        <p>
          Crie sua conta no <a href="https://meu.pluggy.ai" target="_blank" rel="noreferrer">Meu Pluggy</a> e conecte
          os bancos e cartões que quiser acompanhar.
        </p>
      </section>

      <section className="step">
        <p className="step-k">Passo 2 de 3</p>
        <h2>Chave da Pluggy</h2>
        <p>
          No <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">dashboard da Pluggy</a>, crie uma
          aplicação e cole o Client ID e o Client Secret abaixo.
        </p>
        {salvo && (
          <p role="status" className="msg ok">
            Credenciais salvas.
          </p>
        )}
        {erro && (
          <p role="alert" className="msg err">
            {ERROR_MESSAGES[erro] ?? ERROR_MESSAGES.falha}
          </p>
        )}
        <form action={saveCredentialsAction}>
          <label className="field">
            <small>Client ID</small>
            <input name="clientId" required autoComplete="off" spellCheck={false} />
          </label>
          <label className="field">
            <small>Client Secret</small>
            <input name="clientSecret" type="password" required autoComplete="off" />
          </label>
          <button type="submit" className="btn">
            Testar e salvar
          </button>
        </form>
      </section>

      <section className="step">
        <p className="step-k">Passo 3 de 3</p>
        <h2>Entrar com o Meu Pluggy</h2>
        {hasCredentials ? <ConnectWidget /> : <p>Salve as credenciais no passo 2 para continuar.</p>}
      </section>

      {hasCredentials && (
        <section className="step">
          <h2>Sincronizar agora</h2>
          <p>Busca saldos e transações de todos os bancos conectados sem esperar a sincronização das 6h.</p>
          {sync === 'ok' && (
            <p role="status" className="msg ok">
              Sincronizado.
              {bankDataAt && (
                <>
                  {' '}
                  Os dados mais recentes que a Pluggy trouxe do banco são de {formatDayLabel(toLocalDate(bankDataAt))}, {formatTime(bankDataAt)}. O Meu Pluggy
                  busca no banco uma vez por dia.
                </>
              )}
            </p>
          )}
          {sync === 'erro' && (
            <p role="alert" className="msg err">
              Algum banco não sincronizou. Veja o aviso no Início.
            </p>
          )}
          <form action={syncNowAction}>
            <SyncButton />
          </form>
        </section>
      )}

      {list.length > 0 && (
        <section className="step">
          <h2>Conexões</h2>
          <ul className="conn-list">
            {list.map((c) => (
              <li key={c.id as string} className="conn-row">
                <div>
                  <strong>{c.connector_name as string}</strong>
                  <small>
                    {STATUS_LABEL[c.status as string] ?? 'Status desconhecido'}
                    {c.bank_data_at ? ` · dados do banco de ${formatDayLabel(toLocalDate(c.bank_data_at as string))}` : ''}
                  </small>
                </div>
                <RemoveConnection connectionId={c.id as string} name={c.connector_name as string} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="step">
        <h2>Atalho do iPhone</h2>
        <p>Compras no Apple Pay entram na hora, antes da Pluggy.</p>
        <Link href="/config/atalho" className="btn secondary">
          Configurar atalho
        </Link>
      </section>
    </main>
  )
}
