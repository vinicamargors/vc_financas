'use client'

import { formatTime } from '@/lib/format/date'
import { BankMark } from '@/components/bank-mark'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Money } from '@/components/money'
import { formatDayLabel } from '@/lib/format/date'
import type { StatementPage } from '@/lib/queries/statement'
import { mergeGroups } from '@/lib/queries/statement-page'
import { FILTERS, initials, rowDisplay, type Filter } from './statement-filter'
import { loadMoreStatement } from './actions'

function dayLabel(date: string, today: string, yesterday: string): string {
  if (date === today) return 'Hoje'
  if (date === yesterday) return 'Ontem'
  return formatDayLabel(date).replace(' de ', ' ').replace(/\.$/, '')
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <ul className="tx-list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="tx">
          <span className="ic sk" />
          <span className="nm">
            <b className="sk sk-line" style={{ width: '55%' }} />
            <span className="sk sk-line" style={{ width: '35%' }} />
          </span>
          <span className="am sk sk-line" style={{ width: '4.5rem' }} />
        </li>
      ))}
    </ul>
  )
}

export function StatementView({ initial, today, yesterday }: { initial: StatementPage; today: string; yesterday: string }) {
  const [filter, setFilter] = useState<Filter>('tudo')
  const [groups, setGroups] = useState(initial.groups)
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  // Invalida respostas de requisições antigas (troca de filtro no meio do carregamento).
  const epoch = useRef(0)
  const busy = useRef(false)

  const loadMore = useCallback(async () => {
    if (busy.current || !cursor) return
    busy.current = true
    const mine = epoch.current
    setLoading(true)
    setError(false)
    try {
      const page = await loadMoreStatement(cursor, filter)
      if (mine !== epoch.current) return
      setGroups((g) => mergeGroups(g, page.groups))
      setCursor(page.nextCursor)
    } catch {
      if (mine === epoch.current) setError(true)
    } finally {
      if (mine === epoch.current) setLoading(false)
      busy.current = false
    }
  }, [cursor, filter])

  async function changeFilter(next: Filter, force = false) {
    if (next === filter && !force) return
    const mine = ++epoch.current
    busy.current = false
    setFilter(next)
    setGroups([])
    setCursor(null)
    setError(false)
    setLoading(true)
    try {
      const page = await loadMoreStatement(null, next)
      if (mine !== epoch.current) return
      setGroups(page.groups)
      setCursor(page.nextCursor)
    } catch {
      if (mine === epoch.current) setError(true)
    } finally {
      if (mine === epoch.current) setLoading(false)
    }
  }

  useEffect(() => {
    const el = sentinel.current
    if (!el || !cursor || error) return
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, error, loadMore])

  const shown = groups

  return (
    <>
      <div className="chips" role="group" aria-label="Filtrar transações">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => void changeFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 && !loading && !error && <p className="empty">Nada por aqui neste filtro.</p>}

      {shown.map((day) => {
        const label = dayLabel(day.date, today, yesterday)
        return (
          <section key={day.date} aria-label={label}>
            <h2 className="day">
              <span>{label}</span>
              <Money cents={day.totalCents} sign />
            </h2>
            <ul className="tx-list">
              {day.items.map((t) => [t, rowDisplay(t)] as const).map(([t, d]) => (
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
                      {t.kind === 'pending_review' ? <span className="tag warn">a confirmar</span> : null}
                      {t.missingFromBank ? <span className="tag warn">não apareceu no banco</span> : null}
                    </b>
                    <span>
                      {t.accountLabel ? <BankMark institution={t.accountLabel} logoUrl={t.logoUrl} /> : null}
                      {[d.label, t.accountLabel, t.cardLast4 ? `cartão •••• ${t.cardLast4}` : null, t.occurredAt ? formatTime(t.occurredAt) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Money cents={t.amountCents} sign className={`am${d.neutral ? ' neu' : t.amountCents > 0 ? ' in' : ''}`} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {loading && <SkeletonRows />}
      {error && (
        <p className="empty" role="alert">
          Não foi possível carregar.{' '}
          <button type="button" className="chip" onClick={() => void (groups.length ? loadMore() : changeFilter(filter, true))}>
            Tentar de novo
          </button>
        </p>
      )}
      {cursor && !error && <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />}
    </>
  )
}

