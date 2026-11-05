# PRD — D-0081: Langfuse completo, detector de alucinação e golden set

Worktree: `kairogyn/chefe-langfuse` · Demand: `2026-11-04-D-0081-telemetria-alucinacao` · Refino + estudo
medido (4.6.0 OSS): `~/.../subagent-artifacts/outputs/19f29869-.../research.md`.

## Fatos conferidos no disco (divergências do briefing, registradas)

1. **B1 já está resolvido no lockfile.** O briefing fala em "upgrade `@langfuse/*` 4.6.1 → ≥ 5.4.0".
   O `pnpm-lock.yaml` desta worktree resolve, via `@langfuse/pi-observability-plugin@0.1.2`
   (`pnpm-lock.yaml:42-44`), `@langfuse/otel` **5.14.0**, `@langfuse/tracing` **5.14.0** e
   `@langfuse/core` **5.14.0** (`pnpm-lock.yaml:1511-1531`). Não existe dependência direta `@langfuse/*`
   4.x no `package.json` — só o plugin `0.1.2` (`package.json:54`). **O código vence**: B1 não é
   upgrade, é *pinar as deps diretas ≥ 5.4.0* (para não depender de range transitivo) + provar o
   smoke de ingestão em tempo real e a ausência de `Span not found in runMap`. Se o smoke provar
   ingestão < 30 s com o estado atual, o bloco fecha com a prova, não com o upgrade.
2. **B6 não pode instrumentar o streaming.** `src/lib/agent/pi/turno-livre.ts` é PROIBIDO nesta
   worktree e `grep completion_start_time|TTFT` nele não deu match ([não confirmei] ponto de
   instrumentação). Caminho adotado: ler o TTFT que o plugin já grava na `generation` (o comentário
   de `langfuse.ts` confirma que a generation da 0.1.2 traz "tempo até o primeiro token") e
   persistir a duração em `uso_de_ia` por job de reconciliação via API `/api/public/v2/observations`.
   Se o campo não vier no payload, o bloco fica **PENDENTE-BLOCO** para depois do merge da D-0080.
3. **`langfuse-suite.ts` (citado no estudo) não existe nesta worktree** — grep por `langfuse-suite`
   em `*.ts`: 0 matches. Os scripts de API do Langfuse nascem novos (B7, B8, B14).
4. **`precos.ts`**: a auditoria citou `precos.ts:57`; o comentário "FALTA: `claude-sonnet-4-6`"
   está em `precos.ts:64`. Âncora corrigida; o campo de preços continua sem o modelo (confirmado).
5. **`signals.ts` já contém o detector de número por conversa inteira**
   (`NUMBER_REGEX`, `computeNumbersFlagged` — `src/lib/eval/signals.ts:49,108`). B4 reutiliza a
   mecânica (regex + escala + tolerância) mas opera **por turno**, conferindo a fala contra as tools
   daquele turno, e grava score BOOLEAN via API v3.

## Contexto (por que)

O Langfuse está desligado em produção (`LANGFUSE_TRACING_ENABLED` ausente dos `.env*`; o gate
explicito de `configDoLangfuse` em `src/lib/agent/pi/langfuse.ts:69-91` exige flag E três chaves),
o prompt efetivo (system da caixa + histórico + tools) não chega ao trace, e a alucinação em fala
só é julgada offline por LLM amostrado — o caso Arthur ("A moto é sua!" com `bevi_proposals = 0`)
passou em todos os juízes. O dono pediu: Langfuse completo, suite para os gargalos, e golden set
com conversas simuladas. O estudo medido na instância 4.6.0 OSS define o desenho (endpoints vivos,
root observation, monitors sem API).

## O que muda

- Langfuse ligado de verdade (flag + chaves), trace completo por turno (system + histórico + tools).
- Detecção determinística **no turno**: `numero_fora_da_cota` e `promessa_sem_fato` como score
  BOOLEAN via `/api/public/v3/scores`.
- Duração/TTFT persistida em `uso_de_ia`.
- Score configs, juiz online ancorado na root observation (com sampling), golden set como DATASET,
  dataset run no `pnpm eval`, espelho de prompt, annotation queue, monitores e dashboards (UI),
  preço do `claude-sonnet-4-6`.

## O que NÃO muda

- Desenho de `langfuse.ts`: chaves + flag, fila de identidade (`comIdentidadeDoTurno`),
  `PI_LANGFUSE_MAX_CHARS` (default 40000), plugin por caminho via jiti. Falha de observabilidade
  nunca derruba o turno; sem envs = no-op.
- `caixa_de_prompt` (Postgres) é a lei da conduta; Langfuse prompt mgmt é espelho, nunca
  dependência runtime. Gate de conduta continua sendo `pnpm eval` contra o app real.
- **Nenhum toque em `turno-livre.ts`, `converse.ts`, `handoff.ts`** — outra worktree
  (`chefe-remendos-fala`, D-0080) os reescreve. Leitura permitida; escrita, não. Única exceção
  prevista (B6 instrumentar o stream) **não é usada**: B6 grava a partir do que o histórico do
  turno e a generation do plugin já devolvem. Se um bloco descobrir que precisa editar esses
  arquivos, fica **PENDENTE-BLOCO** e o chefe segue nos demais.
- Code evaluators da instância: não usar (fora do git, redundante).

## Premissas invioláveis (do mandato)

- Observabilidade nunca custa o turno: falha de Langfuse não derruba a fala; sem envs = no-op.
- Veredito de juiz é HIPÓTESE — nunca gate. Promessa falsa é pega pela reconciliação
  determinística fala × estado (não pelo juiz).
- Postgres é a lei da conduta; espelho no Langfuse nunca é dependência.
- Code evaluators: NÃO usar.
- P11: o detector é medida, não remendo silencioso — nada de reescrever fala.
- 1 turno = 1 trace; 1 conversa = 1 session (`sessionId` = id da conversa).
- Endpoints vivos na v4 (medido): `/api/public/v3/scores`, `/v2/observations`, `/v2/metrics`,
  `/unstable/*`, `/datasets`, `/v2/prompts`, `/score-configs`, `/annotation-queues`,
  `/experiments`. NÃO usar: `/scores` (v1/v2), `/monitors` (só UI, 404 medido).
- Segredos nunca em arquivo versionado; envs do Langfuse vêm do ambiente/vault (`secrets-no-vault`).

## Ondas

| Onda | Blocos | Pronto da onda |
|---|---|---|
| 0 | B1, B2, B3 | ingestão em tempo real + trace completo |
| 1 | B4, B5, B6 | alucinação medida por turno + latência |
| 2 | B7, B8, B9, B10 | juiz, configs, dataset, golden |
| 3 | B11, B12, B13, B14, B15 | operação, gargalo, alerta |

## Paralelização (workers; regra: arquivos disjuntos por worker)

- **Onda 0:** B1 roda sozinho primeiro (toca `package.json`/`pnpm-lock.yaml`). Depois, B2
  (`.env*`/docs) e B3 (`langfuse.ts` + testes) em paralelo.
- **Onda 1:** B4 (novos módulos de detector + teste), B5 (novo módulo de reconciliação de promessa
  + teste) e B6 (`src/db/schema.ts` + migration + novo job) em **3 workers simultâneos** — zero
  sobreposição de arquivos.
- **Onda 2:** B7 (script de score-configs), B8 (script de evaluator + runbook) e B9 (dataset/seed)
  em paralelo. B10 depende de B7/B9 (precisa dos configs e do dataset) e de B1/B2 (trace em tempo
  real) — sequencial após eles.
- **Onda 3:** B15 (`precos.ts`) pode rodar desde já com qualquer onda (arquivo exclusivo). B12/B13/
  B14 (scripts novos) em paralelo entre si e com B11 (só docs/handoff). B11 depende de B4/B8
  (precisa dos scores existindo) e exige login humano na UI — **PENDENTE-KAIRO**.
- Cross-onda: B9 (dataset) pode começar junto com a Onda 0 (não toca código do agente). B15 idem.

## BLOCOS

### B1 — Base do SDK e prova de ingestão (onda 0)
- **Objetivo:** garantir stack `@langfuse/*` ≥ 5.4.0 de fato e provar ingestão em tempo real (< 30 s)
  sem `Span not found in runMap`.
- **Arquivos:** `package.json`, `pnpm-lock.yaml`, `scripts/langfuse-smoke.ts` (novo),
  `scripts/langfuse-smoke.test.ts` (novo).
- **Proibido:** `turno-livre.ts`, `converse.ts`, `handoff.ts`, `langfuse.ts`.
- **Passos:** (1) confirmar no lockfile as versões transitivas (5.14.0); (2) pinar `@langfuse/core`
  e `@langfuse/otel` ≥ 5.4.0 como devDependencies diretas para imunizar contra drift; (3) escrever
  `scripts/langfuse-smoke.ts`: cria 1 trace com 1 observation via SDK/OTEL, mede o instante até o
  GET em `/api/public/v2/observations` devolver o span.
- **GATE:** `pnpm tsx scripts/langfuse-smoke.ts` → saída `ingestão: <N>s` com N < 30 e zero ocorrência
  de `Span not found in runMap` no stderr.
- **Dependências:** nenhuma. **Onda 0.**

### B2 — Ligar o Langfuse (onda 0)
- **Objetivo:** `LANGFUSE_TRACING_ENABLED=true` no local e em produção (as chaves já existem no
  ambiente/vault).
- **Arquivos:** `.env.example` (novo campo documentado), `docs/observabilidade/langfuse-ativos.md`
  (novo: quais envs devem existir onde), handoff do vault.
- **Proibido:** qualquer `.env*` real com segredo em commit; `langfuse.ts` (gate mantido).
- **Passos:** (1) setar a flag no ambiente de dev e no de produção via vault/env real, nunca em
  arquivo versionado; (2) documentar as três chaves + flag + `LANGFUSE_TRACING_ENVIRONMENT`.
- **GATE:** conversa real no playground → `GET /api/public/v2/observations?traceId=<id>` devolve
  generation + observation de tool, com `userId` e `sessionId` = id da conversa.
- **Dependências:** B1. **Onda 0.**

### B3 — Prompt efetivo no trace (onda 0)
- **Objetivo:** a generation exibir o system da caixa + histórico + tools, respeitando
  `PI_LANGFUSE_MAX_CHARS`.
- **Arquivos:** `src/lib/agent/pi/langfuse.ts`, `src/lib/agent/pi/langfuse.test.ts`,
  `src/lib/agent/pi/langfuse-input-completo.ts` (novo, se o desenho for camada nossa).
- **Proibido:** `turno-livre.ts`, `converse.ts`, `handoff.ts`; quebrar o desenho de no-op sem envs.
- **Passos:** (1) medir o que o plugin 0.1.2 manda hoje (só prompt do turno + tool results —
  `src/index.ts:666-684` do pacote); (2) decidir caminho recomendado: camada nossa que anexa o
  input completo (envelope antes do plugin) — patch do plugin não é publicável e morreria no
  upgrade; (3) anexar system + histórico + definição das tools ao span, com teto `PI_LANGFUSE_MAX_CHARS`.
- **GATE:** conversa real no playground → o trace exibe o system da caixa de prompt (texto contendo
  `PROMPT_DO_VENDEDOR`) na observation root; `pnpm -s typecheck` verde.
- **Dependências:** B1 (para o teste de ingestão refletir o novo campo). **Onda 0.**

### B4 — Detector `numero_fora_da_cota` (onda 1)
- **Objetivo:** no caminho do turno, conferir números citados na fala contra o que as tools
  devolveram; gravar score BOOLEAN via API v3. Média booleana = taxa. NÃO reescreve fala.
- **Arquivos:** `src/lib/observability/sinais/numero-fora-da-cota.ts` (novo),
  `src/lib/observability/sinais/numero-fora-da-cota.test.ts` (novo). Pode reutilizar a mecânica
  extraída de `src/lib/eval/signals.ts` (módulo novo, sem editar `signals.ts` — se precisar editar
  `signals.ts`, extrair para módulo novo e apontar ambos os usos; único arquivo tocado a mais:
  `src/lib/eval/numeros-falados.ts` novo).
- **Proibido:** `turno-livre.ts`, `converse.ts`, `handoff.ts`, `signals.ts` como reescrita.
- **Passos:** (1) extrair `NUMBER_REGEX`/`parseNumeric`/`matchesKnownNumber` para módulo compartilhado;
  (2) novo detector por turno: fala do assistente × resultados de tool do turno (fontes: artifacts
  e tRPC `events` — mas no turno use o que o histórico/artefatos do turno já devolvem);
  (3) gravar `numero_fora_da_cota` (BOOLEAN true/false) no trace do turno via `/api/public/v3/scores`.
- **GATE:** caso reproduzido no playground com o sinal gravado; caso limpo sem falso positivo
  (números de mil/porcento e arredondamento cobertos). `pnpm test src/lib/observability/sinais/numero-fora-da-cota.test.ts`.
- **Dependências:** B2 (flag ligada para o score sair). **Onda 1.**

### B5 — `promessa_sem_fato` (onda 1)
- **Objetivo:** promessa de contratação na fala ("A moto é sua!") × fato no banco
  (`bevi_proposals = 0`) → score BOOLEAN. Mesma mecânica do B4.
- **Arquivos:** `src/lib/observability/sinais/promessa-sem-fato.ts` (novo),
  `src/lib/observability/sinais/promessa-sem-fato.test.ts` (novo). Reaproveita
  `scoresDeReconciliacao` de `src/lib/observability/reconciliacao-fala-estado.ts` (leitura, sem editar).
- **Proibido:** os três arquivos remendos; editar `reconciliacao-fala-estado.ts`.
- **Passos:** (1) padrão de promessa de posse/finalização na fala do assistente; (2) conferir contra
  `bevi_proposals` da conversa; (3) gravar score via API v3 no trace do turno.
- **GATE:** caso Arthur reproduzido → score gravado; conversa com proposta real → sem sinal falso.
  Teste unitário do módulo verde.
- **Dependências:** B2. **Onda 1.**

### B6 — TTFT e duração em `uso_de_ia` (onda 1)
- **Objetivo:** latência por turno persistida (P1 do refino): TTFT da generation + coluna de
  duração em `uso_de_ia`. Gate do refino: consulta mostrando p95 por dia.
- **Arquivos:** `src/db/schema.ts` (coluna nova em `uso_de_ia`), migration drizzle-kit nova em
  `src/db/` (arquivo gerado), `src/lib/observability/sinais/duracao-do-turno.ts` (novo),
  `src/lib/observability/sinais/duracao-do-turno.test.ts` (novo).
- **Proibido:** `turno-livre.ts`, `converse.ts`, `handoff.ts`. **Reencaminhamento registrado:**
  instrumentar `completion_start_time` no streaming exigiria editar `turno-livre.ts` → bloco segue
  pelo caminho alternativo (leitura do TTFT já gravado pelo plugin na generation, persistência por
  job de reconciliação). Se a generation 0.1.2 não expuser TTFT no payload de
  `/api/public/v2/observations`, o bloco vira **PENDENTE-BLOCO** (a duração computável — início ×
  fim do turno — pode ser persistida de todo jeito a partir do histórico).
- **Passos:** (1) coluna `duracao_ms` (e `ttft_ms` anulável) em `uso_de_ia`; (2) job que lê as
  generations do turno e grava as colunas; (3) teste do cálculo.
- **GATE:** `pnpm drizzle-kit generate` gera migration; consulta SQL/`psql` mostrando
  `percentile_cont(0.95)` de `duracao_ms` por dia em linhas reais.
- **Dependências:** B2 (trace vivo para o job ler). **Onda 1.**

### B7 — Score configs (onda 2)
- **Objetivo:** padronizar os scores na instância via `/api/public/score-configs`: BOOLEAN
  (`numero_fora_da_cota`, `promessa_sem_fato`, `conducao_entregue`, `tool_recusou`), NUMERIC
  (rubrica de 6 dimensões do `src/lib/eval/judge.ts`), TEXT/NUMERIC de conversa (`custo_conversa`).
- **Arquivos:** `scripts/langfuse-score-configs.ts` (novo), `docs/observabilidade/score-configs.md` (novo).
- **Proibido:** code evaluators; editar módulos das ondas 0–1.
- **Passos:** (1) script idempotente que cria/atualiza os configs; (2) doc do catálogo.
- **GATE:** `pnpm tsx scripts/langfuse-score-configs.ts` → 200 para cada config; re-run idempotente.
- **Dependências:** B1/B2. **Onda 2.**

### B8 — LLM-as-judge ONLINE (onda 2)
- **Objetivo:** Evaluator ancorado na ROOT observation (`isRootObservation: true`; trace-level é
  desprecado na v4 — NÃO usar), `sampling` configurável (< 100%), rubrica IGUAL à offline
  (`src/lib/eval/rubric.ts`). Uso: tendência em produção. Nunca gate.
- **Arquivos:** `scripts/langfuse-judge-online.ts` (novo; cria evaluator + rule via
  `/api/public/unstable/evaluation-rules` e `/unstable/evaluators`), `docs/observabilidade/juiz-online.md`
  (novo: runbook de conferência de vida pelo último score — `GET /api/public/v3/scores?name=judge_...&limit=1`).
- **Proibido:** trace-level rule; `src/lib/eval/rubric.ts` como fonte editada (é lida, não alterada).
- **Passos:** (1) LLM Connection apontando para o gateway LiteLLM (`127.0.0.1:4100`), default models
  desligados; (2) rule com filter `isRootObservation: true` e sampling; (3) rubrica colada
  idêntica à de `rubric.ts`; (4) runbook com o aviso do caso medido (rule `enabled:false` ficou 3
  dias parado sem aviso).
- **GATE:** score `judge_avancou` produzido para um turno real dentro de minutos (não dias),
  conferido pelo endpoint do runbook.
- **Dependências:** B2 (traces chegando); paralelo com B7/B9. **Onda 2.**

### B9 — Golden set como DATASET (onda 2; pode iniciar com a onda 0)
- **Objetivo:** 1 item = 1 conversa simulada inteira. `input` = abertura + perfil JSON (caminho
  feliz / nervoso / recusa-telefone / negociação + os do `dataset-seed.md` quando chegar);
  `expected_output` = invariantes de trajetória; `metadata` = perfil/administradora/anúncio.
  Dataset único, filtro por metadata.
- **Arquivos:** `scripts/eval/dataset-seed.ts` (novo: cria o dataset via `/api/public/datasets`),
  `scripts/eval/golden/` (leitura dos `*.json` existentes como fonte dos cenários),
  `src/lib/agent/personas.ts` (leitura).
- **Proibido:** editar os golden JSON existentes para reescrever conduta; os três remendos.
- **Passos:** (1) mapear os 4 perfis base + golden; (2) checar `dataset-seed.md` no diretório da
  demanda; se ausente, registrar PENDENTE-KAIRO e prosseguir com os perfis do repo; (3) seed
  idempotente no dataset da instância.
- **GATE:** `pnpm tsx scripts/eval/dataset-seed.ts` → dataset com ≥ 4 itens, cada um com
  expected_output preenchido; re-run não duplica itens.
- **Dependências:** nenhum (independe de B1/B2 para o seed; a execução depende de B10). **Onda 2.**

### B10 — Dataset run no `pnpm eval` (onda 2, sequencial)
- **Objetivo:** o runner grava run na instância com `datasetRunId`, scores por item (trajetória
  determinística + juiz offline + B4/B5) e score agregado por run. Dois runs comparáveis
  side-by-side.
- **Arquivos:** `scripts/eval-run.ts`, `scripts/eval/langfuse-dataset-run.ts` (novo),
  `scripts/eval/scorer-internals.ts` (se a ligação de scores exigir; único arquivo da pasta
  `scripts/eval/` tocado além dos novos).
- **Proibido:** `turno-livre.ts`, `converse.ts`, `handoff.ts`; trocar o gate (runner) por Prompt
  Experiments.
- **Passos:** (1) runner recebe `--dataset-run` e anexa o run da instância aos itens executados;
  (2) grava scores por item e agregado por run via API; (3) comparação entre dois runs na UI.
- **GATE:** dois `pnpm eval --dataset-run` consecutivos aparecendo na UI comparáveis side-by-side.
- **Dependências:** B7 (configs), B9 (dataset), B1/B2 (ingestão em tempo real). **Onda 2, sequencial.**

### B11 — Monitors na UI (onda 3) — **PENDENTE-KAIRO (login humano)**
- **Objetivo:** sem API (404 medido): monitor `NO_DATA` notificando; taxa `numero_fora_da_cota`
  (1d > 0,10); `conducao_entregue` (1h < 0,92 WARNING / < 0,85 ALERT); `judge_avancou` (1d < 0,5).
- **Arquivos:** `docs/observabilidade/monitors.md` (novo: cada monitor, threshold, canal de
  notificação) + handoff do vault. Nenhum código.
- **Proibido:** tentar API de monitors.
- **Passos:** criar na UI com login humano; calibrar com 1 semana de baseline; registrar cada um no
  vault; anotar o aviso: após 5 falhas de entrega o Langfuse desabilita a automação sozinho.
- **GATE:** doc com os 4 monitors e a prova de notificação (print/log no vault).
- **Dependências:** B4, B5, B8 (scores existindo). **Onda 3.**

### B12 — Dashboards de gargalo (onda 3)
- **Objetivo:** avg/p95 latency, custo, observações com `status: error`, traces por session. Custo
  por conversa = score `custo_conversa` via sessionId (não há agregação nativa).
- **Arquivos:** `scripts/langfuse-custo-conversa.ts` (novo: grava score numérico `custo_conversa`
  por session via API v3), `docs/observabilidade/dashboards.md` (novo: os painéis criados na UI).
- **Proibido:** os remendos; code evaluators.
- **Passos:** (1) job/agendamento que soma custo das generations da session e grava o score; (2)
  dashboards de latency/custo/erro/turnos-por-conversa na UI (documentados, sem versionamento de
  código — risco registrado).
- **GATE:** score `custo_conversa` visível numa session real; doc dos dashboards com prints no vault.
- **Dependências:** B2; paralelo com B13/B14/B15. **Onda 3.**

### B13 — Espelho de prompt (onda 3)
- **Objetivo:** job que espelha cada versão publicada de `caixa_de_prompt` no Langfuse com label
  `production`. Postgres segue a lei; espelho nunca é dependência runtime.
- **Arquivos:** `src/lib/observability/espelho-prompt.ts` (novo),
  `src/lib/observability/espelho-prompt.test.ts` (novo), ponto de chamada na publicação da caixa:
  **[não confirmei]** o arquivo exato da rota de publicação de `caixa_de_prompt` — scout antes de
  implementar; se o ponto de chamada exigir editar arquivo tocado por outro bloco, fica
  **PENDENTE-BLOCO** e o espelho roda como job batch lendo a tabela.
- **Proibido:** fazer o runtime depender do Langfuse; os remendos.
- **Passos:** (1) job/leitor da tabela `caixa_de_prompt` (última versão publicada) → cria/atualiza
  prompt na instância (`/api/public/v2/prompts`) com label `production`; (2) fallback: falha de
  espelho só loga.
- **GATE:** publicar versão nova da caixa (ou rodar o job) → prompt visível na UI com label
  `production`; derrubar o Langfuse não muda o app (no-op).
- **Dependências:** B1/B2. **Onda 3.**

### B14 — Annotation queue (onda 3)
- **Objetivo:** fila de calibração do juiz: enfileirar traces/sessions marcados pelo monitor e pelo
  detector; Kairo julga na fila.
- **Arquivos:** `scripts/langfuse-annotation-queue.ts` (novo: cria a queue via
  `/api/public/annotation-queues` e enfileira pelo filtro de scores).
- **Proibido:** os remendos.
- **Passos:** (1) criar queue `calibracao-juiz`; (2) comando que enfileira traces com
  `numero_fora_da_cota` ou violação de monitor; (3) doc de uso.
- **GATE:** `pnpm tsx scripts/langfuse-annotation-queue.ts` → itens aparecendo na fila da UI.
- **Dependências:** B4/B8. **Onda 3.**

### B15 — Preço do `claude-sonnet-4-6` (M, opcional; qualquer onda)
- **Objetivo:** preço do modelo do juiz em `precos.ts` (campo ausente, comentário em
  `precos.ts:64`).
- **Arquivos:** `src/lib/agent/pi/precos.ts`.
- **Proibido:** os remendos; qualquer outro arquivo.
- **Passos:** registrar preço da fonte oficial (pricing page da Anthropic na versão vigente) com
  data no comentário.
- **GATE:** `pnpm -s typecheck` + teste unitário de precos existente (se houver) verde; custo do
  turno do juiz não mais `null`/0 por falta de preço.
- **Dependências:** nenhuma. **Onda 3 (pode rodar junto da 0/1).**

## PENDENTE (fora desta worktree)

- **B16** (abort/timeout no beat: `AbortController` + `session.abort()` — `converse.ts:123`,
  `turno-livre.ts:1538`) e **B17** (parse do erro do provedor — `converse.ts:56-59`): PENDENTE-BLOCO
  para depois do merge de `chefe-remendos-fala` (D-0080). Registrados no diário.
- **B11** (monitors): exige login humano na UI — PENDENTE-KAIRO.
- **dataset-seed.md**: se não chegar até o B9, os perfis de `personas.ts` + golden cobrem; re-checar
  antes de fechar.

## Definição de pronto (com risco)

**Risco: ALTO** — telemetria de produção, custo de LLM do juiz, ingestão no caminho do turno
(qualquer bloqueio derruba a fala do cliente). Nada daqui é risco baixo porque todos os blocos
tocam o runtime ou a instância que lê produção.

Gates mínimos (comandos, já declarados por bloco): smoke de ingestão < 30 s (B1); trace completo de
conversa real (B2/B3); testes unitários dos detectores + caso reproduzido sem falso positivo
(B4/B5); migration + consulta de p95 (B6); idempotência dos scripts de API (B7/B9/B13/B14); score
do juiz em minutos (B8); dois runs comparáveis (B10). **Sem gate lento** além do eval real (que é
o gate de conduta já pactuado — justificado pelo risco alto de conduta em produção).

## Critérios de pronto (verificáveis por comando)

- `pnpm tsx scripts/langfuse-smoke.ts` → ingestão < 30 s, zero `Span not found in runMap`.
- Trace de conversa real com system da caixa, tool spans, userId, sessionId, TTFT na generation.
- `pnpm test src/lib/observability/sinais/numero-fora-da-cota.test.ts src/lib/observability/sinais/promessa-sem-fato.test.ts src/lib/observability/sinais/duracao-do-turno.test.ts` verde.
- `pnpm drizzle-kit generate` (ou migration aplicada) + `psql` p95 de `duracao_ms` por dia.
- `pnpm tsx scripts/langfuse-score-configs.ts` idempotente; dataset com ≥ 4 itens idempotente.
- `pnpm eval --dataset-run` ×2 comparáveis na UI; score do juiz online produzido em minutos.
- `pnpm -s typecheck` verde; `pnpm eval` verde no fechamento (gate da casa).

## Riscos

- Juiz online parado silenciosamente (medido: 3 dias) → runbook confere vida pelo último score.
- Monitors sem API: drift; registro é o handoff do vault.
- Ingestão nunca bloqueia o turno (fire-and-forget, timeout curto; desenho de `langfuse.ts` mantido).
- Label `production` sem proteção na OSS: disciplina de promoção, não tecnologia.
- Conflito com `chefe-remendos-fala`: qualquer descoberta que exija editar os três arquivos remendos
  trava o bloco como PENDENTE-BLOCO — nunca editar.

## Como você será avaliado

1. Cada afirmação sobre código tem `arquivo:linha` real (checado neste PRD; os que ficaram
   **[não confirmei]** — ponto de publicação da `caixa_de_prompt`, ponto de instrumentação de
   streaming — estão marcados como tarefa de scout, não como fato).
2. Escopos de arquivos disjuntos entre blocos paralelos (nenhum arquivo em dois workers da mesma janela).
3. Nenhum bloco toca `turno-livre.ts`/`converse.ts`/`handoff.ts`; exceções viram PENDENTE-BLOCO.
4. GATE por comando em todos os 15 blocos.
5. Divergências briefing × código registradas na seção de fatos (B1, B6, `langfuse-suite.ts`, `precos.ts`).
6. Veredito de juiz nunca é gate; detector grava sinal, nunca reescreve fala.

## Perguntas em aberto

- **Q1 (parou em: premissa)** — B1: o briefing pede upgrade para ≥ 5.4.0, mas o lockfile já resolve
  5.14.0 (transitivo do plugin 0.1.2). Plano adotou "pinar diretas + smoke". Confirma que o smoke
  basta se provar ingestão < 30 s sem `Span not found in runMap`, ou o chefe quer o upgrade do
  plugin `0.1.2` também (se houver versão nova)?
- **Q2 (parou em: premissa)** — B3: caminho recomendado é camada nossa (envelope antes do plugin)
  em vez de patch do plugin. Há decisão registrada do dono sobre preferir patch/desprezar upgrade
  do plugin que torne o patch mais barato?
- **Q3 (parou em: premissa)** — B11/B12: os monitores e dashboards exigem login humano (PENDENTE-KAIRO).
  O fechamento desta demanda fica bloqueado por eles ou a demanda solta com eles documentados como
  pendência?
