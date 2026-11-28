-- Metas (ex.: Casa = caixinhas + FGTS) e saldo de FGTS informado à mão.

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  target_cents bigint,
  target_date date,
  planned_min_cents bigint,
  planned_max_cents bigint,
  include_fgts boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.goal_boxes (
  user_id uuid not null references auth.users on delete cascade,
  goal_id uuid not null,
  box_id uuid not null,
  primary key (goal_id, box_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade,
  foreign key (box_id, user_id) references public.savings_boxes (id, user_id) on delete cascade
);

create table if not exists public.fgts (
  user_id uuid primary key references auth.users on delete cascade,
  balance_cents bigint not null default 0,
  balance_date date not null,
  gross_salary_cents bigint,
  reference_net_cents bigint,
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'goals_planned_range' and conrelid = 'public.goals'::regclass) then
    alter table public.goals add constraint goals_planned_range
      check (planned_min_cents is null or planned_max_cents is null or planned_min_cents <= planned_max_cents);
  end if;
end $$;

create index if not exists goals_user_idx on public.goals (user_id);
create index if not exists goal_boxes_box_idx on public.goal_boxes (box_id, user_id);

drop trigger if exists fgts_updated_at on public.fgts;
create trigger fgts_updated_at before update on public.fgts
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;
alter table public.goal_boxes enable row level security;
alter table public.fgts enable row level security;

drop policy if exists goals_own on public.goals;
create policy goals_own on public.goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists goal_boxes_own on public.goal_boxes;
create policy goal_boxes_own on public.goal_boxes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists fgts_own on public.fgts;
create policy fgts_own on public.fgts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
