import { freeExceedsBalance } from '@/lib/cycle/free'

/** Aviso discreto quando o livre passa do saldo em conta corrente. */
export function FreeWarning({ freeCents, balanceCents }: { freeCents: number; balanceCents: number | null }) {
  if (balanceCents == null || !freeExceedsBalance(freeCents, balanceCents)) return null
  return <p className="sub free-warn">Seu livre é maior que o saldo em conta. Confira entradas e lançamentos sem classificar.</p>
}
