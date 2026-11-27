// Ponto pequeno com a cor do banco. Roxo (Nubank) e bancos sem cor conhecida ficam neutros.
const BRAND: [RegExp, string][] = [
  [/bradesco/i, '#CC092F'],
  [/mercado\s*pago/i, '#00B1EA'],
  [/ita[uú]/i, '#EC7000'],
  [/\binter\b/i, '#FF7A00'],
]

export function bankColor(institution: string): string {
  for (const [re, color] of BRAND) if (re.test(institution)) return color
  return 'var(--muted)'
}

export function BankDot({ institution }: { institution: string }) {
  return <i className="dot" style={{ background: bankColor(institution) }} aria-hidden="true" />
}
