/** Sem acento, minúsculas, espaços colapsados. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Só os dígitos (CPF/CNPJ). */
export function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '')
}
