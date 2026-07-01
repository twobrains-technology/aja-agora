---
id: FIX-185
titulo: "Teste pré-existente instável: route.admin-message-persistence conta 36/27 mensagens em vez de 24"
status: done
commit: 34f2694d
executado_em: 2026-07-01
bloco: bloco-c-frontend-e-flaky
severidade: media
projeto: aja-agora
arquivos:
  - src/app/api/chat/route.admin-message-persistence.test.ts
rodada: 2026-07-01 — pego durante o QA da FIX-179 (integration suite)
---

## Palavras do operador
> (não reportado por voz — achado técnico durante o trabalho da FIX-179; regra do CLAUDE.md: "erro
> que você VÊ, você CORRIGE, mesmo pré-existente")

## Cenário / Root cause A INVESTIGAR
Rodando `pnpm test:integration`, 2 casos de `src/app/api/chat/route.admin-message-persistence.test.ts`
falham: esperam 24 mensagens (12 user + 12 assistant), mas o admin GET retorna 36 (assistant=24) e 27
(assistant=15). **CONFIRMADO via `git stash` que é PRÉ-EXISTENTE** — falha sem nenhuma das mudanças da
FIX-179, então NÃO é regressão minha. Provável: acúmulo de dados entre execuções (cleanup incompleto no
`afterEach`/`beforeEach` — o teste tem os dois) OU contagem duplicada real. A investigar no código do
teste + no que o route persiste.

## Correção proposta (A DEFINIR na investigação)
Provar a causa (cleanup vs bug de contagem real) e corrigir teste OU produto conforme o achado — TDD
strict: se for bug de produto, teste de regressão primeiro; se for isolamento do teste, corrigir o
setup/teardown pra ser determinístico (schema/dados efêmeros por teste, como o padrão do FIX-97).

## Regressão exigida
O próprio teste voltar determinístico e verde. Se a causa for de produto (persistência duplicando),
Camada 1 structural cobrindo o count correto.

## Resolução (2026-07-01, commit 34f2694d) — causa PROVADA, NÃO era flaky

**Causa cravada (rodado 3× → 36/27 IDÊNTICO todas as vezes, sem crescer → determinístico,
não flakiness, não cleanup):** double-persist INTENCIONAL num turno de tool **silenciosa**
(`save_contact_name`, sem texto). Duas assistant rows por turno silencioso, por design:
1. **runner.ts:383** grava o marker `[tool: save_contact_name]` — fix do
   BUG-ADMIN-MESSAGE-MISSING (admin não pode perder o turno);
2. **route.ts** via `isTurnEmpty` (FIX-172, `empty-turn-guard.ts` — `save_contact_name` é
   SILENT_TOOL) considera o turno "mudo" e dispara o `EMPTY_TURN_FALLBACK` (turno mudo não
   pode congelar a tela — regressão real vista no WhatsApp).

Contas: tool-only(12) → 12 user + 24 assistant = **36**; mixed(12, 3 silenciosos) →
12 user + (9 texto + 3 marker + 3 fallback) = **27**. O teste antigo assumia exato 2N —
invariante que ficou ESTÁLE quando o FIX-172 (fallback) entrou DEPOIS do fix do marker. A
falha era ORTOGONAL ao propósito do teste (anti-ghosting): o admin recebe de MAIS, nunca de
menos.

**Cleanup/isolamento descartado:** cada caso cria um `convId` novo no `beforeEach` e conta SÓ
esse convId (o `afterEach` ainda limpa). A contagem por-convId torna acúmulo cross-teste
impossível de afetar o número.

**Correção (arquivo de teste, sem tocar produto):** asserts atualizadas pra a composição
intencional atual (marker + fallback), determinísticas, com a garantia central preservada —
`assertNoGhostedUserTurn` exige ≥1 assistant após cada turno do usuário e o admin devolve
EXATAMENTE o que está no DB (`messages.length === dbCount`). Se o produto deduplicar um dia,
as contagens exatas quebram e forçam revisão consciente.

### ⚠️ Questão de produto latente (PENDENTE-KAIRO — decisão de UX, fora do escopo deste card)
O double-persist (marker `[tool: save_contact_name]` + `EMPTY_TURN_FALLBACK`) é a soma de dois
fixes independentes e documentados. Se for indesejável (ex.: o marker `[tool: …]` vazando pro
usuário na retomada, já que `resume.ts` filtra só `content.length > 0`; ou o fallback "me perdi"
soando estranho quando o `save_contact_name` de fato funcionou), reconciliar os dois (o fallback
SUBSTITUIR o marker, ou o marker virar admin-only não-hidratável) é uma decisão de produto/UX
que **reverteria um fix documentado** (BUG-ADMIN-MESSAGE-MISSING ou FIX-172) e mexe no runner
(território do bloco-a nesta onda). Não feito aqui de propósito — registrado pro Kairo decidir.
