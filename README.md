# VC Finanças

App pessoal de finanças (PWA). Next.js 15 + Supabase + Pluggy (Meu Pluggy).

## Desenvolvimento local

```bash
npm install
npx supabase start          # requer Docker
cp .env.example .env.local  # preencher com as chaves do `supabase status`
npm run dev
npm test                    # unitários
npx supabase test db        # RLS e hook de convite
```

## Publicar (checklist)

1. **Supabase (Free):** criar projeto → `npx supabase link` → `npx supabase db push`.
2. **Supabase → Auth → Hooks:** ligar *Before User Created* → `public.hook_before_user_created`. Sem isso, qualquer pessoa se cadastra.
3. **Supabase → Auth → URL Configuration:** Site URL = `APP_URL`; redirect permitido `APP_URL/auth/callback`.
4. **Convites:** `insert into allowed_emails(email) values ('voce@exemplo.com');`
5. **Vercel (Hobby):** importar o repositório e definir:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `CREDENTIALS_KEY` → `openssl rand -base64 32` (**guarde cópia**: perder ou trocar invalida as credenciais Pluggy salvas)
   - `CRON_SECRET` → `openssl rand -hex 32`
   - `APP_URL` → `https://seu-app.vercel.app`
6. `npm audit` antes do primeiro deploy.
7. No iPhone: Safari → Compartilhar → **Adicionar à Tela de Início** → login → Configurações → Conectar bancos.

## Verificar na primeira sincronização real

- Saldos batem com os apps dos bancos.
- Datas das transações no dia certo (risco: Pluggy enviar meia-noite UTC).
- Compra pendente que vira postada não aparece duplicada.
- Cofrinhos do Mercado Pago aparecem separados?
- Pix trazem CPF/CNPJ da contraparte?
