-- Quando a Pluggy buscou os dados no banco pela última vez (item.lastUpdatedAt).
alter table public.connections add column if not exists bank_data_at timestamptz;
