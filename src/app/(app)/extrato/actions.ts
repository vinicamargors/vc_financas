'use server'

import { requireUser } from '@/lib/supabase/server'
import { loadStatementPage, type StatementPage } from '@/lib/queries/statement'
import { isFilter } from '@/lib/queries/statement-page'

/** Próxima página do extrato (cursor null = primeira página do filtro). */
export async function loadMoreStatement(cursor: string | null, filter: string): Promise<StatementPage> {
  await requireUser()
  if (!isFilter(filter)) throw new Error('Filtro inválido')
  return loadStatementPage({ cursor, filter })
}
