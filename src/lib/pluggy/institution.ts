/** Bancos conhecidos: nome de exibição, código COMPE e padrão no nome do produto. */
export const KNOWN_BANKS: { name: string; code: string; re: RegExp }[] = [
  { name: 'Bradesco', code: '237', re: /bradesco/i },
  { name: 'Nubank', code: '260', re: /\bnu\b|nubank|nu pagamentos|ultravioleta/i },
  { name: 'Mercado Pago', code: '323', re: /mercado\s*pago/i },
  { name: 'Itaú', code: '341', re: /ita[uú]/i },
  { name: 'Inter', code: '077', re: /\binter\b/i },
  { name: 'C6 Bank', code: '336', re: /\bc6\b/i },
  { name: 'Banco do Brasil', code: '001', re: /banco do brasil|\bbb\b/i },
  { name: 'Caixa', code: '104', re: /\bcaixa\b/i },
  { name: 'Santander', code: '033', re: /santander/i },
  { name: 'PicPay', code: '380', re: /picpay/i },
  { name: 'XP', code: '102', re: /\bxp\b/i },
  { name: 'BTG Pactual', code: '208', re: /\bbtg\b/i },
  { name: 'Sicoob', code: '756', re: /sicoob/i },
  { name: 'Sicredi', code: '748', re: /sicredi/i },
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
