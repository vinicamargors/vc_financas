begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into accounts (id, user_id, external_id, type, name, balance_cents) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'ext-a', 'BANK', 'Conta A', 0),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'ext-b', 'BANK', 'Conta B', 0);
insert into savings_boxes (id, user_id, account_id, external_id, name, balance_cents) values
  ('5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'box-a', 'Casa', 1840000),
  ('5b000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'box-b', 'Viagem', 100);
insert into goals (id, user_id, name, target_cents, include_fgts) values
  ('9a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'Casa', 10000000, true);
insert into goal_boxes (user_id, goal_id, box_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-00000000000a', '5a000000-0000-0000-0000-00000000000a');
insert into fgts (user_id, balance_cents, balance_date) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 3000000, '2026-11-01');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from goals), 0, 'B nao ve metas de A');
select is((select count(*)::int from goal_boxes), 0, 'B nao ve caixinhas de metas de A');
select is((select count(*)::int from fgts), 0, 'B nao ve FGTS de A');
select throws_ok(
  $$insert into goals (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x')$$,
  '42501', null, 'B nao cria meta para A');
select throws_ok(
  $$insert into fgts (user_id, balance_cents, balance_date) values ('aaaaaaaa-0000-0000-0000-000000000001', 1, '2026-11-01')$$,
  '42501', null, 'B nao cria FGTS para A');
select lives_ok(
  $$insert into goals (id, user_id, name) values ('9b000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'Viagem')$$,
  'B cria a propria meta');
select throws_ok(
  $$insert into goal_boxes (user_id, goal_id, box_id) values ('bbbbbbbb-0000-0000-0000-000000000002', '9b000000-0000-0000-0000-00000000000b', '5a000000-0000-0000-0000-00000000000a')$$,
  '23503', null, 'B nao liga a propria meta a caixinha de A');
select throws_ok(
  $$insert into goal_boxes (user_id, goal_id, box_id) values ('bbbbbbbb-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-00000000000a', '5b000000-0000-0000-0000-00000000000b')$$,
  '23503', null, 'B nao liga a propria caixinha a meta de A');
select lives_ok(
  $$insert into goal_boxes (user_id, goal_id, box_id) values ('bbbbbbbb-0000-0000-0000-000000000002', '9b000000-0000-0000-0000-00000000000b', '5b000000-0000-0000-0000-00000000000b')$$,
  'B liga meta e caixinha proprias');
with u as (update fgts set balance_cents = 0 returning 1) select is((select count(*)::int from u), 0, 'B atualiza 0 FGTS');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from goal_boxes), 1, 'A ve so a propria ligacao');
select is((select balance_cents::int from fgts), 3000000, 'FGTS de A intacto');

select * from finish();
rollback;
