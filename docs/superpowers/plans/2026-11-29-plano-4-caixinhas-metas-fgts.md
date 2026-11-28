# Plano 4 — Caixinhas, metas, FGTS e projeção

**Goal:** O usuário vê quanto cada caixinha rendeu de verdade, acompanha metas (ex.: Casa = caixinha + FGTS) e lê "nesse ritmo, em jan/2028 você terá R$ X", em três cenários, com valor bruto e líquido de IR.

**Spec:** `docs/superpowers/specs/2026-11-27-vc-financas-design.md`: decisões 10–12; §6.7 e §6.8.

## Global Constraints
- Tudo dos planos anteriores continua valendo: RLS com FK composta, centavos, fuso de São Paulo, app agnóstico, nenhum segredo ou CPF em log, valores sempre pelo `<Money>`, esqueleto de carregamento nas telas novas e migração idempotente colada à mão no SQL Editor.
- **Rendimento real de uma caixinha** = saldo de hoje − saldo da primeira foto + resgates − aportes no período. Aportes e resgates vêm dos lançamentos `investment_in`/`investment_out` da mesma conta. Sem dados suficientes, a tela diz "desde dd/mm" e mostra só o que se sabe.
- **Projeção:** juros compostos mensais, com taxa = CDI anual × % do CDI. Aporte mensal no fim de cada mês. IR pela tabela regressiva sobre o ganho: até 180 dias 22,5%, até 360 dias 20%, até 720 dias 17,5%, acima disso 15%. Na projeção, a alíquota é aplicada pelo prazo até a data-alvo.
- **FGTS:** o saldo é informado à mão. A estimativa mensal é 8% × (salário líquido do ciclo × razão bruto/líquido de referência). O rendimento é 3% ao ano + TR, com TR = 0 por padrão, simplificação que a tela deixa explícita. O saldo informado substitui a estimativa. Um lembrete aparece a cada 90 dias.
- Os cenários usam o ritmo atual (média dos aportes líquidos nos últimos 3 ciclos), o aporte planejado mínimo e o aporte planejado máximo.

## Tasks

### Task 1: Esquema
Migração `20261129000300_goals_fgts.sql`:
- `goals(id, user_id, name, target_cents null, target_date date null, planned_min_cents null, planned_max_cents null, include_fgts bool default false, created_at, unique(id,user_id))`
- `goal_boxes(user_id, goal_id, box_id, pk(goal_id, box_id))`, com FKs compostas para `goals` e `savings_boxes`
- `fgts(user_id pk, balance_cents bigint, balance_date date, gross_salary_cents bigint null, reference_net_cents bigint null, updated_at)`
- RLS e pgTAP: isolamento entre usuários e FK cruzada

### Task 2: Cálculos puros (`src/lib/invest/`)
- `realYield(snapshots, flows)` → `{ sinceDate, yieldCents }`
- `projectMonthly({ startCents, monthlyCents, annualRatePct, months })` → série mensal com bruto, ganho, IR e líquido
- `irRate(days)`
- `fgtsEstimate({ balanceCents, balanceDate, today, monthlyNetSalaries[], grossToNetRatio })`
- `scenarios(...)`
- Testes com valores conferidos à mão: 18.400 a 105% do CDI de 14,9%, com 1.500/mês, por 14 meses

### Task 3: Consultas e telas
- **/caixinhas:**
  - **Consolidado:** total, rendimento real desde a primeira foto, rendimento por dia útil e projeção do total.
  - **Lista:** cada caixinha leva a `/caixinhas/[id]`.
- **/caixinhas/[id]:** saldo, % do CDI, rendimento real, gráfico SVG da projeção com 3 cenários (escala de valores correta, cores pelos tokens do tema) e o histórico de saldo.
- **/metas:**
  - **Lista e criação de metas:** nome, caixinhas da meta, incluir FGTS sim/não, aporte planejado mínimo/máximo e alvo opcional.
  - **Detalhe da meta:** caixinhas e FGTS separados, "Potencial" somado, os 3 cenários até a data-alvo (ou jan do ano seguinte + 1) e "este ciclo: guardou R$ X de R$ Y".
- **/config/fgts:** saldo, data do saldo, salário bruto e o líquido de referência (sugerido pelo último salário reconhecido). Lembrete no Início quando o saldo tiver mais de 90 dias.
- **Início:** o bloco Caixinhas mostra o total. Se houver meta, mostra o "Potencial" dela.
- Links em Bancos, na seção de configurações: FGTS e Metas.
