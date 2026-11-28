-- Caixinhas/cofrinhos: saldos reservados (Pluggy `bankData.reservedBalances`), fora do saldo livre da conta.

create table if not exists public.savings_boxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id uuid not null,
  external_id text not null,
  name text,
  balance_cents bigint not null default 0,
  cdi_percent numeric,
  updated_at timestamptz not null default now(),
  unique (user_id, external_id),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create table if not exists public.savings_box_snapshots (
  user_id uuid not null references auth.users on delete cascade,
  box_id uuid not null,
  date date not null,
  balance_cents bigint not null,
  primary key (user_id, box_id, date),
  foreign key (box_id, user_id) references public.savings_boxes (id, user_id) on delete cascade
);

create index if not exists savings_boxes_account_idx on public.savings_boxes (account_id);

drop trigger if exists savings_boxes_updated_at on public.savings_boxes;
create trigger savings_boxes_updated_at before update on public.savings_boxes
  for each row execute function public.set_updated_at();

alter table public.savings_boxes enable row level security;
alter table public.savings_box_snapshots enable row level security;

drop policy if exists savings_boxes_own on public.savings_boxes;
create policy savings_boxes_own on public.savings_boxes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists savings_box_snapshots_own on public.savings_box_snapshots;
create policy savings_box_snapshots_own on public.savings_box_snapshots for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
