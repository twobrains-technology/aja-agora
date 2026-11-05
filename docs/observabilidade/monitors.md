# Monitors (B11) — alertas na UI do Langfuse

Instância: https://langfuse.twobrainstechnology.com (self-hosted, v4+ — sem limite de alertas).
Fonte dos nomes de score: `docs/observabilidade/score-configs.md` (catálogo B7) e
`docs/observabilidade/juiz-online.md` (B8).

**Status: PENDENTE-KAIRO.** A API pública de monitors não existe (404 medido na onda 3): os
monitores deste doc são criados **na UI, com login humano**. Este doc é o desenho operacional —
o que criar, com quais parâmetros — não o registro de execução. Cada monitor criado vai ao
handoff do vault: `~/obsidian-vault/01 - TwoBrains/projects/aja-agora-observabilidade-langfuse.md`
(um item por monitor: nome na UI, data, threshold e a prova de notificação — print ou log do
webhook).

## Como o mecanismo funciona (doc oficial: langfuse.com/docs/observability/features/alerts)

- **Alert** = métrica (data source + agregação + filtros) + operador + threshold + janela
  ("Over the past": `1 hour`, `1 day`, `1 week`…). Alerta opcional de WARNING e obrigatório de
  ALERT. Fica **ACTIVE** no momento do save e avalia periodicamente.
- **No-data handling** (advanced settings), um por alerta:
  | modo | comportamento |
  |---|---|
  | Treat missing data as 0 (default) | null vira 0 e entra na comparação |
  | Keep the previous severity | segura a severidade anterior, sem notificar |
  | Show severity NO_DATA | grava NO_DATA, sem notificar |
  | **Notify after sustained NO_DATA** | grava NO_DATA e **notifica após atraso configurável** |
- **Renotify** (opcional): re-notifica a cada N minutos (1–10 080) enquanto a severidade persiste.
- **Automations** são os canais (Slack, PagerDuty, Webhook, GitHub Actions) e exigem papel
  Admin/Owner para criar; a ligação alerta→automation pode ser feita por Member.
- **Aviso crítico:** após **5 falhas de entrega consecutivas**, o Langfuse **desabilita a
  automação sozinho, silencioso** (comportamento medido e documentado no runbook do juiz online).
  É o mesmo risco já anotado em `juiz-online.md`: status `active` na UI não prova vida. Rotina:
  conferir 1× por dia se o webhook seguiu entregando (o payload tem `type: "monitor-alert"` e o
  endpoint deve responder 2xx rápido); se a automação cair, reativá-la na página Automations
  depois de restaurar o endpoint.
- Payload do webhook (JSON assinado, HMAC — validação igual à de prompt webhooks):
  `type: "monitor-alert"`, `payload.severity`, `payload.message`, `window`, `permalink`.

## Canal de notificação

Todos os monitores abaixo ligam à **mesma automation webhook**: um endpoint HTTP nosso que
recebe `monitor-alert` e retransmite para o canal de operação (decidir com o Kairo qual —
Slack do projeto ou grupo WhatsApp é decisão do dono; o doc do webhook fica no handoff do vault).
Criar a automation com papel Admin: Automations → Create Automation → event source **Alert** →
ação **Webhook** → URL do endpoint.

## Os monitores

### M1 · Pino de silêncio (NO_DATA notificando)

O que prende: **cliente escreveu e nenhum trace rodou** — o silêncio do pipeline é o defeito
mais grave, porque nenhuma outra métrica existe para medir (sem trace não há scores, custo nem
juiz; só este monitor enxerga).

Limitação declarada: o Langfuse não mede "mensagens recebidas" — só o que o app traceia. Este
monitor pega o caso "houve tráfego e o trace sumiu"; o caso "nenhum cliente escreveu em X tempo"
é falso-positivo esperado em horas sem tráfego. Por isso a janela curta e a calibração.

| campo | valor |
|---|---|
| Data source | `Observations` |
| Metric | `count` |
| Filter | name = `Conversational Turn` (a root do plugin de trace do turno) |
| Operator + threshold | `< 1` |
| Window | **1 hour** |
| No-data handling | **Notify after sustained NO_DATA** |
| Renotify | a cada 60 min enquanto persistir |
| Severidade | WARNING |

Leitura: qualquer hora com zero traces de turno dispara. Durante a calibração, filtrar os
falsos-positivos de madrugada (ver "Calibração" abaixo); se o ruído de horário morto for
insuportável, variante: janela **6 hours** `< 1`, que tolera janelas mortas e pega o pino antes
do amanhecer. Não existe condição tipo "horário comercial" no Langfuse — o ajuste é de janela.
O runbook do juiz (`juiz-online.md`) já casa com este monitor: a conferência diária do último
score é o segundo olho do mesmo pino.

### M2 · Taxa `numero_fora_da_cota` (1d)

D-0004: o agente prometeu número que a cota não mostra. Este score é BOOLEAN — a **média de
BOOLEAN é a taxa** (compartilhamento de `true`).

| campo | valor |
|---|---|
| Data source | `Scores (boolean)` |
| Metric | `avg value` (filtro: score name = `numero_fora_da_cota`) |
| Operator + threshold | **ALERT: > 0,10** (10 % dos turnos com número fora da cota) |
| Window | **1 day** |
| No-data handling | Keep the previous severity |
| Severidade | ALERT |

### M3 · `conducao_entregue` (1h)

P0 — a conversa não morre. BOOLEAN também; média = taxa de respostas que deixaram próximo passo.

| campo | valor |
|---|---|
| Data source | `Scores (boolean)` |
| Metric | `avg value` (filtro: score name = `conducao_entregue`) |
| Operator + thresholds | **ALERT: < 0,85** · **WARNING: < 0,92** |
| Window | **1 hour** |
| No-data handling | Keep the previous severity |
| Renotify | a cada 60 min enquanto em ALERT |

### M4 · `judge_avancou` (1d)

Score do juiz online (B8, evaluator LLM-as-judge, NUMERIC 0–1 na root "Conversational Turn").
Veredito de juiz é **hipótese, nunca gate** — o monitor é de tendência em produção; a pegada de
promessa falsa continua sendo `numero_fora_da_cota` (determinística, B5).

| campo | valor |
|---|---|
| Data source | `Scores (numeric)` |
| Metric | `avg value` (filtro: score name = `judge_avancou`) |
| Operator + threshold | **ALERT: < 0,5** |
| Window | **1 day** |
| No-data handling | Show severity NO_DATA (não notificar: sampling < 1 e falha da LLM Connection não são problema do vendedor) |
| Severidade | ALERT |

Dependência: este score só existe depois do evaluator + rule do B8 (script
`scripts/langfuse-judge-online.ts`) **e** da LLM Connection criada na UI (PENDENTE-KAIRO lá
também). Sem o score fluindo, o monitor fica em NO_DATA — por isso o modo silencioso aqui, ao
contrário do M1.

## Calibração — 1 semana de baseline

Nenhum threshold acima é fixado em pedra: são os valores do plano B11, razoáveis como partida.
Durante a primeira semana com os monitores ativos:

1. Rodar com os thresholds do doc e anotar todo disparo (o handoff do vault registra data,
   monitor, severidade e se era verdadeiro ou falso-positivo).
2. Depois de 7 dias, comparar o baseline medido no Langfuse (dashboard de cada score, janela 1d/1h)
   e ajustar: threshold que nunca dispara está frouxo demais para o objetivo de venda; threshold
   que dispara em ruído (ex.: M1 na madrugada) pede janela maior ou renotify mais longo.
3. Atualizar este doc com os valores calibrados e a data, e anotar a mudança no handoff do vault.
4. M1 merece revisão de janela antes dos outros: é o único cujo falso-positivo é de horário, não
   de qualidade.

## Ordem de criação (na UI, login humano)

1. Automations → criar a automation webhook (Admin/Owner) — canal único para todos.
2. M1 (pino) — primeiro, porque não depende de nenhum score e cobre o pior modo de falha.
3. M2, M3 — dependem dos scores BOOLEAN do B5 existindo (script `langfuse-score-configs.ts`
   cria; conferir pela UI ou `GET /api/public/v3/scores` se já há valores fluindo).
4. M4 — por último, dependente do B8 vivo.
5. Registrar cada um no handoff do vault com a prova de notificação (o GATE do bloco exige
   print/log do webhook para cada monitor).
