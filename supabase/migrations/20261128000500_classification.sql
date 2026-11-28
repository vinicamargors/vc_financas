-- Classificação: categorias, merchants, regras, token do atalho. Idempotente.

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  icon text,
  monthly_limit_cents bigint,
  unique (user_id, name),
  unique (id, user_id)
);

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  display_name text not null,
  category_id uuid,
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    match simple on delete set null (category_id)
);

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  match_field text not null check (match_field in ('description', 'counterparty_doc', 'counterparty_name')),
  pattern text not null,
  merchant_id uuid,
  category_id uuid,
  kind text check (kind in ('expense','income','transfer','card_payment','investment_in','investment_out','savings_yield','refund','pending_review')),
  created_at timestamptz not null default now(),
  unique (user_id, match_field, pattern),
  foreign key (merchant_id, user_id) references public.merchants (id, user_id)
    match simple on delete set null (merchant_id),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    match simple on delete set null (category_id)
);

create table if not exists public.shortcut_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists merchants_category_idx on public.merchants (category_id);
create index if not exists rules_user_idx on public.rules (user_id);

-- transactions: kind continua nullable (NULL passa no check; o classificador trata as linhas existentes)
alter table public.transactions
  add column if not exists classified_by text default 'auto';
update public.transactions set classified_by = 'auto' where classified_by is null;
alter table public.transactions alter column classified_by set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_kind_check' and conrelid = 'public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_kind_check
      check (kind in ('expense','income','transfer','card_payment','investment_in','investment_out','savings_yield','refund','pending_review'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_classified_by_check' and conrelid = 'public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_classified_by_check
      check (classified_by in ('auto','user'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_category_fk' and conrelid = 'public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_category_fk
      foreign key (category_id, user_id) references public.categories (id, user_id)
      match simple on delete set null (category_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_merchant_fk' and conrelid = 'public.transactions'::regclass) then
    alter table public.transactions add constraint transactions_merchant_fk
      foreign key (merchant_id, user_id) references public.merchants (id, user_id)
      match simple on delete set null (merchant_id);
  end if;
end $$;

create index if not exists transactions_category_idx on public.transactions (category_id);
create index if not exists transactions_merchant_idx on public.transactions (merchant_id);

-- RLS
alter table public.categories enable row level security;
alter table public.merchants enable row level security;
alter table public.rules enable row level security;
alter table public.shortcut_tokens enable row level security;

drop policy if exists categories_own on public.categories;
create policy categories_own on public.categories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists merchants_own on public.merchants;
create policy merchants_own on public.merchants for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists rules_own on public.rules;
create policy rules_own on public.rules for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists shortcut_tokens_own on public.shortcut_tokens;
create policy shortcut_tokens_own on public.shortcut_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Categorias padrão
create or replace function public.seed_default_categories(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.categories (user_id, name)
  select p_user_id, n from unnest(array[
    'Alimentação','Mercado','Transporte','Combustível','Moradia','Contas','Saúde','Lazer',
    'Compras','Assinaturas','Educação','Delivery','Viagem','Pets','Presentes','Outros'
  ]) as n
  on conflict (user_id, name) do nothing;
$$;
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;

create or replace function public.handle_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_default_categories(new.user_id);
  return new;
end $$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created after insert on public.profiles
  for each row execute function public.handle_new_profile();

-- Usuários que já existem
select public.seed_default_categories(user_id) from public.profiles;
