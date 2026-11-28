const SGS_CDI_ANNUAL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json'

export type CdiPoint = { date: string; annualPct: number }

/** Interpreta a resposta da série SGS (`[{ data: "dd/MM/yyyy", valor: "14,90" }]`). */
export function parseSgs(json: unknown): CdiPoint | null {
  if (!Array.isArray(json) || json.length === 0) return null
  const last = json[json.length - 1] as { data?: unknown; valor?: unknown }
  if (typeof last?.data !== 'string' || (typeof last.valor !== 'string' && typeof last.valor !== 'number')) return null
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(last.data)
  if (!m) return null
  const annualPct = typeof last.valor === 'number' ? last.valor : Number(last.valor.trim().replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(annualPct) || annualPct <= 0 || annualPct > 100) return null
  return { date: `${m[3]}-${m[2]}-${m[1]}`, annualPct }
}

/** CDI anual (% a.a., série 4389 do BCB), cacheado por um dia. `null` se indisponível. */
export async function getCdiAnnual(): Promise<number | null> {
  try {
    const res = await fetch(SGS_CDI_ANNUAL, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return parseSgs(await res.json())?.annualPct ?? null
  } catch {
    return null
  }
}

/** Rendimento estimado de um dia útil: saldo × ((1 + CDI × pct)^(1/252) − 1), em centavos. */
export function dailyYieldCents(balanceCents: number, cdiAnnualPct: number, cdiPercent: number): number {
  if (balanceCents <= 0 || cdiAnnualPct <= 0 || cdiPercent <= 0) return 0
  const annual = (cdiAnnualPct / 100) * (cdiPercent / 100)
  return Math.round(balanceCents * (Math.pow(1 + annual, 1 / 252) - 1))
}
