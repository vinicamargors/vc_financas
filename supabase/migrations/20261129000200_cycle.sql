-- Ciclo: fontes de renda e compromissos. Idempotente.

create table if not exists public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  payer_doc text,
  payer_name text,
  kind text not null check (kind in ('salary','extra')),
  date_rule text not null default 'penultimate_business_day'
    check (date_rule in ('penultimate_business_day','last_business_day','fifth_business_day','fixed_day')),
  fixed_day smallint check (fixed_day between 1 and 31),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kind text not null check (kind in ('fixed','category_budget','percent_of_income')),
  amount_cents bigint,
  percent numeric,
  percent_base text not null default 'salary' check (percent_base in ('salary','all')),
  category_id uuid,
  match_counterparty text,
  active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    match simple on delete set null (category_id)
);

create index if not exists income_sources_user_idx on public.income_sources (user_id);
create index if not exists commitments_user_idx on public.commitments (user_id);
create index if not exists commitments_category_idx on public.commitments (category_id);

alter table public.transactions add column if not exists income_source_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_income_source_fk' and conrelid = 'public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_income_source_fk
      foreign key (income_source_id, user_id) references public.income_sources (id, user_id)
      match simple on delete set null (income_source_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'income_sources_fixed_day_required' and conrelid = 'public.income_sources'::regclass) then
    alter table public.income_sources add constraint income_sources_fixed_day_required
      check (date_rule <> 'fixed_day' or fixed_day is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'commitments_value_check' and conrelid = 'public.commitments'::regclass) then
    alter table public.commitments add constraint commitments_value_check
      check (case kind when 'percent_of_income' then percent is not null else amount_cents is not null end);
  end if;
end $$;

create index if not exists transactions_income_source_idx on public.transactions (income_source_id);

-- RLS
alter table public.income_sources enable row level security;
alter table public.commitments enable row level security;

drop policy if exists income_sources_own on public.income_sources;
create policy income_sources_own on public.income_sources for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists commitments_own on public.commitments;
create policy commitments_own on public.commitments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
