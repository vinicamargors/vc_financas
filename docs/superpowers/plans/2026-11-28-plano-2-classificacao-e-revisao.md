# Plano 2 — Classificação e revisão

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O total de gastos fica certo, sem transferência, fatura ou aporte contados como gasto. O app aprende nomes e categorias com a revisão da noite, e o Atalho do iPhone registra compras na hora.

**Architecture:** Um classificador puro (`src/lib/classify/*`) roda depois de cada sync sobre a janela sincronizada. Regras do usuário (`rules`) e estabelecimentos (`merchants`) ficam no Postgres com RLS. A tela Revisar escreve regras e reclassifica o histórico. O Atalho envia para `/api/ingest/shortcut` com token por usuário. A sync da Pluggy depois funde a compra do Atalho com a transação oficial.

**Spec:** `docs/superpowers/specs/2026-11-27-vc-financas-design.md` §6.3, §6.4, §6.9 (Revisão), §6.11 (histórico).

## Global Constraints
- Tudo dos Global Constraints do Plano 1 continua valendo: RLS, centavos, fuso de São Paulo, segredos fora do navegador e dos logs, app agnóstico.
- Anti-objetivo nº 1: transferência própria, fatura, aporte e resgate **nunca** entram em "gasto real". Na dúvida: `pending_review`, fora do total, mas visível.
- Classificação feita pelo usuário (`classified_by = 'user'`) nunca é sobrescrita pela automática.
- O `raw` da Pluggy pode ter CPF. Nunca vai para log.
- Valores de `kind`: `expense`, `income`, `transfer`, `card_payment`, `investment_in`, `investment_out`, `savings_yield`, `refund`, `pending_review`.

## Review Focus
1. Transferência entre contas do mesmo dono não pode virar gasto: pares casados e Pix para o próprio CPF.
2. Pagamento de fatura no Bradesco não pode contar de novo como gasto.
3. Reclassificar o histórico após "lembrar" não pode mexer em linhas classificadas pelo usuário.
4. Token do Atalho vazado ou de outro usuário não pode gravar em outra conta. O token fica salvo só como hash.
5. A compra do Atalho e a da Pluggy não podem virar duas linhas.

---

### Task 1: Esquema de classificação
- Migração `20261128000500_classification.sql`, idempotente:
  - `categories(id, user_id, name, icon text null, monthly_limit_cents null, unique(user_id,name), unique(id,user_id))`. As categorias padrão são criadas por uma função `seed_default_categories(uuid)`, chamada pelo trigger de `profiles` e também uma vez para os usuários que já existem: Alimentação, Mercado, Transporte, Combustível, Moradia, Contas, Saúde, Lazer, Compras, Assinaturas, Educação, Delivery, Viagem, Pets, Presentes, Outros.
  - `merchants(id, user_id, display_name, category_id null, unique(id,user_id))`.
  - `rules(id, user_id, match_field text check in ('description','counterparty_doc','counterparty_name'), pattern text, merchant_id null, category_id null, kind null, created_at, unique(user_id, match_field, pattern))`.
  - `transactions`: adicionar `classified_by text check in ('auto','user') default 'auto'`, `check (kind in (...))`, FKs compostas para `category_id` e `merchant_id`.
  - `profiles.cpf` já existe e passa a ser preenchido pela sync a partir de `account.taxNumber`, guardando só os dígitos.
  - `shortcut_tokens(user_id pk, token_hash text unique, created_at)`.
- Testes pgTAP: isolamento entre usuários e rejeição de FK cruzada (23503) em todas as tabelas novas; a função de seed cria 16 categorias.

### Task 2: Classificador puro
`src/lib/classify/classify.ts`:

```
classify(txs: ClassifyTx[], ctx: { ownerDocs: string[]; accounts: { id; type: 'BANK'|'CREDIT' }[]; rules: Rule[]; merchantsById }): Decision[]
```

`Decision = { id, kind, categoryId?, merchantId? }`. Só decide para linhas com `classified_by = 'auto'`. Ordem de aplicação:
1. **Regras do usuário.** Na descrição, compara com `prettyDescription` normalizado, sem acento e em minúsculas, e o padrão está contido no texto. No documento, a comparação é exata.
2. **Transferência para o próprio CPF/CNPJ:** `counterparty_doc` está em `ownerDocs` → `transfer`.
3. **Par casado:** uma saída e uma entrada de mesmo valor absoluto, em contas diferentes do usuário, com até 1 dia de diferença, ainda não pareadas → as duas viram `transfer` e ficam ligadas por `linked_transaction_id`.
4. **Pagamento de fatura:**
   - Saída em conta `BANK` com descrição que bate em `/pagamento.*fatura|pag(to)?\s*fatura|fatura.*cart|pagto cartao|pagamento cartao/i` → `card_payment`.
   - Crédito em conta `CREDIT` que bate em `/pagamento (recebido|efetuado)|pagto recebido|pagamento de fatura/i` → `card_payment`.
5. **Aporte e resgate:** `/aplica[cç][aã]o|apl\.|cofrinho|caixinha|guardar|investimento/` na saída → `investment_in`. `/resgate|resg\./` na entrada → `investment_out`. `savings_yield` continua como está.
6. **Estorno:** `/estorno|reembolso|devolu[cç][aã]o|chargeback/` na entrada → `refund`.
7. Sobra entrada → `income`.
8. Sobra saída → `expense`, com a categoria do merchant da regra ou da categoria da Pluggy mapeada (tabela `PLUGGY_TO_CATEGORY` com as categorias principais da Pluggy). Saída de R$ 1.000 ou mais sem par e sem regra, que seja Pix ou TED para pessoa física → `pending_review`.
- Testes com casos reais, ancorados em descrições do Bradesco, Nubank e Mercado Pago:
  - "PIX ENVIADO - DES: Vinicius Camargo Roch" com o próprio CPF → `transfer`.
  - Par R$ 2.000 entre Bradesco e Nubank → `transfer`.
  - Fatura → `card_payment`.
  - Pix de R$ 3.000 para desconhecido → `pending_review`.
  - Linha marcada pelo usuário fica intocada.

### Task 3: Aplicar na sync
- Depois de `upsertTransactions`, carregar a janela do item (a partir de `from` menos 3 dias, todas as contas do usuário, para os pares), rodar `classify` e gravar as decisões. Só linhas `auto`, numa função única do repositório `applyDecisions(userId, decisions)`.
- Ao sincronizar, gravar `profiles.cpf` a partir do `taxNumber` da conta, só os dígitos.
- Ação `reclassifyAll(userId)`, usada depois de criar uma regra: reprocessa os últimos 90 dias.
- Testes com o repositório em memória.

### Task 4: Revisão da noite e "ensinar lugares"
- `/revisar`, ligada à aba Início ("Revisar" com contador) e ao bloco "Revisar gastos" do Início.
- **Lista 1, "A confirmar":** linhas `pending_review` do ciclo e dos últimos 30 dias. Botões: Gasto, Transferência minha, Empréstimo (= `transfer` com categoria nenhuma), Outro.
- **Lista 2, "Novos lugares":** saídas `expense` sem `merchant_id`, agrupadas pela descrição normalizada, com as 20 mais frequentes primeiro. O usuário edita o nome amigável e escolhe a categoria.
- "Lembrar para as próximas" vem marcado por padrão. Ele cria o merchant e a regra (`description` contém o padrão normalizado), roda `reclassifyAll` e marca `classified_by = 'user'` só na linha editada.
- Visual do protótipo: cartões, chips e pílula de categoria. Os textos seguem o spec §6.9.
- Testes: a ação de revisão grava a regra, reclassifica e respeita as linhas do usuário.

### Task 5: Totais e exibição
- **Extrato:** mostra o nome do merchant quando houver, senão `prettyDescription`. Mostra a categoria pequena na segunda linha. `transfer` e `card_payment` aparecem neutros, com "Transferência" ou "Pagamento de fatura". `pending_review` ganha a etiqueta "a confirmar". No filtro Saídas entra só `expense`; no filtro Entradas entram `income` e `refund`.
- **Início:**
  - "Gasto real" dos últimos 30 dias: soma de `expense` menos `refund`.
  - Ao lado, "+ R$ X a confirmar" quando houver `pending_review`.
  - O bloco "Revisar gastos" mostra o contador.
- Testes de soma: transfer, card_payment e investment ficam fora.

### Task 6: Atalho do iPhone
- Em `/config/atalho`:
  - Botão "Gerar token". O token aparece uma única vez e é salvo como hash SHA-256.
  - Instruções passo a passo da automação "Transação" da Carteira: pegar o Valor e o Comerciante e fazer POST JSON para `${APP_URL}/api/ingest/shortcut` com o header `Authorization: Bearer <token>`.
  - Botão "Revogar".
- `POST /api/ingest/shortcut`:
  - Corpo `{ amount: string|number (aceita "R$ 9,00"), merchant: string, card?: string }`.
  - Valida o token pelo hash e grava uma transação `source='shortcut'` na conta `CREDIT` (cartão) quando der para inferir pelo nome do cartão. Senão, grava numa conta manual "Atalho" do tipo `MANUAL`, criada sob demanda.
  - `date` é hoje e `occurred_at` é agora. Classifica pelas regras.
  - Responde 401 sem token válido.
  - Limite: 60 chamadas por hora por usuário.
- **Fusão na sync:** quando a Pluggy traz uma compra no cartão com o mesmo valor, a mesma data (ou até 1 dia de diferença) e ainda sem par, a linha do Atalho é apagada (soft delete com `linked_transaction_id` apontando para a da Pluggy). Antes, o merchant e a categoria escolhidos pelo usuário passam para a linha da Pluggy.
- Testes: token inválido, parse de "R$ 1.234,56", fusão e isolamento entre usuários.
