import Link from 'next/link'
import { PeriodPicker } from '@/components/period-picker'
import { PERIOD_KINDS, parsePeriodSel, resolvePeriod } from '@/lib/analysis/period'
import { addDays } from '@/lib/cycle/businessDays'
import { loadAnalysisContext } from '@/lib/queries/analysis'
import { loadStatementPage } from '@/lib/queries/statement'
import { requireUser } from '@/lib/supabase/server'
import { StatementView } from './statement-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Extrato' }

export default async function ExtratoPage({ searchParams }: { searchParams: Promise<{ periodo?: string; ref?: string; de?: string; ate?: string }> }) {
  const user = await requireUser()
  const ctx = await loadAnalysisContext(user.id)
  const period = resolvePeriod(parsePeriodSel(await searchParams, ctx.today, PERIOD_KINDS), ctx.cycleAt)
  const range = { start: period.start, end: period.end }
  const first = await loadStatementPage({ range })

  return (
    <main>
      <div className="title-row">
        <h1 className="title">Extrato</h1>
        <span className="title-actions">
          <Link href={`/extrato/calendario?mes=${period.start.slice(0, 7)}`} className="btn secondary">
            Calendário
          </Link>
          <Link href="/lancar" className="btn secondary">
            Lançar
          </Link>
        </span>
      </div>
      <PeriodPicker basePath="/extrato" period={period} today={ctx.today} kinds={PERIOD_KINDS} />
      {first.groups.length === 0 ? (
        <>
          <p className="empty empty-lead">Nenhuma transação neste período.</p>
          <p className="cat-foot">
            Sem bancos conectados? <Link href="/config/bancos">Conectar</Link>
          </p>
        </>
      ) : (
        <StatementView key={`${range.start}|${range.end}`} initial={first} range={range} today={ctx.today} yesterday={addDays(ctx.today, -1)} />
      )}
    </main>
  )
}
