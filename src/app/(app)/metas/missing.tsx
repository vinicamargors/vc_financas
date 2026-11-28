/** Aviso quando as tabelas de metas/FGTS ainda não existem no banco. */
export function MigrationMissing({ what }: { what: string }) {
  return (
    <p role="alert" className="msg err">
      {what} ainda não está disponível: rode a migração <code>20261129000300_goals_fgts.sql</code> no SQL Editor do Supabase.
    </p>
  )
}
