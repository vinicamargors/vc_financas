'use client'

import { buildChart, type ChartSeries } from '@/lib/invest/chart'
import { formatBRL } from '@/lib/format/money'
import { useHideValues } from './hide-values'

const W = 340
const H = 200
const BOX = { width: W, height: H, padTop: 12, padBottom: 22, padLeft: 44, padRight: 96 }

/** Rótulo curto do eixo: "R$ 40 mil". */
function compact(cents: number, hidden: boolean): string {
  if (hidden) return '•••'
  const reais = cents / 100
  if (reais >= 1_000_000) return `${(reais / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (reais >= 1000) return `${(reais / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return reais.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/** Linhas dos cenários (ritmo atual, mín., máx.) de hoje até a data-alvo, com o valor final de cada uma. */
export function ProjectionChart({ series, startLabel, endLabel }: { series: ChartSeries[]; startLabel: string; endLabel: string }) {
  const { hidden } = useHideValues()
  if (series.length === 0) return null
  const c = buildChart(series, BOX)
  const summary = series.map((s) => `${s.label}: ${formatBRL(s.values[s.values.length - 1] ?? 0, { hidden })}`).join('; ')
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projeção de ${startLabel} a ${endLabel}. ${summary}`}>
        {c.ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={BOX.padLeft} x2={W - BOX.padRight} y1={c.y(t)} y2={c.y(t)} />
            <text className="tick" x={BOX.padLeft - 6} y={c.y(t) + 3} textAnchor="end">
              {compact(t, hidden)}
            </text>
          </g>
        ))}
        <text className="axis" x={BOX.padLeft} y={H - 6}>
          {startLabel}
        </text>
        <text className="axis" x={W - BOX.padRight} y={H - 6} textAnchor="end">
          {endLabel}
        </text>
        {c.lines.map((l) => (
          <g key={l.key} className={`s-${l.key}`}>
            <path d={l.path} />
            <circle cx={l.end.x} cy={l.end.y} r={3} />
            <text className="end" x={l.end.x + 8} y={l.end.labelY + 3.5}>
              {formatBRL(l.end.value, { hidden })}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="faint">
        {series.map((s, i) => (
          <span key={s.key}>
            {i > 0 && ' · '}
            <b className={`legend s-${s.key}`}>—</b> {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
