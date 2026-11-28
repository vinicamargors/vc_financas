begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into accounts (id, user_id, external_id, type, name, balance_cents) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'ext-a', 'BANK', 'Conta A', 0),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'ext-b', 'BANK', 'Conta B', 0);
insert into transactions (id, user_id, account_id, external_id, source, date, amount_cents, description_raw) values
  ('7a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'p-a', 'pluggy', '2026-11-28', -1000, 'Padaria'),
  ('7b000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'p-b', 'pluggy', '2026-11-28', -1000, 'Padaria');

select lives_ok(
  $$insert into accounts (id, user_id, external_id, type, name, benefit_monthly_cents, benefit_day)
    values ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'vr:a', 'BENEFIT', 'VR', 80000, 5)$$,
  'conta BENEFIT aceita');
select throws_ok(
  $$insert into accounts (user_id, external_id, type, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'FOO', 'x')$$,
  '23514', null, 'tipo desconhecido recusado');
select throws_ok(
  $$insert into accounts (user_id, external_id, type, name, benefit_day) values ('aaaaaaaa-0000-0000-0000-000000000001', 'y', 'BENEFIT', 'y', 32)$$,
  '23514', null, 'dia da recarga entre 1 e 31');
select lives_ok(
  $$insert into transactions (user_id, account_id, external_id, source, date, amount_cents, description_raw, kind, classified_by)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'vr:a1000000-0000-0000-0000-00000000000a:2026-11', 'manual', '2026-11-05', 80000, 'Recarga VR', 'income', 'user')$$,
  'recarga do mes');
select throws_ok(
  $$insert into transactions (user_id, account_id, external_id, source, date, amount_cents, description_raw)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-00000000000a', 'vr:a1000000-0000-0000-0000-00000000000a:2026-11', 'manual', '2026-11-05', 80000, 'Recarga VR')$$,
  '23505', null, 'recarga nao duplica no mes');
select is((select reconciled from transactions where external_id = 'p-a'), false, 'reconciled padrao false');

select throws_ok(
  $$insert into transactions (user_id, account_id, source, date, amount_cents, description_raw, reconcile_candidate_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'manual', '2026-11-28', -1000, 'Padaria', '7b000000-0000-0000-0000-00000000000b')$$,
  '23503', null, 'candidato de outro usuario recusado (FK composta)');
insert into transactions (id, user_id, account_id, source, date, amount_cents, description_raw, reconcile_candidate_id)
  values ('7c000000-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'manual', '2026-11-28', -1000, 'Padaria', '7a000000-0000-0000-0000-00000000000a');
delete from transactions where id = '7a000000-0000-0000-0000-00000000000a';
select is((select reconcile_candidate_id from transactions where id = '7c000000-0000-0000-0000-00000000000c'), null, 'apagar candidato zera o vinculo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from accounts where type = 'BENEFIT'), 0, 'B nao ve VR de A');
with u as (update transactions set reconciled = true where id = '7c000000-0000-0000-0000-00000000000c' returning 1)
  select is((select count(*)::int from u), 0, 'B nao confere manual de A');
select throws_ok(
  $$update transactions set reconcile_candidate_id = '7c000000-0000-0000-0000-00000000000c' where id = '7b000000-0000-0000-0000-00000000000b'$$,
  '23503', null, 'B nao aponta para lancamento de A');

select * from finish();
rollback;
