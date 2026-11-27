# Plano 1 — Fundação e dados reais

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um usuário convidado entra no PWA, conecta seus bancos pelo assistente Pluggy e vê saldos por conta e o extrato real sincronizado todo dia.

**Architecture:** Next.js 15 (App Router) na Vercel, Supabase (Postgres + Auth + RLS). Pluggy acessado só no servidor com credenciais do próprio usuário, cifradas em repouso. Sync idempotente disparado por webhook (responde 200 e processa com `after()`) e por cron diário. Lógica de domínio em funções puras testadas com Vitest; isolamento entre usuários testado com pgTAP.

**Tech Stack:** Next.js 15.5, React 19, TypeScript strict, Tailwind CSS 4, Supabase (`@supabase/supabase-js` 2, `@supabase/ssr`), Supabase CLI (stack local via Docker), `pluggy-sdk`, `react-pluggy-connect`, Vitest, pgTAP, `date-fns` + `date-fns-tz`.

**Spec:** `docs/superpowers/specs/2026-11-27-vc-financas-design.md`

## Roteiro (este é o plano 1 de 6)

| Plano | Entrega |
|---|---|
| **1. Fundação e dados reais** | login por convite, PWA Liquid Glass, assistente Pluggy, sync, saldos, extrato cru |
| 2. Classificação e revisão | transferência própria, fatura, aporte/resgate, estorno, regras, merchants, Atalho iOS + deduplicação, revisão da noite, "ensinar 20 lugares" |
| 3. Ciclo e livre | salário, ciclos, compromissos, livre por dia, Dia do pagamento, renda extra |
| 4. Caixinhas e projeção | CDI (BCB), caixinhas, rendimento, metas, FGTS, projeções |
| 5. Análise | categorias, limites, extrato com filtros/calendário, relatório do ciclo |
| 6. Notificações e IA | push PWA, Gemini opt-in, avisos de consentimento/FGTS |

Cada plano é escrito depois que o anterior é entregue, usando o que se aprendeu.

## Global Constraints

- Custo zero: Vercel Hobby + Supabase Free + Meu Pluggy. Nenhuma dependência paga.
- Agnóstico: nenhum nome de banco, pessoa, categoria ou dia fixo no código; tudo vem de dados do usuário ou da Pluggy.
- Fuso: `America/Sao_Paulo`. Datas de transação gravadas como `date` local.
- Dinheiro em centavos inteiros (`bigint`), sinal: **negativo = saiu do usuário, positivo = entrou**.
- Toda tabela com `user_id uuid not null references auth.users on delete cascade` e RLS `user_id = auth.uid()`.
- Rotas com service role sempre filtram por `user_id` explicitamente.
- Client Secret da Pluggy nunca vai ao navegador; cifrado com AES-256-GCM (`CREDENTIALS_KEY`, 32 bytes base64).
- Webhook da Pluggy responde em < 10 s: valida, responde 200, processa em `after()`.
- Importação inicial: 90 dias.
- Interface em português do Brasil, moeda `R$ 1.234,56`.
- Visual Liquid Glass: vidro translúcido com `backdrop-filter`, números com contraste alto, fallback sólido em `prefers-reduced-transparency: reduce` e `prefers-reduced-motion: reduce`.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIALS_KEY`, `CRON_SECRET`, `APP_URL`.

## Review Focus

1. **Webhook repetido ou fora de ordem** → nenhuma transação duplicada (upsert por `(user_id, external_id)`). Teste na Task 6.
2. **Transação alterada ou apagada na Pluggy** (pendente → postada, valor muda, `transactions/deleted`) → linha atualizada ou marcada `deleted_at`, nunca duplicada. Teste na Task 6.
3. **Credencial inválida, item com erro ou consentimento expirado** → status da conexão atualizado e mostrado; cron segue para os outros usuários. Teste na Task 7.
4. **Vazamento entre usuários**, inclusive por rotas com service role (webhook identifica o usuário por segredo próprio). Testes nas Tasks 2 e 7.
5. **Transação às 23:30 de Brasília** (02:30Z do dia seguinte) → fica no dia local correto. Teste na Task 5.

---

### Task 1: Esqueleto do projeto e formatação de dinheiro

**Files:**
- Create: projeto Next.js na raiz (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `vitest.config.ts`, `.env.example`, `.gitignore`)
- Create: `src/lib/format/money.ts`, `src/lib/format/date.ts`
- Test: `src/lib/format/money.test.ts`, `src/lib/format/date.test.ts`

**Interfaces:**
- Produces: `formatBRL(cents: number | bigint, opts?: { hidden?: boolean; sign?: boolean }): string`; `toLocalDate(iso: string | Date): string` (retorna `YYYY-MM-DD` em `America/Sao_Paulo`); `TZ = 'America/Sao_Paulo'`.

- [ ] **Step 1:** `npx create-next-app@15.5 . --ts --tailwind --app --src-dir --eslint --use-npm --no-turbopack --import-alias "@/*"`; adicionar `vitest`, `@vitejs/plugin-react`, `date-fns`, `date-fns-tz`. `tsconfig` com `"strict": true`. `<html lang="pt-BR">`. `.env.example` com as env vars das Global Constraints.
- [ ] **Step 2: Testes que falham**

```ts
expect(formatBRL(123456)).toBe('R$ 1.234,56')
expect(formatBRL(-900)).toBe('-R$ 9,00')
expect(formatBRL(-900, { sign: true })).toBe('− 9,00')
expect(formatBRL(50000, { sign: true })).toBe('+ 500,00')
expect(formatBRL(123456, { hidden: true })).toBe('R$ •••')
expect(toLocalDate('2026-11-28T02:30:00Z')).toBe('2026-11-27')
expect(toLocalDate('2026-11-28T03:00:00Z')).toBe('2026-11-28')
```
- [ ] **Step 3:** `npx vitest run src/lib/format` → FAIL.
- [ ] **Step 4:** Implementar com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` e `formatInTimeZone`. Normalizar espaço não separável para espaço comum na saída.
- [ ] **Step 5:** `npx vitest run src/lib/format` → PASS; `npm run build` → sucesso.
- [ ] **Step 6:** Commit `feat: esqueleto Next.js e formatação BRL`.

---

### Task 2: Esquema do banco e isolamento por usuário

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/migrations/20261127000100_core.sql`
- Test: `supabase/tests/rls.test.sql`

**Interfaces:**
- Produces (tabelas):
  - `profiles(user_id pk, display_name text, cpf text null, hide_values bool default false, created_at)`
  - `allowed_emails(email text pk, invited_by uuid null, created_at)` — sem RLS de usuário; só service role.
  - `pluggy_credentials(user_id pk, client_id text, client_secret_enc text, webhook_secret text unique, webhook_id text null, updated_at)`
  - `connections(id uuid pk, user_id, pluggy_item_id text, connector_name text, status text, status_detail text null, consent_expires_at timestamptz null, last_synced_at timestamptz null, created_at, unique(user_id, pluggy_item_id))`
  - `accounts(id uuid pk, user_id, connection_id → connections, external_id text, type text check in ('BANK','CREDIT','INVESTMENT','MANUAL'), subtype text, name text, institution text, balance_cents bigint, credit_limit_cents bigint null, closing_day smallint null, due_day smallint null, cdi_percent numeric null, updated_at, unique(user_id, external_id))`
  - `transactions(id uuid pk, user_id, account_id → accounts, external_id text null, source text check in ('pluggy','shortcut','manual'), date date, amount_cents bigint, description_raw text, pluggy_category text null, counterparty_name text null, counterparty_doc text null, payment_method text null, installment_number smallint null, installment_total smallint null, card_last4 text null, kind text null, category_id uuid null, merchant_id uuid null, linked_transaction_id uuid null, status text null, deleted_at timestamptz null, raw jsonb, created_at, updated_at, unique(user_id, external_id))`
  - `balance_snapshots(user_id, account_id, date date, balance_cents bigint, primary key(account_id, date))`
  - índices: `transactions(user_id, date desc)`, `transactions(account_id, date)`.

- [ ] **Step 1: Teste pgTAP que falha** em `supabase/tests/rls.test.sql`: cria usuários A e B em `auth.users`, insere uma linha de cada tabela para A; com `set local role authenticated` + `request.jwt.claims` de B:
  - `select count(*) from transactions` = 0 (idem `accounts`, `connections`, `pluggy_credentials`, `balance_snapshots`, `profiles` de A).
  - `insert into transactions(user_id, ...) values (<A>, ...)` → `throws_ok` (RLS).
  - `select count(*) from allowed_emails` como authenticated → 0 linhas visíveis.
  - Como A: vê exatamente 1 transação.
- [ ] **Step 2:** `npx supabase start && npx supabase test db` → FAIL (tabelas não existem).
- [ ] **Step 3:** Escrever a migration: tabelas acima, `enable row level security` em todas, políticas `for all using (user_id = auth.uid()) with check (user_id = auth.uid())`; `allowed_emails` com RLS ligada e nenhuma política; trigger `updated_at`; trigger em `auth.users` que cria `profiles`.
- [ ] **Step 4:** `npx supabase db reset && npx supabase test db` → PASS.
- [ ] **Step 5:** Commit `feat: esquema core com RLS`.

---

### Task 3: Login por convite (link mágico)

**Files:**
- Create: `supabase/migrations/20261127000200_invite_hook.sql`; modificar `supabase/config.jsonc` (hook `before_user_created`)
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/admin.ts`, `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/auth/callback/route.ts`
- Test: `supabase/tests/invite_hook.test.sql`

**Interfaces:**
- Produces: `createServerSupabase(): SupabaseClient` (sessão do usuário via cookies); `createAdminSupabase(): SupabaseClient` (service role, só servidor, `import 'server-only'`); `requireUser(): Promise<{ id: string; email: string }>` (redireciona para `/login`).
- Função SQL `public.hook_before_user_created(event jsonb) returns jsonb`.

- [ ] **Step 1: Teste pgTAP que falha:** com `allowed_emails` contendo `a@x.com`:
  - `hook_before_user_created('{"user":{"email":"a@x.com"}}')` → `'{}'::jsonb`.
  - `hook_before_user_created('{"user":{"email":"B@Y.com"}}')` → `->'error'->>'http_code' = '403'`.
  - Comparação de e-mail sem diferenciar maiúsculas.
- [ ] **Step 2:** `npx supabase test db` → FAIL.
- [ ] **Step 3:** Implementar a função (`security definer`, `grant execute ... to supabase_auth_admin`), ligar o hook no `config.jsonc`. Mensagem de erro: `"Este e-mail não foi convidado."`
- [ ] **Step 4:** `npx supabase test db` → PASS.
- [ ] **Step 5:** Clientes Supabase com `@supabase/ssr`; `middleware.ts` renova sessão e manda não logados de qualquer rota (exceto `/login`, `/auth/*`, `/api/webhooks/*`, `/api/cron/*`, `/manifest.webmanifest`, ícones) para `/login`. Página de login: campo e-mail + "Enviar link"; após envio: "Enviamos um link para seu e-mail." Erro de convite mostra a mensagem do hook.
- [ ] **Step 6:** Verificação manual com stack local: `insert into allowed_emails values ('teste@local')`; pedir link; abrir no Inbucket (`http://localhost:54324`); cair em `/` logado. E-mail não convidado vê "Este e-mail não foi convidado."
- [ ] **Step 7:** Commit `feat: login por convite com link mágico`.

---

### Task 4: Cofre de credenciais

**Files:**
- Create: `src/lib/crypto/secret-box.ts`
- Test: `src/lib/crypto/secret-box.test.ts`

**Interfaces:**
- Produces: `seal(plain: string, keyB64?: string): string` (formato `v1.<iv_b64>.<tag_b64>.<ct_b64>`); `open(sealed: string, keyB64?: string): string`; chave padrão `process.env.CREDENTIALS_KEY`. Arquivo com `import 'server-only'`.

- [ ] **Step 1: Testes que falham:**
  - `open(seal('segredo', k), k) === 'segredo'`.
  - Duas chamadas `seal('x', k)` produzem saídas diferentes (IV aleatório).
  - Alterar um caractere do `ct` → `open` lança erro.
  - Chave com tamanho ≠ 32 bytes → lança `'CREDENTIALS_KEY inválida'`.
- [ ] **Step 2:** `npx vitest run src/lib/crypto` → FAIL.
- [ ] **Step 3:** Implementar com `node:crypto` `aes-256-gcm`, IV de 12 bytes.
- [ ] **Step 4:** `npx vitest run src/lib/crypto` → PASS.
- [ ] **Step 5:** Commit `feat: cifra de credenciais AES-GCM`.

---

### Task 5: Adaptador Pluggy e mapeamento

**Files:**
- Create: `src/lib/pluggy/source.ts`, `src/lib/pluggy/map.ts`
- Test: `src/lib/pluggy/map.test.ts`, `src/lib/pluggy/fixtures.ts`

**Interfaces:**
- Consumes: `open` (Task 4), `toLocalDate` (Task 1), `createAdminSupabase` (Task 3).
- Produces:
  - `interface PluggySource { fetchItem(id): Promise<Item>; listItems(): Promise<Item[] | 'unsupported'>; fetchAccounts(itemId): Promise<Account[]>; fetchTransactions(accountId, from: string /*YYYY-MM-DD*/): Promise<Transaction[]>; createConnectToken(): Promise<string>; registerWebhook(url: string, secret: string): Promise<string /*webhookId*/> }` (tipos do `pluggy-sdk`).
  - `createPluggySource(clientId: string, clientSecret: string): PluggySource` — usa `PluggyClient`; `listItems` usa `fetchAllItems()` e retorna `'unsupported'` em 401/403/404.
  - `loadPluggySource(userId: string): Promise<PluggySource>` — lê `pluggy_credentials` com admin client, `open()` o segredo.
  - `testCredentials(clientId, clientSecret): Promise<{ ok: true } | { ok: false; reason: 'invalid' | 'network' }>`.
  - `mapAccount(a: Account, ctx: { userId: string; connectionId: string; institution: string }): AccountRow`
  - `mapTransaction(t: Transaction, ctx: { userId: string; accountRowId: string; accountType: 'BANK' | 'CREDIT' }): TransactionRow`
  - Tipos `AccountRow`, `TransactionRow` espelhando as colunas da Task 2 (camelCase → snake_case no repositório).

- [ ] **Step 1: Testes que falham** (fixtures com objetos `Transaction`/`Account` do SDK):
  - Débito em conta: `type 'DEBIT', amount -9` → `amountCents === -900`.
  - Compra no cartão: conta `CREDIT`, `type 'DEBIT', amount 9` → `amountCents === -900`.
  - Pagamento recebido no cartão: `type 'CREDIT', amount -1360` → `amountCents === 136000`.
  - Pix recebido: `type 'CREDIT', amount 300` → `+30000`; `counterpartyName/Doc` vêm de `paymentData.payer`.
  - Pix enviado: contraparte vem de `paymentData.receiver`; `counterpartyDoc` só dígitos.
  - `date: new Date('2026-11-28T02:30:00Z')` → `date === '2026-11-27'`.
  - `creditCardMetadata { installmentNumber: 3, totalInstallments: 12, cardNumber: '1234' }` → `installmentNumber 3`, `installmentTotal 12`, `cardLast4 '1234'`.
  - `externalId === t.id`, `source === 'pluggy'`, `descriptionRaw === t.descriptionRaw ?? t.description`, `pluggyCategory === t.category`, `raw` contém o objeto original.
  - `mapAccount`: `balance 300.5` → `balanceCents 30050`; `creditData.balanceCloseDate`/`balanceDueDate` → `closingDay`/`dueDay` (dia do mês) quando presentes.
- [ ] **Step 2:** `npx vitest run src/lib/pluggy` → FAIL.
- [ ] **Step 3:** Implementar. Sinal: `Math.abs(amount)` com `-` para `type 'DEBIT'` e `+` para `'CREDIT'`; centavos com `Math.round(x * 100)`.
- [ ] **Step 4:** `npx vitest run src/lib/pluggy` → PASS.
- [ ] **Step 5:** Commit `feat: adaptador Pluggy e mapeamento de contas e transações`.

---

### Task 6: Sincronização idempotente

**Files:**
- Create: `src/lib/sync/sync-item.ts`, `src/lib/sync/repo.ts`, `src/lib/sync/memory-repo.ts`
- Test: `src/lib/sync/sync-item.test.ts`

**Interfaces:**
- Consumes: `PluggySource`, `mapAccount`, `mapTransaction` (Task 5).
- Produces:
  - `interface SyncRepo { getConnection(userId, itemId): Promise<ConnectionRow | null>; upsertConnection(row): Promise<ConnectionRow>; upsertAccounts(rows: AccountRow[]): Promise<{ id: string; externalId: string; type: string }[]>; upsertTransactions(rows: TransactionRow[]): Promise<number>; markTransactionsDeleted(userId, externalIds: string[]): Promise<void>; upsertBalanceSnapshot(userId, accountId, date, balanceCents): Promise<void> }` (conflict target `user_id,account_id,date`)
  - `createSupabaseSyncRepo(admin: SupabaseClient): SyncRepo` (upserts com `onConflict: 'user_id,external_id'`).
  - `createMemoryRepo(): SyncRepo & { dump(): {...} }` (para testes).
  - `syncItem(deps: { source: PluggySource; repo: SyncRepo; today: string }, userId: string, itemId: string): Promise<{ accounts: number; transactions: number; status: string }>` — `from` = `last_synced_at − 3 dias`, ou `today − 90 dias` na primeira vez; atualiza `connections.status/status_detail/consent_expires_at/last_synced_at`; grava snapshot de saldo do dia por conta.
  - `deleteTransactions(deps, userId, externalIds: string[]): Promise<void>`.

- [ ] **Step 1: Testes que falham** (fonte falsa + `createMemoryRepo`):
  - Primeira sync com `today '2026-11-27'` chama `fetchTransactions(accId, '2026-08-29')`.
  - Rodar `syncItem` duas vezes com os mesmos dados → mesma contagem de transações no repo.
  - Segunda execução com a transação `t1` alterada (`amount` diferente, `status 'POSTED'`) → 1 linha, valores novos.
  - `deleteTransactions(['t1'])` → `t1.deletedAt` preenchido; demais intactas.
  - Item com `status 'LOGIN_ERROR'` → conexão gravada com esse status, sem buscar contas, retorno `status: 'LOGIN_ERROR'`.
  - Snapshot de saldo do dia gravado para cada conta; sync repetida no mesmo dia sobrescreve.
  - Segunda sync usa `from = last_synced_at − 3 dias`.
- [ ] **Step 2:** `npx vitest run src/lib/sync` → FAIL.
- [ ] **Step 3:** Implementar `syncItem`, `deleteTransactions`, os dois repositórios.
- [ ] **Step 4:** `npx vitest run src/lib/sync` → PASS.
- [ ] **Step 5:** Commit `feat: sincronização idempotente de itens Pluggy`.

---

### Task 7: Webhook e cron

**Files:**
- Create: `src/app/api/webhooks/pluggy/route.ts`, `src/app/api/cron/daily/route.ts`, `src/lib/sync/handlers.ts`, `vercel.json`
- Test: `src/lib/sync/handlers.test.ts`

**Interfaces:**
- Consumes: `syncItem`, `deleteTransactions` (Task 6), `loadPluggySource` (Task 5).
- Produces:
  - `handlePluggyWebhook(deps: { findUserByWebhookSecret(secret: string): Promise<string | null>; schedule(fn: () => Promise<void>): void; runSync(userId, itemId): Promise<unknown>; runDelete(userId, ids: string[]): Promise<void> }, req: { secret: string | null; body: unknown }): Promise<{ status: 200 | 401 | 400 }>`
  - `runDailySync(deps: { listConnections(): Promise<{ userId: string; itemId: string }[]>; runSync(userId, itemId): Promise<unknown>; log(e: unknown): void }): Promise<{ ok: number; failed: number }>`
  - Webhook: header `x-vc-secret` = `pluggy_credentials.webhook_secret`. Eventos tratados: `item/updated`, `transactions/created`, `transactions/updated` → `runSync`; `transactions/deleted` → `runDelete(body.transactionIds)`; outros → 200 sem ação.
  - Cron: `GET` com `Authorization: Bearer ${CRON_SECRET}`; `vercel.json`: `{"crons":[{"path":"/api/cron/daily","schedule":"0 9 * * *"}]}` (06:00 em Brasília).

- [ ] **Step 1: Testes que falham:**
  - Segredo ausente ou desconhecido → `401`, nada agendado.
  - Body sem `event`/`itemId` → `400`.
  - `item/updated` válido → `200` e `schedule` chamado uma vez; ao rodar o agendado, `runSync(userDoSegredo, itemId)`.
  - `transactions/deleted` com `transactionIds ['a','b']` → `runDelete(user, ['a','b'])`.
  - O handler retorna antes de `runSync` terminar (agendado, não aguardado).
  - `runDailySync` com 3 conexões onde a 2ª lança erro → `{ ok: 2, failed: 1 }`, `log` chamado uma vez, 3ª executada.
- [ ] **Step 2:** `npx vitest run src/lib/sync/handlers` → FAIL.
- [ ] **Step 3:** Implementar handlers; rotas usam `after()` de `next/server` como `schedule`; cron devolve `401` sem o bearer correto.
- [ ] **Step 4:** `npx vitest run src/lib/sync` → PASS.
- [ ] **Step 5:** Commit `feat: webhook Pluggy e sync diária`.

---

### Task 8: Assistente "Conectar bancos"

**Files:**
- Create: `src/app/(app)/config/bancos/page.tsx`, `src/app/(app)/config/bancos/actions.ts`, `src/app/(app)/config/bancos/connect-widget.tsx`, `src/lib/pluggy/onboarding.ts`
- Test: `src/lib/pluggy/onboarding.test.ts`

**Interfaces:**
- Consumes: `testCredentials`, `createPluggySource`, `loadPluggySource` (Task 5); `seal` (Task 4); `syncItem` (Task 6); `requireUser` (Task 3).
- Produces:
  - `saveCredentials(deps, userId, clientId, clientSecret): Promise<{ ok: true } | { ok: false; message: string }>` — testa, cifra, gera `webhook_secret` (32 bytes hex), registra webhook `${APP_URL}/api/webhooks/pluggy` com header `x-vc-secret`, salva.
  - `discoverItems(deps, userId): Promise<{ mode: 'listed'; itemIds: string[] } | { mode: 'widget'; connectToken: string }>`
  - `addItem(deps, userId, itemId): Promise<void>` — cria conexão e roda primeira sync.
  - Server actions finas sobre essas funções.

- [ ] **Step 1: Testes que falham** (deps falsas):
  - `saveCredentials` com credencial inválida → `{ ok: false, message: 'Client ID ou Secret incorretos. Confira no dashboard da Pluggy.' }`, nada salvo.
  - Válida → linha salva com `client_secret_enc` diferente do segredo puro e `open()` devolvendo o original; `registerWebhook` chamado com a URL e o segredo salvo.
  - `discoverItems` com `listItems` → `['i1','i2']` → modo `listed`; com `'unsupported'` → modo `widget` com token.
  - `addItem` duas vezes com o mesmo item → uma conexão.
- [ ] **Step 2:** `npx vitest run src/lib/pluggy/onboarding` → FAIL.
- [ ] **Step 3:** Implementar funções e a página em 3 passos (texto do spec §6.12): (1) Meu Pluggy + bancos, link `https://meu.pluggy.ai`; (2) campos Client ID/Secret + botão "Testar e salvar", link `https://dashboard.pluggy.ai`; (3) "Entrar com o Meu Pluggy": se `listed`, mostra os itens encontrados e um botão "Usar estes"; se `widget`, abre `PluggyConnect` (`react-pluggy-connect`) com o token e chama `addItem` no `onSuccess`; em ambos, campo de reserva "Colar Item ID".
- [ ] **Step 4:** `npx vitest run src/lib/pluggy` → PASS.
- [ ] **Step 5:** Commit `feat: assistente de conexão Pluggy`.

---

### Task 9: Casca do app — PWA e Liquid Glass

**Files:**
- Create: `src/app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`, `src/app/(app)/layout.tsx`, `src/components/glass/glass-card.tsx`, `src/components/glass/tab-bar.tsx`, `src/components/money.tsx`, `src/components/hide-values.tsx`; modificar `src/app/globals.css`
- Test: `src/components/money.test.tsx`

**Interfaces:**
- Consumes: `formatBRL` (Task 1).
- Produces: `<GlassCard as? className?>`; `<TabBar active: 'inicio' | 'extrato' | 'categorias' | 'caixinhas'>` (Categorias e Caixinhas desabilitadas com "em breve" até os planos 4–5); `<HideValuesProvider initial: boolean>` + `useHideValues(): { hidden: boolean; toggle(): void }` (persiste em `profiles.hide_values` via server action); `<Money cents sign?>` que respeita `hidden`.

- [ ] **Step 1: Teste que falha** (`@testing-library/react`, ambiente `jsdom`):
  - `<Money cents={123456}/>` → texto `R$ 1.234,56`.
  - Dentro de `HideValuesProvider initial={true}` → `R$ •••`.
  - Clicar no botão de olho alterna entre os dois.
- [ ] **Step 2:** `npx vitest run src/components` → FAIL.
- [ ] **Step 3:** Implementar. Tokens em `globals.css` (`:root` claro, `prefers-color-scheme: dark` escuro): `--glass-bg` translúcido, `--glass-border` com brilho, `backdrop-filter: blur(20px) saturate(180%)`; fundo com gradiente suave para o vidro ter o que desfocar. `@media (prefers-reduced-transparency: reduce)` → `--glass-bg` opaco e sem `backdrop-filter`. TabBar flutuante, fixa embaixo, respeitando `env(safe-area-inset-bottom)`. Manifest: `name 'VC Finanças'`, `display 'standalone'`, `start_url '/'`, `lang 'pt-BR'`; metas `apple-mobile-web-app-capable`.
- [ ] **Step 4:** `npx vitest run src/components` → PASS; `npm run build` → sucesso.
- [ ] **Step 5:** Commit `feat: casca PWA com Liquid Glass`.

---

### Task 10: Início (saldo por conta) e Extrato cru

**Files:**
- Create: `src/lib/queries/balances.ts`, `src/lib/queries/statement.ts`, `src/app/(app)/page.tsx`, `src/app/(app)/extrato/page.tsx`, `src/components/connection-status.tsx`
- Test: `src/lib/queries/balances.test.ts`, `src/lib/queries/statement.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase`, `requireUser` (Task 3); `GlassCard`, `Money`, `TabBar` (Task 9).
- Produces:
  - `summarizeCheckingBalances(accounts: { institution: string; type: string; subtype: string; balanceCents: number; updatedAt: string }[]): { totalCents: number; byInstitution: { institution: string; balanceCents: number }[]; updatedAt: string | null }` — só `type 'BANK'` e `subtype 'CHECKING_ACCOUNT'`; soma por instituição; ordenado por saldo desc; `updatedAt` = o mais antigo.
  - `groupByDay(txs: { date: string; amountCents: number; deletedAt: string | null }[]): { date: string; totalCents: number; items: ... }[]` — ignora apagadas; dias desc.
  - Páginas: Início mostra "Saldo em conta" (total, por banco, "atualizado HH:mm") + status de conexões com problema; Extrato lista por dia (descrição crua, banco/cartão, valor com sinal, parcela `3/12` quando houver).

- [ ] **Step 1: Testes que falham:**
  - Bradesco corrente 30000 + Nubank corrente 30000 + cartão Nubank −136000 + poupança 5000 → `totalCents 60000`, 2 instituições.
  - Duas contas correntes do mesmo banco somam numa linha.
  - Lista vazia → `{ totalCents: 0, byInstitution: [], updatedAt: null }`.
  - `groupByDay` ignora `deletedAt` preenchido e soma o total do dia.
- [ ] **Step 2:** `npx vitest run src/lib/queries` → FAIL.
- [ ] **Step 3:** Implementar funções e páginas. `ConnectionStatus` mostra conexões com `status` ≠ `UPDATED`: "Bradesco: reconecte seu banco" com link para `/config/bancos`; consentimento a ≤ 30 dias de expirar: "Renovar até dd/mm".
- [ ] **Step 4:** `npx vitest run` (suíte toda) → PASS; `npm run build` → sucesso.
- [ ] **Step 5:** Commit `feat: início com saldo por conta e extrato`.

---

### Task 11: Deploy e validação com dados reais

**Files:**
- Create: `README.md` (setup), `docs/superpowers/spikes/2026-11-27-pluggy-real.md`

- [ ] **Step 1:** Com o dono: criar projeto Supabase Free e projeto Vercel Hobby ligado ao repo; `npx supabase db push`; configurar env vars; ativar o hook `before_user_created` no painel; inserir e-mail do dono em `allowed_emails`; gerar `CREDENTIALS_KEY` (`openssl rand -base64 32`) e `CRON_SECRET`.
- [ ] **Step 2:** Dono instala o PWA no iPhone (Safari → Compartilhar → Adicionar à Tela de Início), faz login e completa o assistente.
- [ ] **Step 3:** Verificar: saldos de Bradesco e Nubank batem com os apps dos bancos; extrato dos últimos 90 dias presente; nenhuma transação duplicada após um segundo sync manual (`curl -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/daily`).
- [ ] **Step 4:** Registrar no arquivo de spike as respostas aos riscos do spec §8: (1) passo 3 do assistente caiu em `listed` ou `widget`? (2) cofrinhos do Mercado Pago aparecem como conta/investimento separado? (3) Pix trazem `paymentData` com documento da contraparte? Incluir exemplos anonimizados (sem nomes, CPFs ou valores reais).
- [ ] **Step 5:** Commit `docs: setup e resultados com dados reais`.
