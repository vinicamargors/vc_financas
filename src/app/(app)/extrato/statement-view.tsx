'use client'

import { BankMark } from '@/components/bank-mark'
import { useMemo, useState } from 'react'
import { Money } from '@/components/money'
import { formatDayLabel } from '@/lib/format/date'
import type { DayGroup, StatementTx } from '@/lib/queries/statement'
import { FILTERS, filterDays, initials, type Filter } from './statement-filter'

function dayLabel(date: string, today: string, yesterday: string): string {
  if (date === today) return 'Hoje'
  if (date === yesterday) return 'Ontem'
  return formatDayLabel(date).replace(' de ', ' ').replace(/\.$/, '')
}

export function StatementView({ days, today, yesterday }: { days: DayGroup<StatementTx>[]; today: string; yesterday: string }) {
  const [filter, setFilter] = useState<Filter>('tudo')
  const shown = useMemo(() => filterDays(days, filter), [days, filter])

  return (
    <>
      <div className="chips" role="group" aria-label="Filtrar transações">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="empty">Nada por aqui neste filtro.</p>}

      {shown.map((day) => {
        const label = dayLabel(day.date, today, yesterday)
        return (
          <section key={day.date} aria-label={label}>
            <h2 className="day">
              <span>{label}</span>
              <Money cents={day.totalCents} sign />
            </h2>
            <ul className="tx-list">
              {day.items.map((t) => (
                <li key={t.id} className="tx">
                  <span className="ic" aria-hidden="true">
                    {initials(t.description)}
                  </span>
                  <span className="nm">
                    <b>
                      {t.description}
                      {t.installmentNumber && t.installmentTotal ? (
                        <span className="tag">{`${t.installmentNumber}/${t.installmentTotal}`}</span>
                      ) : null}
                    </b>
                    <span>
                      {t.accountLabel ? <BankMark institution={t.accountLabel} logoUrl={t.logoUrl} /> : null}
                      {[t.accountLabel, t.cardLast4 ? `cartão •••• ${t.cardLast4}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Money cents={t.amountCents} sign className={`am${t.amountCents > 0 ? ' in' : ''}`} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}
