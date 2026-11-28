import { Money } from '@/components/money'
import { formatLocalDayMonth as dm } from '@/lib/format/date'
import type { ExtraIncome } from '@/lib/queries/cycle'
import { FreeToggle } from './free-toggle'

/** Renda extra reconhecida do ciclo (PLR, 13º, férias, bônus): fora do livre até o dono somar. */
export function ExtraIncomeSection({ items, canToggle }: { items: ExtraIncome[]; canToggle: boolean }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="extra-titulo">
      <h2 id="extra-titulo" className="label pay-hd">
        Renda extra do ciclo (fora do livre)
      </h2>
      <ul className="pay-list">
        {items.map((e) => (
          <li key={e.id} className="extra-row">
            <span className="pay-name">
              {e.label}
              <small>
                {dm(e.date)} · {e.freeCounted ? 'somada ao livre' : 'fora do livre'}
              </small>
            </span>
            <Money cents={e.amountCents} className="pay-val" />
            {canToggle && <FreeToggle txId={e.id} counted={e.freeCounted} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
