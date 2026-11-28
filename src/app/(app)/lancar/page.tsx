import Link from 'next/link'
import { formatInTimeZone } from 'date-fns-tz'
import { TZ } from '@/lib/format/date'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { saveManualAction } from './actions'

export const metadata = { title: 'Lançar' }
export const dynamic = 'force-dynamic'

const ERRORS: Record<string, string> = {
  tipo: 'Escolha gasto ou entrada.',
  conta: 'Escolha uma das suas contas.',
  valor: 'Informe um valor maior que zero.',
  descricao: 'Descreva em até 120 letras.',
  categoria: 'Escolha uma categoria válida.',
  data: 'Informe data e hora válidas, até hoje.',
  falha: 'Não foi possível salvar. Tente de novo.',
}

const TYPE_LABEL: Record<string, string> = { BANK: 'Conta', CREDIT: 'Cartão', BENEFIT: 'VR' }

export default async function LancarPage({ searchParams }: { searchParams: Promise<{ erro?: string; salvo?: string }> }) {
  const user = await requireUser()
  const { erro, salvo } = await searchParams
  const db = await createServerSupabase()
  const [accounts, categories] = await Promise.all([
    db.from('accounts').select('id, name, institution, type').eq('user_id', user.id).in('type', ['BANK', 'CREDIT', 'BENEFIT']).order('type').order('name'),
    db.from('categories').select('id, name').eq('user_id', user.id).order('name'),
  ])
  if (accounts.error || categories.error) throw new Error('Falha ao carregar contas')
  const now = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd'T'HH:mm")

  return (
    <main className="flow">
      <h1 className="title">Lançar</h1>
      <p className="flow-lead">
        Registre agora e o app confere quando o banco mandar: se for o mesmo lançamento, fica a sua classificação; se houver dúvida, ele
        pergunta em Revisar.
      </p>
      {salvo && (
        <p role="status" className="msg ok">
          Lançado. <Link href="/extrato">Ver no extrato</Link>
        </p>
      )}
      {erro && (
        <p role="alert" className="msg err">
          {ERRORS[erro] ?? ERRORS.falha}
        </p>
      )}
      {(accounts.data ?? []).length === 0 ? (
        <p>
          Nenhuma conta ainda. <Link href="/config/bancos">Conecte um banco</Link> ou <Link href="/config/vr">crie o VR</Link>.
        </p>
      ) : (
        <form action={saveManualAction} className="cm-form">
          <fieldset className="field">
            <small>Tipo</small>
            <label className="check-row">
              <input type="radio" name="kind" value="expense" defaultChecked /> Gasto
            </label>
            <label className="check-row">
              <input type="radio" name="kind" value="income" /> Entrada
            </label>
          </fieldset>
          <label className="field">
            <small>Conta</small>
            <select name="account" required>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {`${TYPE_LABEL[a.type as string] ?? ''} · ${a.institution ?? a.name}${a.institution && a.name !== a.institution ? ` (${a.name})` : ''}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <small>Valor (R$)</small>
            <input name="amount" inputMode="decimal" required placeholder="45,90" />
          </label>
          <label className="field">
            <small>Descrição</small>
            <input name="description" required maxLength={120} placeholder="Padaria" />
          </label>
          <label className="field">
            <small>Categoria</small>
            <select name="category" defaultValue="">
              <option value="">Sem categoria</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <small>Data e hora</small>
            <input name="at" type="datetime-local" defaultValue={now} max={now.slice(0, 10) + 'T23:59'} />
          </label>
          <button type="submit" className="btn">
            Lançar
          </button>
        </form>
      )}
    </main>
  )
}
