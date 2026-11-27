begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into allowed_emails (email) values ('a@example.com');
insert into pluggy_credentials (user_id, client_id, client_secret_enc, webhook_secret)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'cid', 'enc', 'whsec-a');
insert into connections (id, user_id, pluggy_item_id, connector_name, status)
  values ('c0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'item-a', 'Banco X', 'UPDATED');
insert into accounts (id, user_id, connection_id, external_id, type, subtype, name, institution, balance_cents)
  values ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'ext-a', 'BANK', 'CHECKING_ACCOUNT', 'Conta', 'Banco X', 10000);
insert into transactions (user_id, account_id, external_id, source, date, amount_cents, description_raw)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'tx-a', 'pluggy', '2026-11-01', -1500, 'Mercado');
insert into balance_snapshots (user_id, account_id, date, balance_cents)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', '2026-11-01', 10000);

select is((select count(*)::int from profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 1, 'trigger criou profile para A (superuser)');

-- como B
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from transactions), 0, 'B nao ve transactions de A');
select is((select count(*)::int from accounts), 0, 'B nao ve accounts de A');
select is((select count(*)::int from connections), 0, 'B nao ve connections de A');
select is((select count(*)::int from pluggy_credentials), 0, 'B nao ve pluggy_credentials de A');
select is((select count(*)::int from balance_snapshots), 0, 'B nao ve balance_snapshots de A');
select is((select count(*)::int from profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'B nao ve profile de A');
select throws_ok(
  $$insert into transactions (user_id, account_id, source, date, amount_cents, description_raw)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'manual', '2026-11-02', -100, 'x')$$,
  '42501', null, 'B nao insere transaction para A');
select is((select count(*)::int from allowed_emails), 0, 'allowed_emails invisivel para authenticated');

-- FKs compostas: B nao referencia linhas de A
select throws_ok(
  $$insert into transactions (user_id, account_id, source, date, amount_cents, description_raw)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'manual', '2026-11-02', -100, 'x')$$,
  '23503', null, 'B nao cria transaction apontando para conta de A');
select throws_ok(
  $$insert into balance_snapshots (user_id, account_id, date, balance_cents)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '2026-11-02', 1)$$,
  '23503', null, 'B nao cria snapshot apontando para conta de A');
select throws_ok(
  $$insert into accounts (user_id, connection_id, external_id, type, name, balance_cents)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000a', 'ext-b', 'BANK', 'x', 0)$$,
  '23503', null, 'B nao cria conta apontando para connection de A');

-- B nao altera nem apaga linhas de A
with u as (update transactions set description_raw = 'hack' returning 1) select is((select count(*)::int from u), 0, 'B atualiza 0 transactions');
with d as (delete from transactions returning 1) select is((select count(*)::int from d), 0, 'B apaga 0 transactions');
with d as (delete from accounts returning 1) select is((select count(*)::int from d), 0, 'B apaga 0 accounts');

-- como A
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from transactions), 1, 'A ve exatamente 1 transaction');
select is((select count(*)::int from allowed_emails), 0, 'allowed_emails invisivel tambem para A');
select is((select count(*)::int from pluggy_credentials), 0, 'pluggy_credentials invisivel ate para o dono');
select throws_ok(
  $$update transactions set user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  '42501', null, 'A nao transfere transaction para B');
select is((select count(*)::int from transactions where description_raw = 'Mercado'), 1, 'transaction de A intacta');

select * from finish();
rollback;
