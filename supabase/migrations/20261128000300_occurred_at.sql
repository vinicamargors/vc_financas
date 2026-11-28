-- Horário do lançamento quando a Pluggy informa (Pix/TED). Datas sem hora chegam à meia-noite UTC.
alter table public.transactions add column if not exists occurred_at timestamptz;

-- Preenche a partir do JSON original.
update public.transactions
   set occurred_at = (raw->>'date')::timestamptz
 where occurred_at is null
   and raw->>'date' is not null
   and raw->>'date' !~ 'T00:00:00(\.0+)?Z$';

-- Datas sem hora (meia-noite UTC) eram convertidas para o dia anterior em Brasília: corrige.
update public.transactions
   set date = left(raw->>'date', 10)::date
 where raw->>'date' ~ 'T00:00:00(\.0+)?Z$'
   and date <> left(raw->>'date', 10)::date;

create index if not exists transactions_user_date_time_idx
  on public.transactions (user_id, date desc, occurred_at desc nulls last);
