'use server'

import { requireUser } from '@/lib/supabase/server'
import { loadStatementPage, type StatementPage } from '@/lib/queries/statement'
import { isFilter } from '@/lib/queries/statement-page'
import { parseRange } from '@/lib/analysis/period'

/** Próxima página do extrato (cursor null = primeira página do filtro). */
export async function loadMoreStatement(cursor: string | null, filter: string, start: string, end: string): Promise<StatementPage> {
  await requireUser()
  if (!isFilter(filter)) throw new Error('Filtro inválido')
  const range = parseRange(start, end)
  if (!range) throw new Error('Período inválido')
  return loadStatementPage({ cursor, filter, range })
}
