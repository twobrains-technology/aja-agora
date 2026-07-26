---
bloco: bloco-h-resume-mesa
branch: fix/resume-stage-mesa
campanha: .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md (ITENS 2 e 3)
itens: [FIX-364, FIX-365]
executado_em: 2026-07-22
commits:
  - 5c714d30 (test+fix: nextGate nao reemite gate de qualificacao com proposta fechada)
  - 5d1e81eb (fix: remove checagem redundante de contractClosed em nextGate — typecheck)
  - f48a3285 (test: prova idempotencia da notificacao de mesa no aceite)
  - beef8e83 (docs: move fix-364/365 para done/, bloco esvaziado)
---

# Bloco H — Resume reconhece fechamento + mesa notificada sem duplicar

## Resumo

Dois itens da campanha "vendedor-matador-consórcio" (ITEM 2 e ITEM 3 do goal doc).
FIX-364 exigiu uma correção de código real (short-circuit em `nextGate`). FIX-365
confirmou que a feature pedida **já existia** — o trabalho foi só a prova de
regressão (idempotência), sem reimplementar nada.

`pnpm tsc --noEmit` limpo. Testes rodados isoladamente por arquivo tocado (não a
suíte inteira, por instrução do modo de urgência) — todos verdes.

## FIX-364 — resume não reconhece etapa mesa

**Root cause confirmado**: `nextGate` (`src/lib/agent/qualify-state.ts:237`) não
fazia short-circuit quando `meta.contractClosed === true` — a cascata de
qualificação (credit/identify/lance/decisão/...) rodava por cima do fechamento
sempre que algum flag intermediário estivesse ausente no meta na hora do check
(ex.: meta reidratado no resume server-side). Resultado: cliente que já fechou a
proposta e voltava ("Voltei") recebia de novo pergunta de etapa anterior
("com lance ou só sorteio mesmo?"), porque `pendingGate` (que alimenta
`buildSystemContext` em `orchestrator/index.ts:816` e o `gate` de
`resume.ts:125`) vinha errado.

**Correção**: linha nova no TOPO de `nextGate` — `if (meta.contractClosed ===
true) return "search";` — antes até do gate `name`. `"search"` é o MESMO
terminal que a cauda da cascata já devolvia no caminho feliz (sem card, sem
pergunta — confirmado em todos os switches consumidores: `gatePartData`,
`gateQuestion`, `decideShowGate`). Precisou de um segundo commit
(`5d1e81eb`) só pra remover uma checagem `!== true` que ficou redundante (e
quebrava o `tsc` por narrowing impossível) mais adiante na mesma função.

`resume.ts` **não precisou de mudança de código** — já deriva o `gate` da
retomada via `nextGate(metaCompleta, ...)`; com o short-circuit corrigido na
fonte única, o card vem `null` automaticamente. A saudação (COPY) continua
100% do modelo: o turno normal ("Voltei" via `/api/chat`) já injeta
`contractClosedSection` (FIX-11, pré-existente) + a instrução geral de que um
atendente contata o cliente por WhatsApp após o fecho (`system-prompt.ts:415`,
pré-existente) — o que faltava era só o FATO determinístico (`pendingGate`
certo) chegar direito ao modelo.

**Testes** (TDD strict, falharam antes do fix, passam depois):
- `src/lib/agent/qualify-state.fix-364.test.ts` — unit de `nextGate` (3 casos:
  meta mínimo, jornada completa com meta incompleto, controle "sem
  contractClosed segue a cascata normal").
- `src/lib/chat/resume.fix-364.test.ts` — integração de `getResumableConversation`
  (mock de `@/db`) provando `gate === null` com `contractClosed: true`.

## FIX-365 — mesa notificada sem duplicar

**Root cause confirmado (2ª investigação, a 1ª versão do card estava errada)**:
a ligação stage+notificação de mesa **já existia** — `createBeviProposal`
(`proposal-repo.ts:76`) já chama `transitionLeadStage(..., "proposta_enviada")`
no fechamento; `sendFechoPedirOi` já chama `dispatchAutoTransbordo` (web
`route.ts:1011` / `fecho-pedir-oi.ts:126`); e `createMesaHandoff`
(`mesa/handoff.ts:135-145`) **já é idempotente** — checa handoff ATIVO
(`aberto`/`em_andamento`) antes do INSERT. `dispatchAutoTransbordo`
(`mesa/dispatch.ts`) só faz broadcast quando o handoff foi criado nesta
chamada. O worker de polling (`src/lib/workers/proposal-status-poll.ts:69` —
não `whatsapp/workers/...` como o card original apontava, caminho
desatualizado) só rechama o transbordo quando a raia REALMENTE mudou pra
`na_administradora`, não a cada tick.

**Nenhuma correção de negócio foi necessária** — só faltava a prova de
regressão. Dois arquivos novos:
- `src/lib/mesa/dispatch.fix-365.integration.test.ts` — DB real (`describeIfDb`,
  mesmo padrão de `handoff.integration.test.ts`): simula aceite
  (`dispatchAutoTransbordo` com lead em `proposta_enviada`) → poll (lead avança
  pra `na_administradora`, `dispatchAutoTransbordo` de novo) → prova
  **exatamente 1** handoff ativo por lead.
- `src/lib/mesa/dispatch.fix-365.structural.test.ts` — Camada 1 (sem DB, roda
  em qualquer ambiente): trava em código-fonte os 3 guards que sustentam a
  garantia.

## Decisões técnicas tomadas durante a implementação

- **Terminal escolhido para `nextGate` com contrato fechado: `"search"`**, não um
  valor novo no enum `Gate`. Reusa o mesmo terminal que a cauda da cascata já
  produzia no caminho feliz — zero switches novos pra atualizar (todos os
  consumidores exaustivos de `Gate` já tratam `"search"` como "sem card, sem
  pergunta"), menor blast radius que introduzir um literal novo no tipo.
- **Posição do short-circuit**: literalmente a PRIMEIRA linha de `nextGate`,
  antes até do gate `name` (`opts.hasContactName === false`) — seguindo à risca
  o pedido do fix card ("ANTES de qualquer outro gate"). Na prática um contrato
  fechado sempre tem nome capturado, mas a precedência absoluta é o que dá a
  garantia à prova de meta incompleto/malformado.
- **FIX-365 não teve teste de integração executado neste ambiente** — worker de
  bloco/onda não sobe stack de banco (convenção `local-dev`), e não havia
  `DATABASE_URL` no worktree. O teste de integração real está escrito e correto
  (segue o padrão `describeIfDb` já usado em `handoff.integration.test.ts`),
  mas roda de fato em CI/sessão com Postgres. Escrevi também um teste
  estrutural (Camada 1, sem DB) que executou e passou aqui, cobrindo os 3
  invariantes de código que sustentam a garantia — gap honesto, não escondido.
- **`resume.ts` não foi editado** — o fix card pedia para "ajustar resume.ts",
  mas a investigação mostrou que ele já deriva tudo de `nextGate`; a correção na
  fonte única (`qualify-state.ts`) propaga automaticamente. Documentado
  explicitamente no fix-364 movido pra `done/` pra não parecer omissão.

## Gaps honestos

- FIX-365: teste de integração real (DB) escrito mas não executado neste
  ambiente (sem Postgres disponível ao worker de bloco) — só o teste estrutural
  rodou e passou. Recomendo rodar `pnpm vitest run
  src/lib/mesa/dispatch.fix-365.integration.test.ts` numa sessão com
  `DATABASE_URL` (dev local ou CI) antes de considerar o item 100% fechado.
