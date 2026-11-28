'use client'

import { buildBars, type WeekInOut } from '@/lib/analysis/calendar'
import { formatBRL, formatCompactBRL } from '@/lib/format/money'
import { formatLocalDayMonth } from '@/lib/format/date'
import { useHideValues } from './hide-values'

const W = 340
const H = 180
const BOX = { width: W, height: H, padTop: 10, padBottom: 22, padLeft: 44, padRight: 8 }


/** Barras de entradas (verde) e saídas (cor do texto) por semana, escala a partir de zero. */
export function WeeklyChart({ weeks }: { weeks: WeekInOut[] }) {
  const { hidden } = useHideValues()
  const c = buildBars(weeks, BOX)
  const summary = weeks
    .map((w) => `${formatLocalDayMonth(w.start)}: entradas ${formatBRL(w.inCents, { hidden })}, saídas ${formatBRL(w.outCents, { hidden })}`)
    .join('; ')
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Entradas e saídas por semana. ${summary}`}>
        {c.ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={BOX.padLeft} x2={W - BOX.padRight} y1={c.y(t)} y2={c.y(t)} />
            <text className="tick" x={BOX.padLeft - 6} y={c.y(t) + 3} textAnchor="end">
              {formatCompactBRL(t, { hidden })}
            </text>
          </g>
        ))}
        {c.groups.map((g, i) => (
          <g key={weeks[i].start}>
            <rect className="bar-in" x={g.in.x} y={g.in.y} width={g.in.w} height={g.in.h} rx={2} />
            <rect className="bar-out" x={g.out.x} y={g.out.y} width={g.out.w} height={g.out.h} rx={2} />
            <text className="axis" x={g.cx} y={H - 6} textAnchor="middle">
              {formatLocalDayMonth(weeks[i].start)}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="faint">
        <b className="legend s-max">■</b> Entradas · <b className="legend s-current">■</b> Saídas (gasto)
      </figcaption>
    </figure>
  )
}
