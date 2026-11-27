-- Esquema core: dinheiro em centavos (negativo = saiu, positivo = entrou), datas locais America/Sao_Paulo.

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  cpf text,
  hide_values boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.allowed_emails (
  email text primary key,
  invited_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.pluggy_credentials (
  user_id uuid primary key references auth.users on delete cascade,
  client_id text not null,
  client_secret_enc text not null,
  webhook_secret text not null unique,
  webhook_id text,
  updated_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  pluggy_item_id text not null,
  connector_name text not null,
  status text not null,
  status_detail text,
  consent_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, pluggy_item_id),
  unique (id, user_id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  connection_id uuid,
  external_id text not null,
  type text not null check (type in ('BANK', 'CREDIT', 'INVESTMENT', 'MANUAL')),
  subtype text,
  name text not null,
  institution text,
  balance_cents bigint not null default 0,
  credit_limit_cents bigint,
  closing_day smallint,
  due_day smallint,
  cdi_percent numeric,
  updated_at timestamptz not null default now(),
  unique (user_id, external_id),
  unique (id, user_id),
  foreign key (connection_id, user_id) references public.connections (id, user_id) on delete cascade
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null,
  external_id text,
  source text not null check (source in ('pluggy', 'shortcut', 'manual')),
  date date not null,
  amount_cents bigint not null,
  description_raw text not null,
  pluggy_category text,
  counterparty_name text,
  counterparty_doc text,
  payment_method text,
  installment_number smallint,
  installment_total smallint,
  card_last4 text,
  kind text,
  category_id uuid,
  merchant_id uuid,
  linked_transaction_id uuid,
  status text,
  deleted_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create table public.balance_snapshots (
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null,
  date date not null,
  balance_cents bigint not null,
  primary key (user_id, account_id, date),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_date_idx on public.transactions (account_id, date);

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger pluggy_credentials_updated_at before update on public.pluggy_credentials
  for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.allowed_emails enable row level security; -- sem politicas: so service role
alter table public.pluggy_credentials enable row level security; -- sem politicas: so service role
alter table public.connections enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.balance_snapshots enable row level security;

create policy profiles_own on public.profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy connections_own on public.connections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy accounts_own on public.accounts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy transactions_own on public.transactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy balance_snapshots_own on public.balance_snapshots for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cria profile ao cadastrar usuario
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
