export type ChartSeries = { key: string; label: string; values: number[] }
export type ChartBox = { width: number; height: number; padTop: number; padBottom: number; padLeft: number; padRight: number }
export type ChartLine = {
  key: string
  label: string
  path: string
  points: { x: number; y: number }[]
  end: { x: number; y: number; labelY: number; value: number }
}

const LABEL_GAP = 12
const TICKS = 4

/** Passo "redondo" (1, 2, 2,5 ou 5 × 10^n) que cobre `raw`. */
export function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Geometria de um gráfico de linhas a partir de zero: escala, caminhos SVG, marcas do eixo e rótulos finais sem sobreposição. */
export function buildChart(series: ChartSeries[], box: ChartBox) {
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const step = niceStep(max / TICKS)
  const yMax = step * Math.max(1, Math.ceil(max / step))
  const ticks: number[] = []
  for (let v = 0; v <= yMax + step / 2; v += step) ticks.push(v)
  const plotW = box.width - box.padLeft - box.padRight
  const plotH = box.height - box.padTop - box.padBottom
  const y = (v: number) => r1(box.padTop + plotH - (v / yMax) * plotH)
  const n = Math.max(0, ...series.map((s) => s.values.length))
  const x = (i: number) => r1(box.padLeft + (n <= 1 ? plotW : (i / (n - 1)) * plotW))

  const lines: ChartLine[] = series
    .filter((s) => s.values.length > 0)
    .map((s) => {
      const points = s.values.map((v, i) => ({ x: x(i), y: y(v) }))
      const last = points[points.length - 1]
      return {
        key: s.key,
        label: s.label,
        points,
        path: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' '),
        end: { x: last.x, y: last.y, labelY: last.y, value: s.values[s.values.length - 1] },
      }
    })

  // Afasta rótulos finais próximos, de cima para baixo.
  const byY = [...lines].sort((a, b) => a.end.y - b.end.y)
  for (let i = 1; i < byY.length; i++) {
    const prev = byY[i - 1].end.labelY
    if (byY[i].end.labelY - prev < LABEL_GAP) byY[i].end.labelY = prev + LABEL_GAP
  }
  return { yMax, ticks, lines, y, x }
}
