begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

select is((select count(*)::int from categories where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 16, 'trigger de profile cria 16 categorias');
select is((select count(*)::int from (select public.seed_default_categories('aaaaaaaa-0000-0000-0000-000000000001')) s), 1, 'seed roda de novo');
select is((select count(*)::int from categories where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 16, 'seed e idempotente');

insert into categories (id, user_id, name) values ('ca000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Extra A');
insert into merchants (id, user_id, display_name) values ('aa000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Loja A');
insert into rules (user_id, match_field, pattern, kind) values ('aaaaaaaa-0000-0000-0000-000000000001', 'description', 'loja a', 'expense');
insert into shortcut_tokens (user_id, token_hash) values ('aaaaaaaa-0000-0000-0000-000000000001', 'hash-a');
insert into accounts (id, user_id, external_id, type, name) values ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'ext-a', 'BANK', 'Conta A');
insert into accounts (id, user_id, external_id, type, name) values ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'ext-b', 'BANK', 'Conta B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from categories where name = 'Extra A'), 0, 'B nao ve categorias de A');
select is((select count(*)::int from categories), 16, 'B ve so as proprias 16');
select is((select count(*)::int from merchants), 0, 'B nao ve merchants de A');
select is((select count(*)::int from rules), 0, 'B nao ve regras de A');
select is((select count(*)::int from shortcut_tokens), 0, 'B nao ve token de A');
select throws_ok(
  $$insert into merchants (user_id, display_name, category_id) values ('bbbbbbbb-0000-0000-0000-000000000002', 'X', 'ca000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'merchant de B nao aponta categoria de A');
select throws_ok(
  $$insert into rules (user_id, match_field, pattern, merchant_id) values ('bbbbbbbb-0000-0000-0000-000000000002', 'description', 'x', 'aa000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'regra de B nao aponta merchant de A');
select throws_ok(
  $$insert into rules (user_id, match_field, pattern, category_id) values ('bbbbbbbb-0000-0000-0000-000000000002', 'description', 'y', 'ca000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'regra de B nao aponta categoria de A');
select throws_ok(
  $$insert into transactions (user_id, account_id, source, date, amount_cents, description_raw, kind, category_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'manual', '2026-11-28', -1, 'x', 'expense', null)$$,
  '23503', null, 'transacao de B nao aponta conta de A');
select throws_ok(
  $$insert into categories (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Z')$$,
  '42501', null, 'B nao cria categoria para A');
select throws_ok(
  $$insert into rules (user_id, match_field, pattern) values ('bbbbbbbb-0000-0000-0000-000000000002', 'bogus', 'x')$$,
  '23514', null, 'match_field invalido rejeitado');

select throws_ok(
  $$insert into transactions (user_id, account_id, source, date, amount_cents, description_raw, category_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'manual', '2026-11-28', -1, 'x', 'ca000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'transacao de B nao aponta categoria de A');
select throws_ok(
  $$insert into transactions (user_id, account_id, source, date, amount_cents, description_raw, merchant_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'manual', '2026-11-28', -1, 'x', 'aa000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'transacao de B nao aponta merchant de A');
select throws_ok(
  $$select public.seed_default_categories('bbbbbbbb-0000-0000-0000-000000000002')$$,
  '42501', null, 'authenticated nao executa seed_default_categories');

select * from finish();
rollback;
