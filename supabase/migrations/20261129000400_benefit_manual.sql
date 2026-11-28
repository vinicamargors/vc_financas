-- VR (conta BENEFIT, fora da Pluggy) e lançamento manual com conferência.

-- accounts.type passa a aceitar BENEFIT.
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('BANK', 'CREDIT', 'INVESTMENT', 'MANUAL', 'BENEFIT'));

-- Recarga do VR: valor mensal e dia (1–31, limitado ao fim do mês) e a partir de quando gerar.
alter table public.accounts add column if not exists benefit_monthly_cents bigint;
alter table public.accounts add column if not exists benefit_day smallint;
alter table public.accounts add column if not exists benefit_since date;

-- Conferência do lançamento manual com a Pluggy.
alter table public.transactions add column if not exists reconcile_candidate_id uuid;
alter table public.transactions add column if not exists reconciled boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_benefit_day_check' and conrelid = 'public.accounts'::regclass) then
    alter table public.accounts add constraint accounts_benefit_day_check
      check (benefit_day is null or benefit_day between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'accounts_benefit_monthly_check' and conrelid = 'public.accounts'::regclass) then
    alter table public.accounts add constraint accounts_benefit_monthly_check
      check (benefit_monthly_cents is null or benefit_monthly_cents > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_id_user_key' and conrelid = 'public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_id_user_key unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_reconcile_candidate_fk' and conrelid = 'public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_reconcile_candidate_fk
      foreign key (reconcile_candidate_id, user_id) references public.transactions (id, user_id)
      match simple on delete set null (reconcile_candidate_id);
  end if;
end $$;

create index if not exists transactions_reconcile_candidate_idx on public.transactions (reconcile_candidate_id)
  where reconcile_candidate_id is not null;
