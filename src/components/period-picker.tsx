import Link from 'next/link'
import { PERIOD_LABEL, periodQuery, shiftPeriod, type Period, type PeriodKind, type PeriodSel } from '@/lib/analysis/period'

/** Seletor de período por links (funciona sem JS): tipos, anterior/próximo e, no personalizado, datas. */
export function PeriodPicker({
  basePath,
  period,
  today,
  kinds,
  extra = {},
}: {
  basePath: string
  period: Period
  today: string
  kinds: readonly PeriodKind[]
  /** Parâmetros que continuam na URL ao trocar de período. */
  extra?: Record<string, string>
}) {
  const href = (sel: PeriodSel) => {
    const q = new URLSearchParams(periodQuery(sel, today))
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
    return `${basePath}?${q.toString()}`
  }
  const prev = shiftPeriod(period, -1, today)
  const next = shiftPeriod(period, 1, today)
  return (
    <div className="period">
      <nav className="chips" aria-label="Período">
        {kinds.map((k) => (
          <Link
            key={k}
            className="chip"
            aria-current={period.kind === k ? 'true' : undefined}
            href={href(k === 'livre' ? { kind: 'livre', ref: period.end, from: period.start, to: period.end < today ? period.end : today } : { kind: k, ref: today })}
          >
            {PERIOD_LABEL[k]}
          </Link>
        ))}
      </nav>
      {period.kind === 'livre' ? (
        <form className="period-range" method="get" action={basePath}>
          <input type="hidden" name="periodo" value="livre" />
          {Object.entries(extra).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label>
            <span className="sr-only">De</span>
            <input type="date" name="de" defaultValue={period.start} max={today} required />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="sr-only">Até</span>
            <input type="date" name="ate" defaultValue={period.end} max={today} required />
          </label>
          <button type="submit" className="chip">
            Ver
          </button>
        </form>
      ) : (
        <div className="period-nav">
          {prev ? (
            <Link href={href(prev)} className="period-step" aria-label="Período anterior">
              ‹
            </Link>
          ) : (
            <span className="period-step" aria-hidden="true" />
          )}
          <span className="period-label">{period.label}</span>
          {next ? (
            <Link href={href(next)} className="period-step" aria-label="Próximo período">
              ›
            </Link>
          ) : (
            <span className="period-step" aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  )
}
