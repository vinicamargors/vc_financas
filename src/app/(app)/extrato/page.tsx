import Link from 'next/link'
import { subDays } from 'date-fns'
import { Icon } from '@/components/icons'
import { toLocalDate } from '@/lib/format/date'
import { loadStatementPage } from '@/lib/queries/statement'
import { requireUser } from '@/lib/supabase/server'
import { StatementView } from './statement-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Extrato' }

export default async function ExtratoPage() {
  await requireUser()
  const first = await loadStatementPage({})

  if (first.groups.length === 0) {
    return (
      <main>
        <h1 className="title">Extrato</h1>
        <p className="empty empty-lead">Nenhuma transação nos últimos 90 dias.</p>
        <div className="tiles">
          <Link href="/config/bancos" className="tile">
            <span className="n neutral" aria-hidden="true">
              <Icon name="bank" />
            </span>
            <div>
              <span className="t">Conecte seus bancos</span>
              <span className="m">As transações aparecem aqui depois da conexão.</span>
            </div>
            <span className="go">Conectar</span>
          </Link>
        </div>
      </main>
    )
  }

  const now = new Date()
  return (
    <main>
      <div className="title-row">
        <h1 className="title">Extrato</h1>
        <Link href="/lancar" className="btn secondary">
          Lançar
        </Link>
      </div>
      <StatementView initial={first} today={toLocalDate(now)} yesterday={toLocalDate(subDays(now, 1))} />
    </main>
  )
}
