begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email, instance_id, aud, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into accounts (id, user_id, external_id, type, name, balance_cents) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'ext-a', 'BANK', 'Conta A', 0);
insert into transactions (id, user_id, account_id, external_id, source, date, amount_cents, description_raw) values
  ('7a000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'p-a', 'pluggy', '2026-12-01', 156675, 'Ferias');

select has_column('public', 'transactions', 'free_counted', 'coluna free_counted existe');
select is((select free_counted from transactions where id = '7a000000-0000-0000-0000-00000000000a'), false, 'padrão: fora do livre');
select lives_ok(
  $$update transactions set free_counted = true where id = '7a000000-0000-0000-0000-00000000000a'$$,
  'pode marcar para somar ao livre');

select * from finish();
rollback;
