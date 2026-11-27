begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into public.allowed_emails (email) values ('a@x.com');

select is(
  public.hook_before_user_created('{"user":{"email":"a@x.com"}}'::jsonb),
  '{}'::jsonb,
  'e-mail convidado passa');

select is(
  public.hook_before_user_created('{"user":{"email":"B@Y.com"}}'::jsonb)->'error'->>'http_code',
  '403',
  'e-mail nao convidado recebe 403');

select is(
  public.hook_before_user_created('{"user":{"email":"A@X.COM"}}'::jsonb),
  '{}'::jsonb,
  'comparacao sem diferenciar maiusculas');

select is(
  public.hook_before_user_created('{"user":{"email":"B@Y.com"}}'::jsonb)->'error'->>'message',
  'Este e-mail não foi convidado.',
  'mensagem de erro em portugues');

select * from finish();
rollback;
