begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into categories (id, user_id, name) values ('ca000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Extra A');
insert into income_sources (id, user_id, kind, payer_name) values ('15000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'salary', 'Empresa A');
insert into commitments (user_id, name, kind, amount_cents) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Aluguel', 'fixed', 150000);
insert into accounts (id, user_id, external_id, type, name) values ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'ext-b', 'BANK', 'Conta B');

select is((select date_rule from income_sources where id = '15000000-0000-0000-0000-00000000000a'), 'penultimate_business_day', 'date_rule padrao');
select is((select percent_base || active::text || sort::text from commitments where name = 'Aluguel'), 'salarytrue0', 'defaults de commitments');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from income_sources), 0, 'B nao ve fontes de A');
select is((select count(*)::int from commitments), 0, 'B nao ve compromissos de A');
select throws_ok(
  $$insert into income_sources (user_id, kind) values ('aaaaaaaa-0000-0000-0000-000000000001', 'salary')$$,
  '42501', null, 'B nao cria fonte para A');
select throws_ok(
  $$insert into commitments (user_id, name, kind, amount_cents, category_id) values ('bbbbbbbb-0000-0000-0000-000000000002', 'X', 'category_budget', 100, 'ca000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'compromisso de B nao aponta categoria de A');
select throws_ok(
  $$insert into transactions (user_id, account_id, source, date, amount_cents, description_raw, income_source_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'manual', '2026-11-28', 1, 'x', '15000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'transacao de B nao aponta fonte de A');
select throws_ok(
  $$insert into income_sources (user_id, kind) values ('bbbbbbbb-0000-0000-0000-000000000002', 'bogus')$$,
  '23514', null, 'kind invalido rejeitado');
select throws_ok(
  $$insert into income_sources (user_id, kind, date_rule) values ('bbbbbbbb-0000-0000-0000-000000000002', 'salary', 'bogus')$$,
  '23514', null, 'date_rule invalido rejeitado');
select throws_ok(
  $$insert into commitments (user_id, name, kind, percent, percent_base) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Y', 'percent_of_income', 10, 'bogus')$$,
  '23514', null, 'percent_base invalido rejeitado');
select lives_ok(
  $$insert into income_sources (user_id, kind) values ('bbbbbbbb-0000-0000-0000-000000000002', 'extra')$$,
  'B cria a propria fonte');

select throws_ok(
  $$insert into income_sources (user_id, kind, date_rule) values ('bbbbbbbb-0000-0000-0000-000000000002', 'salary', 'fixed_day')$$,
  '23514', null, 'fixed_day exige dia');
select throws_ok(
  $$insert into commitments (user_id, name, kind) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Z', 'fixed')$$,
  '23514', null, 'fixed exige amount_cents');
select throws_ok(
  $$insert into commitments (user_id, name, kind, amount_cents) values ('bbbbbbbb-0000-0000-0000-000000000002', 'W', 'percent_of_income', 100)$$,
  '23514', null, 'percent_of_income exige percent');

select * from finish();
rollback;
