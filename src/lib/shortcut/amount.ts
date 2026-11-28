const MAX_CENTS = 100_000_000_00 // R$ 100 milhões

/**
 * Valor em centavos (sempre positivo) a partir de número ou texto ("R$ 1.234,56", "1234,56",
 * "1,234.56"). Formato brasileiro tem prioridade quando ambíguo. `null` quando inválido ou zero.
 */
export function parseAmountCents(input: unknown): number | null {
  let value: number
  if (typeof input === 'number') {
    value = input
  } else if (typeof input === 'string') {
    const s = input.replace(/R\$/gi, '').replace(/[\s ]/g, '').replace(/^[-+]/, '')
    if (!/^\d[\d.,]*$/.test(s)) return null
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    let normalized: string
    if (lastComma >= 0 && lastDot >= 0) {
      const dec = lastComma > lastDot ? ',' : '.'
      const thousands = dec === ',' ? '.' : ','
      normalized = s.split(thousands).join('').replace(dec, '.')
    } else if (lastComma >= 0) {
      normalized = s.replace(',', '.')
    } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
      normalized = s.split('.').join('') // "1.234" = mil duzentos e trinta e quatro
    } else {
      normalized = s
    }
    if (!/^\d+(\.\d+)?$/.test(normalized)) return null
    value = Number(normalized)
  } else {
    return null
  }
  if (!Number.isFinite(value)) return null
  const cents = Math.round(Math.abs(value) * 100)
  return cents > 0 && cents <= MAX_CENTS ? cents : null
}
