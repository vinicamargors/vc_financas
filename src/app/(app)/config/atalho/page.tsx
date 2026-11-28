import { createAdminSupabase } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/supabase/server'
import { revokeTokenAction } from './actions'
import { TokenBox } from './token-box'

export const metadata = { title: 'Atalho do iPhone' }

export default async function AtalhoPage({ searchParams }: { searchParams: Promise<{ revogado?: string; erro?: string }> }) {
  const user = await requireUser()
  const { revogado, erro } = await searchParams
  // Só a existência da linha; o hash nunca sai do servidor.
  const { data } = await createAdminSupabase().from('shortcut_tokens').select('user_id').eq('user_id', user.id).maybeSingle()
  const hasToken = Boolean(data)
  const endpoint = `${(process.env.APP_URL ?? '').replace(/\/$/, '')}/api/ingest/shortcut`

  return (
    <main className="flow">
      <h1 className="title">Atalho do iPhone</h1>
      <p className="flow-lead">
        Cada compra no Apple Pay entra na hora. Quando a Pluggy trouxer a mesma compra, as duas viram uma só.
      </p>
      <div className="steps" aria-label={`Passo ${hasToken ? 2 : 1} de 3`}>
        <i className="on" />
        <i className={hasToken ? 'on' : undefined} />
        <i className={hasToken ? 'on' : undefined} />
      </div>

      <section className="step">
        <p className="step-k">Passo 1 de 3</p>
        <h2>Token</h2>
        <p>O token liga o atalho à sua conta. Guarde como uma senha.</p>
        {revogado && (
          <p role="status" className="msg ok">
            Token revogado.
          </p>
        )}
        {erro && (
          <p role="alert" className="msg err">
            Não foi possível revogar. Tente de novo.
          </p>
        )}
        <TokenBox hasToken={hasToken} />
      </section>

      <section className="step">
        <p className="step-k">Passo 2 de 3</p>
        <h2>Automação no app Atalhos</h2>
        <p>
          Abra <b>Atalhos</b> › <b>Automação</b> › <b>Nova automação</b> › <b>Transação</b> (Carteira). Escolha os
          cartões, marque <b>Executar imediatamente</b> e avance.
        </p>
        <p>
          Adicione a ação <b>Obter conteúdo do URL</b> com:
        </p>
        <label className="field">
          <small>URL</small>
          <input readOnly value={endpoint} spellCheck={false} />
        </label>
        <p>
          Método <b>POST</b>. Em Cabeçalhos, adicione <b>Authorization</b> com o valor <b>Bearer seu-token</b> (a
          palavra Bearer, um espaço e o token do passo 1). Corpo da solicitação <b>JSON</b> com três campos de texto:
        </p>
        <ul>
          <li>
            <b>amount</b>: variável <b>Valor</b>
          </li>
          <li>
            <b>merchant</b>: variável <b>Comerciante</b>
          </li>
          <li>
            <b>card</b>: variável <b>Cartão</b>
          </li>
        </ul>
      </section>

      <section className="step">
        <p className="step-k">Passo 3 de 3</p>
        <h2>Testar</h2>
        <p>
          Faça uma compra com o iPhone. Ela aparece no extrato na hora, no cartão com o mesmo nome (ou na conta
          Atalho). Limite de 60 lançamentos por hora.
        </p>
      </section>

      {hasToken && (
        <section className="step">
          <h2>Revogar</h2>
          <p>O atalho para de funcionar até você gerar outro token.</p>
          <form action={revokeTokenAction}>
            <button type="submit" className="btn secondary">
              Revogar token
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
