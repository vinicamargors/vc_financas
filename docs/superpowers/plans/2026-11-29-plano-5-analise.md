# Plano 5 — Gastos e relatório

**Goal:** Responder "para onde foi o dinheiro". A aba **Gastos** mostra as categorias do ciclo com limites e a comparação com o ciclo anterior. O Extrato ganha um calendário. Cada ciclo tem um relatório.

**Spec:** decisões 13 e §6.9 (telas 4, 5 e 7) de `docs/superpowers/specs/2026-11-27-vc-financas-design.md`.

## Global Constraints
- Valem as regras dos planos anteriores: RLS, centavos, fuso de São Paulo, `<Money>` em todo valor, esqueleto de carregamento e app agnóstico (nada fixo no código).
- **Gasto** = `expense` − `refund` pela data da compra. Isso inclui cartão e VR. Transferência, fatura, aporte, resgate, rendimento e "a confirmar" ficam fora. "A confirmar" aparece à parte.
- **Período padrão:** o ciclo atual de `currentCycle`. O usuário pode trocar para mês do calendário, semana, ano ou um período livre.
- **Comparação:** o mesmo número de dias do período anterior equivalente.
- Toda consulta pagina com `.range()`. Nunca confiar no limite de 1000 linhas do PostgREST.

## Tasks

### Task 1: Gastos por categoria (aba Gastos)
- **Função pura** `byCategory(txs, prevTxs)`: para cada categoria, total, quantidade, variação em %, maior estabelecimento (merchant ou descrição limpa) e limite (`categories.monthly_limit_cents`, proporcional à duração do período). Lançamentos sem categoria entram em "Sem categoria". Ordem decrescente por total.
- **Tela `/gastos`:**
  - Seletor de período (Ciclo, Mês, Semana, Ano, Personalizado).
  - Total do período, comparação com o anterior e "+ R$ X a confirmar".
  - Uma barra por categoria. A barra fica laranja acima de 80% do limite e vermelha acima de 100%.
  - Tocar numa categoria abre a lista de lançamentos dela (`/gastos/[categoria]?periodo=…`).
- **Limites:** editar o limite mensal de cada categoria em `/config/categorias`, junto com renomear e criar categorias.
- **Aba Gastos** na barra inferior: deixa de ser "em breve".

### Task 2: Extrato com período e calendário
- O Extrato ganha o mesmo seletor de período (Dia, Semana, Ciclo, Mês, Ano, Personalizado) e mantém a paginação.
- **Calendário do mês (`/extrato/calendario`):**
  - Grade de dias com o gasto do dia, com cor proporcional ao valor (tokens do tema, sem roxo).
  - Tocar num dia abre os lançamentos dele.
  - Abaixo, um gráfico de entradas × saídas por semana (SVG, escala correta).

### Task 3: Relatório do ciclo
- **`/relatorio?ciclo=…`:**
  - Entradas (salário, extras), saídas no caixa, compras no cartão e gasto real.
  - Top 5 categorias e top 5 estabelecimentos.
  - Comparação com o ciclo anterior.
  - Quanto foi para caixinhas (aportes − resgates).
  - Compromissos cumpridos.
  - Navegação para os ciclos anteriores.
- **Acesso:** link no Início ("Relatório do ciclo") e no Dia do pagamento.
