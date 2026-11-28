# Plano 3 — Ciclo do salário, compromissos e "livre por dia"

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** O Início responde "posso gastar hoje?" com o **livre por dia** do ciclo de salário a salário. A tela Dia do pagamento mostra a distribuição do salário marcada automaticamente. Os compromissos do mês são do usuário e configuráveis.

**Spec:** `docs/superpowers/specs/2026-11-27-vc-financas-design.md`: decisões 2, 4–8; §6.5 e §6.6.

## Global Constraints
- Tudo do Plano 1 e do Plano 2 continua valendo: RLS, centavos, fuso de São Paulo, app agnóstico, nada de CPF ou segredo em log, `classified_by='user'` intocável.
- **Livre = caixa.** Compra no cartão não reduz o livre do ciclo. A fatura reduz quando é paga (`card_payment` no banco) ou, enquanto não foi paga, pela estimativa da fatura do ciclo, que é a soma das compras do cartão do ciclo anterior. Transferência própria, aporte, resgate e `savings_yield` ficam fora.
- **Ciclo:** começa no dia em que o salário caiu e termina na véspera do próximo salário previsto. Sem salário configurado, o ciclo é o mês do calendário.
- **Dias úteis:** feriados nacionais brasileiros, fixos e móveis (Carnaval segunda e terça, Sexta-feira Santa, Corpus Christi), calculados pela Páscoa. Sem API externa.
- Tudo configurável por usuário, nada fixo no código.
- Migração idempotente, colada à mão no SQL Editor.

## Review Focus
1. Mês em que o salário ainda não caiu: o ciclo usa a data prevista, e o livre não pode ficar negativo por engano.
2. Dois créditos do mesmo pagador no mesmo mês (salário e PLR): só o salário abre o ciclo. O resto é renda extra.
3. Fatura paga no ciclo não pode descontar duas vezes (estimativa e pagamento).
4. Compromisso de valor fixo casado por contraparte não pode casar com o Pix errado de outro mês.
5. Remover uma conexão não pode deixar lançamentos órfãos nem afetar outro usuário.

---

### Task 1: Remover conexão
- Na tela Bancos, cada conexão listada (banco, status, "dados do banco de …") ganha o botão **Remover**, com confirmação dentro da própria página (o app não usa `confirm()`).
- Server action `removeConnection(connectionId)`:
  - O usuário vem de `requireUser()`.
  - Usa o client admin com filtro por `user_id`. O cascade apaga contas, lançamentos e snapshots.
  - Antes, apaga as caixinhas das contas (o FK em cascata já cobre; confirme).
  - Não mexe no webhook nem nas credenciais.
- Testes: só remove a conexão do próprio usuário, e conexão de outro usuário não é afetada.

### Task 2: Esquema
Migração `20261129000200_cycle.sql`:
- **`income_sources`**: `id, user_id, payer_doc text null, payer_name text null, kind text check in ('salary','extra'), date_rule text check in ('penultimate_business_day','last_business_day','fifth_business_day','fixed_day') default 'penultimate_business_day', fixed_day smallint null, created_at, unique(id,user_id)`.
- **`commitments`**:
  - Campos: `id, user_id, name text, kind text check in ('fixed','category_budget','percent_of_income'), amount_cents bigint null, percent numeric null, percent_base text check in ('salary','all') default 'salary', category_id null, match_counterparty text null, active bool default true, sort smallint default 0, created_at, unique(id,user_id)`.
  - FK composta para `category_id`.
- **`transactions.income_source_id`** (FK composta, pode ser nula).
- RLS nas tabelas novas e testes pgTAP de isolamento entre usuários e FK cruzada.

### Task 3: Calendário e ciclo (puro)
`src/lib/cycle/`:
- `businessDays.ts`:
  - `isBusinessDay(date)`.
  - `nationalHolidays(year)`: datas fixas, mais Carnaval segunda e terça, Sexta-feira Santa e Corpus Christi a partir da Páscoa.
  - `expectedPayday(year, month, rule, fixedDay?)`.
- `cycle.ts`: `currentCycle({ today, salaryDates: string[], rule, fixedDay })` devolve `{ start, end, nextPayday, source: 'salary'|'expected'|'calendar' }`.
  - `start` = último salário em até 40 dias. Se não houver, a data prevista do mês (ou do mês anterior, se ainda não chegou).
  - `end` = véspera do próximo salário previsto.
- Testes com 2026:
  - Penúltimo dia útil de novembro/2026 = 27/11 (sexta), porque 30/11 é segunda e é o último.
  - Feriados de 2026: Carnaval 16 e 17/02, Sexta-feira Santa 03/04, Corpus Christi 04/06.
  - Virada de ano.
  - Salário atrasado.

### Task 4: Salário e renda extra
- Na classificação (Plano 2), uma entrada cujo `counterparty_doc` ou nome bate com uma `income_sources` vira `income` com `income_source_id`.
- Numa fonte `salary`, a maior entrada do pagador perto da data prevista (±5 dias) é o salário. As outras do mesmo pagador no ciclo são renda extra.
- Tela `/config/salario`:
  - Lista as entradas de R$ 1.000 ou mais dos últimos 90 dias, agrupadas por pagador.
  - Botão "É meu salário".
  - Escolha da regra de data.
  - Lista as fontes salvas, com opção de remover.
  - Atalho no Início quando não houver salário configurado: "Configure seu salário para calcular o livre por dia".
- Testes de reconhecimento: salário e PLR do mesmo pagador.

### Task 5: Compromissos e livre (puro e consultas)
`src/lib/cycle/free.ts`:

```
computeFree({ cycle, today, salaryCents, extrasCents, commitments, txs, cardEstimateCents, cardPaidCents })
```

Devolve `{ freeCents, freePerDayCents, daysLeft, commitments: [{ id, name, expectedCents, paidCents, status: 'done'|'partial'|'todo' }], cardThisCycleCents }`.
- Valor de cada tipo de compromisso:
  - `fixed`: esperado = valor. Pago = saídas do ciclo cuja contraparte ou descrição normalizada contém `match_counterparty`.
  - `category_budget`: esperado = valor. Pago = gastos da categoria no ciclo.
  - `percent_of_income`: esperado = % do salário (ou de toda a renda).
- Fatura: esperado = `max(cardEstimate, cardPaid)`. Pago = `cardPaid`. Não conta duas vezes.
- Saídas no caixa fora de compromissos: `expense` em conta `BANK` (Pix, débito, boleto) que não casou com nenhum compromisso, mais `pending_review` de saída.
- Livre = salário + extras − Σ max(esperado, pago) dos compromissos − saídas no caixa fora de compromissos. O `category_budget` reserva o valor, e o excesso sai do livre.
- Livre por dia = livre ÷ dias restantes, incluindo hoje. Mínimo de 0 por dia: o valor negativo aparece em vermelho, sem dividir.
- `cardThisCycleCents` = compras no cartão no ciclo (informativo).
- Testes cobrindo os itens do Review Focus.

### Task 6: Telas
- **Início:**
  - O número principal passa a ser **"Livre por dia"**, com a linha "R$ X livre até dd/mm".
  - Embaixo: "Cartão neste ciclo: R$ X → próximo salário".
  - O saldo em conta vira um bloco secundário.
  - Sem salário configurado, aparece o atalho para configurar.
- **`/pagamento` (Dia do pagamento):**
  - Mostra salário recebido, lista de compromissos com ✓, ½ ou ☐ e valores, e "Livre até o próximo salário".
  - Visual do protótipo `docs/design/2026-11-28-redesign.html`.
  - Acesso por um bloco no Início nos 3 dias depois do salário e por um link em Bancos.
- **`/config/compromissos`:** criar, editar, desativar e reordenar compromissos (os três tipos), com a escolha da categoria e o texto da contraparte.
- Esqueletos de carregamento em todas as telas novas.
