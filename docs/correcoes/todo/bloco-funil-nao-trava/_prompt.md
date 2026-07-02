Você é o executor do **bloco-funil-nao-trava** (hotfix) no worktree isolado deste branch
(`fix/funil-nao-trava`). Projeto: **aja-agora** (Next.js 16 + Vercel AI SDK 6 + Drizzle +
Postgres). Idioma: **PT-BR**. Package manager: **pnpm** (ÚNICO — `npm`/`yarn`/`npx` proibidos).

## 0. Contexto — leia PRIMEIRO (o refinamento já está feito)

A causa-raiz JÁ FOI investigada e PROVADA na sessão principal (arquivo:linha nos cards). A
decisão de produto JÁ FOI tomada pelo Kairo. **Você NÃO reabre o design** — implementa o que
está fechado, com TDD. Leia, nesta ordem:

1. `docs/correcoes/todo/bloco-funil-nao-trava/_bloco.md` — o manifesto e a decisão.
2. `docs/correcoes/todo/bloco-funil-nao-trava/fix-206-*.md` — root cause provado + correção
   proposta da **estratégia 1** (auto-avanço determinístico).
3. `docs/correcoes/todo/bloco-funil-nao-trava/fix-207-*.md` — **estratégia 3** (watchdog).
4. `CLAUDE.md` do projeto — em especial **"Regressão de agent — 3 camadas OBRIGATÓRIAS"** e
   as **REGRAS DE PRODUTO INVIOLÁVEIS** (Bevi fonte única, nada mockado em runtime).
5. `docs/jornada/jornada-canonica.md` (se existir) — a jornada é REGRA; o funil deve CONDUZIR.
6. Os arquivos-fonte citados nos cards (`qualify-state.ts`, `runner.ts`, `index.ts`,
   `interactive-handlers.ts`, `adapter.ts`, `route.ts`, e os moldes `proposal-status-poll.ts` +
   `stream-watchdog.ts`).

**A decisão do Kairo (não reabrir):** estratégia = **1 + 3** (auto-avanço no mesmo turno **E**
watchdog por inatividade); escopo = **varrer TODOS os pontos de trava** (matar a classe).

## 1. TDD STRICT — inegociável (bug = regra de TDD do Kairo)

Para CADA item, **escreva o teste de regressão PRIMEIRO, veja FALHAR com a assinatura certa,
só então corrija.** Nada de fix antes do teste vermelho. As **3 camadas** são OBRIGATÓRIAS
(este é bug de comportamento do agent):

- **Camada 1 (structural)** — asserts contra a fonte (`qualify-state.ts`/`runner.ts`): o funil
  não termina turno server-authored em `doubts-wait` mudo; `nextGateToFire !== null` no clique
  "Tenho dúvidas"; função pura do watchdog decide re-engajar nos limites certos.
- **Camada 2 (cassette determinístico)** — `tests/regression/agent-trajectory.test.ts`: cassette
  novo do bug (agente explica consórcio sem pergunta → turno emite o gate `consent`, não fecha
  mudo). `MockLanguageModelV2` + `simulateReadableStream`. Zero chamada Anthropic. **Append ao
  arquivo — reconstrução determinística + imports, NUNCA union/merge cego** (memória do Kairo).
- **Camada 3 (eval)** — `tests/eval/agent-flow.eval.test.ts`: estrutura o cenário (persona leiga
  não fica presa). Só roda nightly; critério estrutural, não bloqueia merge.

Detalhe da regressão por item está nos cards. Um bug de agent SEM cassette na Camada 2 é
**proibido** (CLAUDE.md).

## 2. Ordem de execução

1. **FIX-206** (estratégia 1) primeiro — é o caminho determinístico e o do print. Cobre:
   beco sem saída do `doubts-wait` via clique + varredura das reações server-authored +
   paridade web↔WhatsApp.
2. **FIX-207** (estratégia 3) depois — o watchdog. Ancore no molde `proposal-status-poll.ts`
   (WhatsApp) e `stream-watchdog.ts` (web). Priorize o WhatsApp; se o push web for custoso
   demais, entregue o WhatsApp completo e deixe o web como **PENDENTE-KAIRO** documentado no
   `.done/` (NÃO finja cobertura que não existe).

## 3. Invariantes de domínio (repita mentalmente antes de cada mudança)

- **Auto-avançar ≠ PULAR etapa.** NÃO reintroduzir o BUG-FUNIL-PULA-PASSO2 (`analyze.ts:147-166`):
  cada gate obrigatório da jornada continua APARECENDO — o fix é não exigir "continua/vai", não
  suprimir etapa.
- **Idempotência total** — re-engajar/auto-avançar NUNCA duplica mensagem nem re-dispara gate já
  respondido (respeite `consentOffered`, `searchDispatched`, `decisionDispatched`,
  `simulatorOfferDispatched`).
- **Nunca** re-engajar conversa em handoff humano, fechada (`contractClosed`) ou em coleta de lead.
- **Lei 4 (arquitetura de IA do Kairo)**: invariante crítico vira CÓDIGO, não regra-no-prompt. O
  auto-avanço e o watchdog são governança determinística no orquestrador/worker — não "peça pro
  modelo continuar".
- **Bevi é fonte única** — este fix é de orquestração; não toca descoberta/simulação. Não
  introduza nenhum dado mockado em runtime.
- **PT-BR correto** em qualquer copy nova ao usuário (acentos/cedilha). Zero cara de IA.
- **Serialização do meta** — se adicionar campo no `ConversationMetadata` (FIX-207), cuidado com
  o Drizzle/meta (já quebrou a develop uma vez). Rode o gate com o pg migrado.

## 4. Gate verde ANTES de pushar (no ambiente do workspace)

- `pnpm test:unit` **verde** (é o gate de merge deste projeto — a suíte structural + cassettes).
- Se tocar algo com typecheck local do arquivo, corrija — mas o gate de merge é `test:unit`
  (o `tsc` whole-repo já tem dívida vermelha em test files na develop; não é seu escopo).
- O **pre-commit hook** (Camadas 1+2) roda automático; mantenha verde. **NUNCA `--no-verify`.**
- Vermelho **não pusha**.

## 5. Commits & entrega (implement-and-push — você NÃO integra)

- **Conventional Commits PT-BR**, imperativo minúsculo, pequenos. Bug → `test+fix:` num commit
  (teste + fix juntos, com o teste tendo falhado antes). Se mexer em prompt/cassette, atualize
  `HARD_RULES.md` no MESMO commit.
- Ao concluir cada item: **mova** o card `fix-NN` pra `docs/correcoes/done/` (`status: done` +
  `commit` + `executado_em`). Bloco esvaziou → apague a pasta `todo/bloco-funil-nao-trava/`.
- Ao terminar tudo: `git push origin fix/funil-nao-trava` + gere
  `.done/2026-07-02-funil-nao-trava.md` (pitch de negócio: a jornada agora CONDUZ sozinha).
- **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO eleve pra prod.** A
  integração e a elevação a develop+prod são do ORQUESTRADOR (Kairo/sessão principal).

## 6. Resumo final (no `.done/` e no output)

- O que mudou (206 e 207), arquivo por arquivo.
- Os testes das 3 camadas — com a evidência de que **falharam ANTES** do fix.
- O que ficou **PENDENTE-KAIRO** (ex.: watchdog web, se não coube) — honesto, com o caminho fechado.
- Qualquer trava (sem Redis, sem env) — com evidência do que testou, não disfarçada.
