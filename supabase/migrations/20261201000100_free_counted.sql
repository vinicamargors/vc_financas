-- Renda extra (PLR, 13º, férias, bônus) só entra no livre quando o dono manda. Idempotente.
alter table public.transactions add column if not exists free_counted boolean not null default false;
