import { BankDot } from './bank-dot'

/** Logo do banco quando a Pluggy fornece; senão, o ponto de cor. */
export function BankMark({ institution, logoUrl }: { institution: string; logoUrl?: string | null }) {
  if (!logoUrl) return <BankDot institution={institution} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="bank-logo" src={logoUrl} alt="" width={16} height={16} loading="lazy" referrerPolicy="no-referrer" />
}
