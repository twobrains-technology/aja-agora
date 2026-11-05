# Dashboards de gargalo — Langfuse

Plano: `docs/design/planos/2026-11-05-langfuse-suíte.md`, bloco B12.
Instância de produção: `https://langfuse.twobrainstechnology.com`.

**PENDENTE-KAIRO:** os painéis abaixo ainda não foram criados na UI. A criação
na UI não é versionável em código (os dashboards do Langfuse vivem no banco da
instância, não no repo) — risco registrado no plano. Este doc especifica o que
criar; o dono (ou quem ele designar) cria na UI e anexa os prints no vault
(entidade `pi-agentes-aja-langfuse`), que é o fechamento do GATE do bloco.

## Contexto da instância (v4, `events_only`)

- Não há endpoint de sessões (`/api/public/sessions` devolve 410/deprecado).
- `POST /api/public/v3/scores` devolve 405: a gravação de score vai por
  `POST /api/public/scores` (sessionId aceito) e a leitura por
  `GET /api/public/v3/scores`.
- O custo por session não vem da listagem de observations
  (`totalPrice: null`): vem do `GET /api/public/v2/metrics`.

## Custo por conversa

Job: `scripts/langfuse-custo-conversa.ts` (`pnpm tsx
scripts/langfuse-custo-conversa.ts`). Soma o custo das generations de cada
session (janela de 30 dias, ajustável por `CUSTO_JANELA_DIAS`) e grava o score
NUMERIC `custo_conversa` por session. Idempotente: upsert por id determinístico
`custo_conversa-<sessionId>` — rerun atualiza em vez de duplicar. Sessions sem
custo (> 0) não são pontuadas. Sem credenciais = no-op.

Prova (gate): 2 sessions reais pontuadas —
`custo_conversa-01a17e45-4424-7566-baea-e5af730bf3ca` = $0.015786,
`custo_conversa-01a17e45-8da1-7616-8301-1ba50993da92` = $0.000525; rerun não
duplicou (verificado em `GET /api/public/v3/scores`).

## Painéis a criar na UI

Todos se constroem no editor de dashboards do Langfuse a partir do
`GET /api/public/v2/metrics` (a mesma query serve de painel "custom SQL"-free:
a UI usa a mesma camada de metrics).

1. **Latência por turno (avg e p95).** Fonte: view `observations`, medida
   `latency`, agregações `avg` e `p95`. Duas versões:
   - por conversa: dimensão `sessionId`, `orderBy` desc em `p95_latency`,
     `config.row_limit` 20 — as conversas mais lentas na cabeça;
   - global: sem dimensão — a média/p95 do produto inteiro na janela.
   Query de referência (avg 2 909 ms, p95 5 686 ms na session mais lenta hoje).
2. **Custo por conversa.** Fonte: score `custo_conversa` (página
   Dashboards → Scores, NUMERIC) agrupado por `sessionId`; média e p95 do
   score. Alternativa direta: view `observations`, medida `totalCost` soma,
   dimensão `sessionId` (a mesma query do job).
3. **Observações com erro.** Fonte: view `observations`, filtro `level = ERROR`
   (gerations e tools que falharam). Painel de contagem por `name` e por
   `sessionId` — responde "onde o turno falhou".
4. **Traces por session.** Fonte: view `observations`, medida `count` da
   observação raiz (ou medida `count` com dimensão `sessionId` sobre
   `isRootObservation`) — turnos por conversa. Combinado com o score
   `custo_conversa` dá o custo por turno.
5. **Custo diário.** Fonte: view `observations`, medida `totalCost` soma,
   dimensão `startTimeMonth` (ou granularidade diária no painel) — tendência
   de custo.

## Prints

A criar na UI; vão ao vault (não ao repo): painel 1, 2, 3, 4 e 5.
