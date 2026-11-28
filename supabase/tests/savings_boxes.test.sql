begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into accounts (id, user_id, external_id, type, name, balance_cents) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'ext-a', 'BANK', 'Conta A', 0),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'ext-b', 'BANK', 'Conta B', 0);
insert into savings_boxes (id, user_id, account_id, external_id, name, balance_cents, cdi_percent)
  values ('5a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'box-a', 'Cofrinho', 502537, 122.999);
insert into savings_box_snapshots (user_id, box_id, date, balance_cents)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-00000000000a', '2026-11-28', 502537);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from savings_boxes), 0, 'B nao ve caixinhas de A');
select is((select count(*)::int from savings_box_snapshots), 0, 'B nao ve snapshots de caixinha de A');
select throws_ok(
  $$insert into savings_boxes (user_id, account_id, external_id, balance_cents)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'box-x', 1)$$,
  '42501', null, 'B nao insere caixinha para A');
select throws_ok(
  $$insert into savings_boxes (user_id, account_id, external_id, balance_cents)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'box-b', 1)$$,
  '23503', null, 'B nao cria caixinha apontando para conta de A');
select throws_ok(
  $$insert into savings_box_snapshots (user_id, box_id, date, balance_cents)
    values ('bbbbbbbb-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-00000000000a', '2026-11-28', 1)$$,
  '23503', null, 'B nao cria snapshot apontando para caixinha de A');
with u as (update savings_boxes set balance_cents = 0 returning 1) select is((select count(*)::int from u), 0, 'B atualiza 0 caixinhas');
with d as (delete from savings_box_snapshots returning 1) select is((select count(*)::int from d), 0, 'B apaga 0 snapshots');
select lives_ok(
  $$insert into savings_boxes (user_id, account_id, external_id, balance_cents)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'box-b', 1)$$,
  'B cria caixinha na propria conta');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from savings_boxes), 1, 'A ve so a propria caixinha');
select is((select balance_cents::int from savings_box_snapshots), 502537, 'snapshot de A intacto');

select * from finish();
rollback;
