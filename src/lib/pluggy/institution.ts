/** Bancos conhecidos: nome de exibição, código COMPE e padrão no nome do produto. */
export const KNOWN_BANKS: { name: string; code: string; re: RegExp; domain: string }[] = [
  { name: 'Bradesco', code: '237', re: /bradesco/i, domain: 'bradesco.com.br' },
  { name: 'Nubank', code: '260', re: /\bnu\b|nubank|nu pagamentos|ultravioleta/i, domain: 'nubank.com.br' },
  { name: 'Mercado Pago', code: '323', re: /mercado\s*pago/i, domain: 'mercadopago.com.br' },
  { name: 'Itaú', code: '341', re: /ita[uú]/i, domain: 'itau.com.br' },
  { name: 'Inter', code: '077', re: /\binter\b/i, domain: 'bancointer.com.br' },
  { name: 'C6 Bank', code: '336', re: /\bc6\b/i, domain: 'c6bank.com.br' },
  { name: 'Banco do Brasil', code: '001', re: /banco do brasil|\bbb\b/i, domain: 'bb.com.br' },
  { name: 'Caixa', code: '104', re: /\bcaixa\b/i, domain: 'caixa.gov.br' },
  { name: 'Santander', code: '033', re: /santander/i, domain: 'santander.com.br' },
  { name: 'PicPay', code: '380', re: /picpay/i, domain: 'picpay.com' },
  { name: 'XP', code: '102', re: /\bxp\b/i, domain: 'xpi.com.br' },
  { name: 'BTG Pactual', code: '208', re: /\bbtg\b/i, domain: 'btgpactual.com' },
  { name: 'Sicoob', code: '756', re: /sicoob/i, domain: 'sicoob.com.br' },
  { name: 'Sicredi', code: '748', re: /sicredi/i, domain: 'sicredi.com.br' },
]

export const isMeuPluggy = (connectorName: string) => /meu\s*pluggy/i.test(connectorName)

/**
 * Banco real de uma conta. Fora do Meu Pluggy, o conector já é o banco.
 * No Meu Pluggy: procura o banco no nome do produto e depois no código COMPE do número de transferência.
 */
export function detectInstitution(
  account: { name: string; marketingName?: string | null; bankData?: { transferNumber: string | null } | null },
  connectorName: string,
): string {
  if (!isMeuPluggy(connectorName) && connectorName.trim()) return connectorName
  const text = `${account.marketingName ?? ''} ${account.name}`
  for (const b of KNOWN_BANKS) if (b.re.test(text)) return b.name
  const code = account.bankData?.transferNumber?.match(/^\s*0*(\d{1,3})\s*[/\-\s.]/)?.[1]?.padStart(3, '0')
  const byCode = code ? KNOWN_BANKS.find((b) => b.code === code) : undefined
  if (byCode) return byCode.name
  return account.marketingName?.trim() || account.name
}

/**
 * Contas sem pista de banco (ex.: cartão "VISA INFINITE") herdam o banco quando
 * as demais contas da mesma conexão apontam para um único banco conhecido.
 */
export function inheritInstitution(institutions: string[]): string[] {
  const known = new Set(institutions.filter((i) => KNOWN_BANKS.some((b) => b.name === i)))
  if (known.size !== 1) return institutions
  const [only] = known
  return institutions.map((i) => (KNOWN_BANKS.some((b) => b.name === i) ? i : only))
}

/** Ícone do site do banco, quando a Pluggy não fornece logo. */
export function fallbackLogo(institution: string): string | null {
  const bank = KNOWN_BANKS.find((b) => b.name === institution) ?? KNOWN_BANKS.find((b) => b.re.test(institution))
  return bank ? `https://www.google.com/s2/favicons?domain=${bank.domain}&sz=64` : null
}
