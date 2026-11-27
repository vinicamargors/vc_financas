# VC Finanças — Design

Data: 2026-11-27
Status: rascunho para aprovação
Protótipo de telas (valores de exemplo): https://claude.ai/artifact/HEaGBZAvN8fmVMCJ7f9DpK

## 1. Intenção e porquê

App de finanças pessoais para o dono (Vini) e, depois, namorada e família. Cada pessoa vê só o próprio dinheiro.

A dor principal: **ele nunca lembra de lançar gastos.** Abandonou Mobills e Organizze (tudo manual). Abandonou o Pierre (automático, mas pago e **contava transferência entre contas próprias como gasto**: "gastei 8 mil no mês").

O app precisa:
- Capturar quase tudo sozinho (Open Finance + Atalho do iPhone).
- Acertar o total de gastos. Transferência, fatura e aporte **nunca** viram gasto.
- Aprender categorias com o uso ("MARCELO REDONDO" → "Cantina do Tio Marcelo / Alimentação", uma vez só).
- Responder "posso gastar hoje?" e "nesse ritmo, quanto terei em jan/2028?".

Não é SaaS. É ferramenta pessoal, PWA instalada no iPhone, bonita e fácil de ler. Custo zero.

**Princípio: agnóstico.** Feito para a necessidade do dono, mas não só dele. Nada de nomes, bancos, categorias, dias de salário ou compromissos fixos no código. Tudo que aparece nos exemplos (Igreja, Mãe, Gasolina, Casa, Bradesco) é configuração do usuário.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Ingestão automática diária via Pluggy (Meu Pluggy) + tempo real via Atalho do iPhone (automação "Transação" da Carteira).
- Detecção confiável de transferências, pagamentos de fatura, aportes/resgates e estornos.
- Ciclo financeiro de salário a salário, com "livre por dia".
- Compromissos do mês (pendências) marcados automaticamente.
- Categorias com regras aprendidas + sugestão da Pluggy + IA (Gemini) opcional.
- Caixinhas múltiplas com % do CDI, rendimento, projeção individual e consolidada.
- Meta "Casa" = caixinha + FGTS (estimado).
- Projeção de patrimônio em cenários.
- Multiusuário com isolamento total por pessoa.

**Não-objetivos**
- Finanças de casal, contas compartilhadas, divisão de gastos.
- Uso comercial, cadastro aberto, cobrança.
- Ações, Tesouro, previdência, cripto (pode vir depois; hoje só caixinhas + FGTS).
- App nativo / App Store.
- Android (todos usam iPhone).
- Importação de planilha/OFX como fluxo principal.

**Anti-objetivos (se acontecer, falhou)**
- Total de gastos inflado por transferência/fatura/aporte (o erro do Pierre).
- Exigir lançamento manual para o app ser útil.
- Valor duvidoso sumir em silêncio. Dúvida fica **visível** como "a confirmar".
- Um usuário ver dado de outro.
- Começar a custar dinheiro sem o dono decidir.

## 3. Restrições

- **Custo zero.** Vercel Hobby + Supabase Free + Meu Pluggy + Gemini free tier.
- **Meu Pluggy (gratuito):** uso pessoal, até 5 conexões do mesmo titular, sincronização automática a cada ~24h, sem atualização forçada pela API em itens proxy, consentimento Open Finance expira em até 12 meses. **Contas de terceiros exigem plano pago** → cada pessoa usa as próprias credenciais Pluggy (Client ID/Secret do dashboard dela).
- Webhook da Pluggy deve responder em < 10 s → responder 200 e processar em segundo plano (`after()` do Next.js ou fila).
- Supabase Free pausa após 7 dias sem atividade; banco de 500 MB. Cron diário mantém ativo.
- Vercel Hobby: cron 1x/dia; funções com tempo limitado.
- iOS: PWA só recebe push se instalada na tela inicial (iOS 16.4+).
- FGTS não está no Open Finance → saldo informado manualmente.
- Bancos do dono e da namorada: **Bradesco** (conta principal + cartão), **Nubank** (cartão + sobras), **Mercado Pago** (caixinhas).
- Gemini free tier pode usar dados para treino → IA é **opt-in por usuário**.

## 4. Abordagens consideradas

| | Abordagem | Trade-off |
|---|---|---|
| ✅ | **Next.js 15 (App Router) na Vercel + Supabase (Postgres, Auth, RLS)** | Grátis; isolamento por usuário pronto via RLS; mesma stack do app de referência. Cuidado com pausa do Supabase e limites do Hobby. |
| | Cloudflare Pages + Workers + D1 | Grátis com limites maiores e sem pausa; auth e isolamento feitos à mão → mais risco de vazamento entre usuários. |
| | Servidor próprio (Oracle Free / PC em casa) | Controle total; dono vira administrador (backup, segurança, uptime). |
| ✗ | PWA local-first sem servidor | Descartado: segredo da Pluggy e webhook exigem servidor; sem sincronização entre dispositivos. |

**Escolhida pelo dono: Next.js + Vercel + Supabase.**

Fonte de dados também foi decidida em conversa: **híbrido** — Pluggy (fonte oficial, diária) + Atalho do iPhone (tempo real, só pagamentos por aproximação com cartões da Carteira). Alternativas descartadas: só Atalho (não pega Pix/boleto/online), parsing de e-mail (frágil), importação manual (é o que ele odeia).

## 5. Decisões do dono

1. **Individual.** Cada pessoa vê só o seu. Sem visão de casal.
2. **Duas lentes, sem dupla contagem.**
   - **Gastos e categorias = competência.** Compra de R$ 1.200 em 12x = R$ 100 em cada ciclo de parcela. Pagamento de fatura nunca é gasto.
   - **Livre (dinheiro disponível) = caixa.** "A fatura só sai do líquido quando eu pago." Fatura entra como compromisso do ciclo em que vence; compras no cartão **não** reduzem o livre do ciclo atual.
   - Na tela inicial, abaixo do livre: "Cartão neste ciclo: R$ X → próximo salário", para o usuário ver o que já comprometeu.
3. **Categorização em 3 camadas**: regras aprendidas → categoria da Pluggy → Gemini. Gemini aceito pelo dono.
4. **Ciclo financeiro = de salário a salário** (salário cai no penúltimo dia útil do mês). Não mês do calendário.
5. **Tela "Dia do pagamento"**: ao cair o salário, mostra distribuição (faturas e compromissos do usuário) marcada automaticamente e o "livre até o próximo salário".
6. **"Livre por dia"** é o número principal da tela inicial.
7. **Compromissos** (pendências), todos criados pelo usuário: valor fixo (ex.: Mãe R$ 300 via Pix), orçamento de categoria (ex.: Gasolina R$ 400 no ciclo) ou % da renda (ex.: 10% para uma categoria personalizada). Para %, o usuário escolhe a base: só salário ou toda renda.
8. **Salário**: reconhecido pelo pagador (nome/CNPJ vindo da Pluggy), confirmado na primeira vez. Regra de data configurável (dono: penúltimo dia útil; outras: dia fixo, quinto dia útil etc.). PLR, 13º e bônus podem cair em outros dias; o app pergunta o tipo e aprende.
9. **Transação duvidosa** (ex.: Pix de R$ 3.000 a desconhecido sem par): **fora do total**, mas visível como "+ R$ X a confirmar", resolvida na revisão da noite.
10. **Caixinhas múltiplas**, cada uma com seu % do CDI (ex.: 105%, 120%, 130%). Detalhe por caixinha + visão consolidada (total, rendimento acumulado, rendimento por dia, projeção).
11. **Meta "Casa"**: caixinha no Mercado Pago + FGTS mostrados **separados**, com "potencial de entrada" somado. Meta aberta (sem valor alvo); aporte planejado R$ 1.500–2.000/mês.
12. **FGTS**: dono informa salário bruto fixo uma vez; app estima depósito mensal a partir do líquido que entrou (para refletir hora extra); saldo real informado a cada ~3 meses corrige a estimativa.
13. **Acompanhamento por categoria**: barras por categoria no ciclo, comparação com ciclo anterior, limites por categoria.
14. **Família no Pluggy**: caminho gratuito com **assistente guiado** dentro do app (cada pessoa cria a própria conta Meu Pluggy + credenciais de desenvolvedor; ~10 min, uma vez).
15. **Visual**: dono aprovou a direção do protótipo (limpo, claro/escuro). Botão de olho para ocultar valores.

## 6. Design

### 6.1 Arquitetura

```
iPhone (PWA)  ──►  Next.js (Vercel)  ──►  Supabase Postgres (RLS por user_id)
Atalho iOS    ──►  POST /api/ingest/shortcut  (token por usuário)
Pluggy        ──►  POST /api/webhooks/pluggy  (responde 200, processa em background)
Vercel Cron   ──►  /api/cron/daily  (sync de segurança, recorrências, notificações, keep-alive)
Gemini API    ◄──  categorização/insights (só usuários com IA ligada)
BCB SGS API   ◄──  série do CDI diário (grátis)
```

- Todo acesso a dados do usuário passa por RLS (`user_id = auth.uid()`). Rotas de servidor que usam service role sempre filtram por `user_id` explicitamente.
- Credenciais Pluggy de cada usuário guardadas **criptografadas** (Supabase Vault ou AES-GCM com chave em env). Nunca vão ao cliente.
- Token do Atalho: aleatório, por usuário, guardado como hash, revogável.

### 6.2 Modelo de dados (essencial)

- `profiles` — usuário, salário bruto base, preferências (IA ligada, horário da revisão, ocultar valores).
- `pluggy_credentials` — client_id, client_secret (cifrado), por usuário.
- `connections` — item Pluggy (banco, status, expiração do consentimento, último sync).
- `accounts` — conta corrente, cartão de crédito, caixinha/investimento, FGTS (manual). Campos: tipo, banco, saldo, `cdi_percent` (caixinhas), dia de fechamento/vencimento (cartões).
- `transactions` — valor, data, descrição crua, `merchant_id`, `category_id`, `kind` (`expense`, `income`, `transfer`, `card_payment`, `investment_in`, `investment_out`, `refund`, `pending_review`), origem (`pluggy`, `shortcut`, `manual`), `external_id`, parcela (n/total), `linked_transaction_id` (par de transferência / duplicata / estorno).
- `installments` — compra parcelada e suas parcelas futuras (competência).
- `merchants` — nome amigável + aliases de descrições cruas.
- `rules` — padrão (descrição/documento/contraparte) → merchant, categoria e/ou kind. Criadas pela revisão ("lembrar para as próximas").
- `categories` — padrão + personalizadas; limite opcional por ciclo.
- `commitments` — tipo (`fixed`, `category_budget`, `percent_of_income`), valor/%, regra de match (contraparte, categoria).
- `income_sources` — pagador (nome/CNPJ), tipo (salário, PLR, 13º, bônus), regra de dia (penúltimo dia útil).
- `cycles` — início/fim (derivados do salário), totais cacheados.
- `goals` — meta (ex.: Casa), caixinhas vinculadas, inclui FGTS, aporte planejado, valor alvo opcional.
- `balance_snapshots` — saldo diário por conta (base de rendimento e gráficos).
- `cdi_rates` — taxa CDI diária (BCB).

### 6.3 Ingestão

**Pluggy (fonte oficial)**
- Webhooks `item/updated` e `transactions/*` → responde 200 → em background busca contas, transações, saldos e investimentos do item.
- Cron diário faz sync de segurança (caso webhook falhe) e reprocessa classificação.
- Idempotência por `external_id` da Pluggy.

**Atalho do iPhone**
- Automação "Transação" da Carteira envia valor, estabelecimento e cartão para `POST /api/ingest/shortcut` com o token do usuário.
- Cria transação origem `shortcut`, já categorizada pelas regras; notificação push confirmando.
- App fornece link de instalação do Atalho e instruções na tela de configurações.

**Deduplicação Atalho × Pluggy**
- Quando a Pluggy traz uma compra de cartão: procura transação `shortcut` do mesmo usuário com mesmo valor, mesmo cartão (ou banco) e data ±1 dia, ainda não vinculada. Se achar, funde: mantém dados da Pluggy, preserva categoria/merchant escolhidos.

### 6.4 Classificação (o coração do app)

Ordem aplicada a cada transação nova:

1. **Transferência própria**: contraparte com o CPF do próprio usuário, ou par casado (saída numa conta e entrada de mesmo valor noutra conta do usuário em ±1 dia) → `transfer`.
2. **Pagamento de fatura**: saída da conta que casa com fatura de cartão do usuário (descrição/valor/vencimento) → `card_payment`.
3. **Aporte/resgate** de caixinha/investimento → `investment_in` / `investment_out`.
4. **Estorno** → `refund` ligado à compra original.
5. **Renda**: pagador reconhecido em `income_sources` → `income` (+ tipo). Pagador novo com valor alto → pergunta.
6. **Regras do usuário** (`rules`) → merchant/categoria/kind.
7. **Categoria da Pluggy** como palpite.
8. **Gemini** (se ligado) para descrição desconhecida → sugestão, sempre confirmável.
9. Saída sem classificação segura e valor relevante sem par → `pending_review` (**fora do total, visível como "a confirmar"**).

Toda classificação manual pode gerar regra ("lembrar para as próximas").

### 6.5 Ciclo financeiro e "livre por dia"

- Ciclo começa no dia em que o salário cai (real) e termina na véspera do próximo salário previsto (regra de data do usuário, com feriados nacionais).
- Antes do primeiro salário detectado: usa a data prevista.
- **Usuário sem salário regular** (decisão do construtor): ciclo = mês do calendário ou dia de início escolhido.
- **Livre no ciclo (caixa)** = salário do ciclo − compromissos do ciclo (incluindo faturas que vencem nele) − saídas à vista fora de compromissos (Pix, débito, boleto, saque).
- Compras no cartão **não** reduzem o livre do ciclo; aparecem como "Cartão neste ciclo → próximo salário" e viram a fatura do ciclo seguinte.
- **Livre por dia** = livre restante ÷ dias restantes no ciclo.
- **Gasto real** (tela inicial, categorias, relatórios) = competência: compras do ciclo (cartão por data/parcela + à vista). Exclui transferência, fatura, aporte, resgate e itens a confirmar.
- **Renda extra** (PLR, 13º, bônus): não abre ciclo novo. Ao cair, o app pergunta "Distribuir R$ X?" com atalhos: mandar para uma caixinha, somar ao livre, ou parte de cada. Só soma ao livre o que o usuário escolher.
- **Aporte extra em caixinha** (fora do compromisso planejado): sai do livre na hora. Não é gasto.
- **Resgate de caixinha**: não é renda. O app pergunta "Somar R$ X ao livre?"; só soma se o usuário confirmar.
- **Estorno**: abate a compra original (no ciclo dela para gasto real; no livre do ciclo atual se a compra foi à vista).

### 6.6 Compromissos

- `fixed`: marcado quando aparece transação que casa (contraparte + valor ±10%).
- `category_budget`: reserva o valor no livre. Gastar acima → excesso sai do livre. Sobra → liberada no livre só no fim do ciclo.
- `percent_of_income`: % da renda do ciclo, base escolhida pelo usuário (só salário ou toda renda).
- Faturas aparecem automaticamente como compromisso (valor da fatura fechada, vencimento).
- Sugestão automática: gasto recorrente com mesma contraparte por 3 ciclos seguidos → "Virar compromisso?".

### 6.7 Caixinhas, metas e projeção

- Saldo por caixinha vem da Pluggy. `cdi_percent` informado pelo usuário.
- **Rendimento acumulado** = saldo − aportes + resgates (desde a primeira observação).
- **Rendimento por dia útil** = saldo × ((1 + CDI anual × %CDI)^(1/252) − 1).
- **Projeção** mês a mês até a data alvo com aporte mensal; mostra **bruto e líquido de IR** (tabela regressiva).
- Cenários: ritmo atual (média de aportes dos últimos 3 ciclos), aporte planejado mínimo e máximo.
- **Consolidado**: soma das caixinhas, rendimento total, rendimento/dia, projeção conjunta.
- **FGTS**: depósito estimado = 8% × (líquido do salário do ciclo × razão bruto/líquido de referência). Rendimento estimado 3% a.a. + TR. Saldo real informado manualmente substitui a estimativa; lembrete a cada 3 meses.
- **Meta Casa** = caixinha Casa + FGTS, exibidos separados com "potencial de entrada".
- Risco: confirmar se a Pluggy expõe cofrinhos do Mercado Pago separados do saldo. Plano B: rastrear aportes enviados + rendimento estimado pelo CDI.

### 6.8 Projeção geral ("nesse ritmo, em jan/2028...")

- Base: média dos últimos 3 ciclos de renda (só salário) e de gasto real.
- Saída: patrimônio projetado (caixinhas + FGTS) mês a mês, com cenários. Extras (13º, PLR) num cenário à parte.

### 6.9 Telas (ver protótipo)

1. **Início** — livre por dia, livre no ciclo, **saldo em conta corrente por banco e total** (ex.: R$ 600 = Bradesco 300 + Nubank 300, vindo da Pluggy, com horário da última atualização), gasto real (+ a confirmar), caixinha do ciclo, lançamentos de hoje com origem. Se o livre ficar maior que o saldo em conta, o app avisa a diferença (sinal de compromisso ou gasto não detectado).
2. **Dia do pagamento** — distribuição do salário com check automático e livre até o próximo salário.
3. **Revisão da noite** — cartões para nomear/categorizar/classificar; "lembrar para as próximas".
4. **Extrato** — lista filtrável (dia/semana/ciclo/mês/ano/período); calendário de gastos por dia.
5. **Categorias** — barras por categoria, Δ vs ciclo anterior, limites, maior estabelecimento.
6. **Caixinhas** — consolidado + lista; detalhe por caixinha com gráfico de projeção.
7. **Relatório do ciclo** — entradas × saídas, categorias, comparação com o anterior.
8. **Configurações** — conexões (assistente Pluggy), Atalho, salário, compromissos, categorias, regras, IA on/off, horário da revisão.

Navegação inferior: Início · Extrato · Categorias · Caixinhas (Relatório e Configurações acessíveis pelo topo).
Botão de olho oculta valores em todas as telas. Tema claro/escuro seguindo o sistema.

### 6.10 Notificações (push PWA)

- Compra registrada pelo Atalho (confirmação imediata).
- Revisão da noite (horário configurável, padrão 21h) — só se houver itens.
- Salário caiu → abre Dia do pagamento.
- Consentimento Pluggy expira em 30 dias.
- Lembrete trimestral do saldo do FGTS.
- Limite de categoria atingido.

### 6.11 Importação inicial (histórico)

- Primeiro sync importa **90 dias** (ou o máximo que a Pluggy entregar, se menor).
- Histórico é classificado **em silêncio** (regras + Pluggy + detecção de transferências). Não vai para a revisão da noite.
- Sessão única de onboarding: "Ensine os 20 lugares mais frequentes" (nome + categoria). Gera regras que reclassificam o histórico.
- Revisão da noite e "a confirmar" cobrem só o ciclo atual em diante.
- Histórico alimenta: ritmo atual (3 ciclos), sugestão de compromissos e recorrências, comparação com ciclo anterior.
- Rendimento das caixinhas conta a partir da primeira observação; tela mostra "rendeu R$ X desde dd/mm".
- **Primeiro ciclo:** faturas pagas nele são compromissos normais (já é o comportamento de caixa), então não há caso especial para o livre.

### 6.12 Multiusuário e onboarding

- Login Supabase Auth (e-mail com link mágico). Sem cadastro aberto: o dono convida (lista de e-mails permitidos).
- Onboarding: (1) instalar PWA, (2) assistente Pluggy, (3) Atalho do iPhone, (4) salário e dia, (5) compromissos sugeridos a partir do histórico.
- **Assistente Pluggy**: passo 1 Meu Pluggy + bancos; passo 2 criar aplicação no dashboard Pluggy e colar Client ID/Secret com botão "Testar"; passo 3 abrir Pluggy Connect com o conector Meu Pluggy dentro do app — o item é salvo automaticamente. Verificar no início da implementação se o passo 3 dispensa copiar Item IDs; se não, o assistente pede o ID com instrução visual.

## 7. Deixado para o construtor

- Biblioteca de UI e gráficos, estrutura de pastas, testes.
- Estratégia de fila/background (after(), Supabase Edge Function, pg_cron).
- Mecanismo exato de criptografia das credenciais.
- Lista inicial de categorias (padrão brasileiro).
- Tolerâncias de matching (valores e janelas) — começar com as sugeridas acima e ajustar.
- Modelo Gemini (o mais barato/gratuito disponível) e prompts.
- Design visual final, a partir da direção aprovada no protótipo.

## 8. Riscos a validar cedo (spike)

1. Pluggy Connect com conector Meu Pluggy usando credenciais do próprio usuário: cria item sem copiar IDs?
2. Cofrinhos do Mercado Pago aparecem como investimento separado na Pluggy?
3. Pluggy traz CPF/documento da contraparte em Pix (necessário para "transferência própria")?
4. Automação "Transação" do iOS envia estabelecimento/cartão com os cartões do Bradesco, Nubank e Mercado Pago?
5. Push em PWA iOS funcionando com Vercel + Web Push (VAPID).
