const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Intl usa espaço não separável (U+00A0 / U+202F); normaliza para espaço comum.
const normalizeSpaces = (s: string) => s.replace(/[  ]/g, ' ')

// Intl aceita string decimal (precisão exata) em runtime, mas os tipos do lib.es não.
const fmt = (f: Intl.NumberFormat, decimal: string) => f.format(decimal as unknown as number)

// Decimal exato em string ("1234.56"), sem passar por ponto flutuante.
function centsToDecimal(abs: bigint): string {
  const s = abs.toString().padStart(3, '0')
  return `${s.slice(0, -2)}.${s.slice(-2)}`
}

/**
 * Formata centavos inteiros como moeda BRL.
 * - padrão: `R$ 1.234,56` / `-R$ 9,00`
 * - sign: `+ 500,00` / `− 9,00` (sem símbolo da moeda)
 * - hidden: `R$ •••`
 */
export function formatBRL(
  cents: number | bigint,
  opts: { hidden?: boolean; sign?: boolean } = {},
): string {
  if (opts.hidden) return 'R$ •••'
  const value = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(cents))
  const negative = value < 0n
  const abs = negative ? -value : value
  const decimal = centsToDecimal(abs)
  if (opts.sign) {
    const prefix = negative ? '−' : '+'
    return `${prefix} ${normalizeSpaces(fmt(plain, decimal))}`
  }
  return normalizeSpaces(fmt(brl, negative ? `-${decimal}` : decimal))
}
