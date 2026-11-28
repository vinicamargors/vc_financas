import Link from 'next/link'
import { Money } from '@/components/money'
import { toLocalDate } from '@/lib/format/date'
import { loadBenefitWithRecharges } from '@/lib/queries/benefit'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { saveVrAction } from './actions'

export const metadata = { title: 'VR' }
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  nome: 'Dê um nome de até 60 letras.',
  valor: 'Informe o valor mensal da recarga.',
  dia: 'Informe o dia da recarga, de 1 a 31.',
  falha: 'Não foi possível salvar. Tente de novo.',
}

const centsField = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))

export default async function VrPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const user = await requireUser()
  const { erro, salvo } = await searchParams
  const res = await loadBenefitWithRecharges(await createServerSupabase(), user.id, toLocalDate(new Date()))
  const vr = !res.missing ? res.accounts[0] : undefined

  return (
    <main className="flow">
      <h1 className="title">VR</h1>
      <p className="flow-lead">
        O vale-refeição não está no Open Finance, então a conta é sua: o app lança a recarga todo mês e as compras chegam pelo Atalho
        (cartão Alelo, Ticket, VR, Pluxee, Sodexo, Flash, Caju, Swile…) ou pelo botão Lançar. O VR conta no gasto real e fica fora do livre.
      </p>
      {salvo && (
        <p role="status" className="msg ok">
          VR salvo.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {ERRORS[erro] ?? ERRORS.falha}
        </p>
      )}
      {res.missing ? (
        <p role="alert" className="msg err">
          O VR ainda não está disponível: rode a migração <code>20261129000400_benefit_manual.sql</code> no SQL Editor do Supabase.
        </p>
      ) : (
        <>
          {vr && (
            <section className="step">
              <h2>Saldo</h2>
              <p className="big">
                <Money cents={vr.balanceCents} />
              </p>
              <p>Recargas menos compras.</p>
            </section>
          )}
          <section className="step">
            <h2>{vr ? 'Editar' : 'Criar conta VR'}</h2>
            <form action={saveVrAction} className="cm-form">
              <label className="field">
                <small>Nome</small>
                <input name="name" required maxLength={60} defaultValue={vr?.name ?? 'VR'} />
              </label>
              <label className="field">
                <small>Valor mensal (R$)</small>
                <input name="monthly" inputMode="decimal" required defaultValue={centsField(vr?.monthlyCents)} placeholder="800,00" />
              </label>
              <label className="field">
                <small>Dia da recarga</small>
                <input name="day" inputMode="numeric" required defaultValue={vr?.day ?? ''} placeholder="5" />
              </label>
              <button type="submit" className="btn">
                Salvar
              </button>
            </form>
          </section>
        </>
      )}
      <Link href="/config/bancos" className="ghost-link">
        Voltar
      </Link>
    </main>
  )
}
