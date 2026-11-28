import { normalizeText } from './normalize'

/**
 * Categoria da Pluggy (inglês) → nome da nossa categoria padrão.
 * Casamento por substring em minúsculas, a partir do início de uma palavra; a primeira entrada que bate vence,
 * então as mais específicas vêm antes.
 */
export const PLUGGY_TO_CATEGORY: [string, string][] = [
  ['delivery', 'Delivery'],
  ['groceries', 'Mercado'],
  ['supermarket', 'Mercado'],
  ['gas station', 'Combustível'],
  ['fuel', 'Combustível'],
  ['food', 'Alimentação'],
  ['restaurant', 'Alimentação'],
  ['eating out', 'Alimentação'],
  ['taxi', 'Transporte'],
  ['ride', 'Transporte'],
  ['parking', 'Transporte'],
  ['toll', 'Transporte'],
  ['public transport', 'Transporte'],
  ['transportation', 'Transporte'],
  ['vehicle', 'Transporte'],
  ['digital services', 'Assinaturas'],
  ['streaming', 'Assinaturas'],
  ['subscription', 'Assinaturas'],
  ['telecommunications', 'Contas'],
  ['internet', 'Contas'],
  ['mobile', 'Contas'],
  ['electricity', 'Contas'],
  ['water', 'Contas'],
  ['utilities', 'Contas'],
  ['taxes', 'Contas'],
  ['bank fees', 'Contas'],
  ['rent', 'Moradia'],
  ['housing', 'Moradia'],
  ['health', 'Saúde'],
  ['pharmacy', 'Saúde'],
  ['hospital', 'Saúde'],
  ['dentist', 'Saúde'],
  ['gym', 'Saúde'],
  ['wellness', 'Saúde'],
  ['education', 'Educação'],
  ['school', 'Educação'],
  ['university', 'Educação'],
  ['book', 'Educação'],
  ['travel', 'Viagem'],
  ['airport', 'Viagem'],
  ['airline', 'Viagem'],
  ['accommodation', 'Viagem'],
  ['hotel', 'Viagem'],
  ['pet', 'Pets'],
  ['gift', 'Presentes'],
  ['donation', 'Presentes'],
  ['leisure', 'Lazer'],
  ['entertainment', 'Lazer'],
  ['gaming', 'Lazer'],
  ['cinema', 'Lazer'],
  ['shopping', 'Compras'],
  ['clothing', 'Compras'],
  ['electronics', 'Compras'],
  ['online shopping', 'Compras'],
]

export function pluggyCategoryToName(pluggyCategory: string | null | undefined): string | null {
  const c = normalizeText(pluggyCategory)
  if (!c) return null
  for (const [needle, name] of PLUGGY_TO_CATEGORY) if (` ${c}`.includes(` ${needle}`)) return name
  return null
}

export function isPluggyCardPayment(pluggyCategory: string | null | undefined): boolean {
  return normalizeText(pluggyCategory).includes('credit card payment')
}
