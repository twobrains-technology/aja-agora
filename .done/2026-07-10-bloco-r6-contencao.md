# Bloco r6 — Contenção do LLM em código (a troca de ângulo do loop)

> 2026-07-10 · branch `fix/r6-contencao` · FIX-262 + FIX-263
> Fonte: `docs/correcoes/rodada2-fable/veredito-fable-r5.md` (Fable r5, 5/10 — 2 P1 fecharam pela metade)

## O que estava quebrado (por que isso importa)

A nota do loop estagnou 5→5 entre as rodadas 4 e 5 porque os invariantes críticos continuavam
escritos no **prompt** — e um LLM sob contestação real ignora regra-no-prompt. Duas causas-raiz
novas, mapeadas ao vivo pelo Fable:

1. **Buraco mudo do `tool-error`**: quando o modelo chamava `search_groups` fora do toolset da
   fase (reveal/closing excluem descoberta), o AI SDK v6 emitia um chunk `tool-error`
   (NoSuchToolError) que o runner **não tratava** — caía no mesmo `output: null` silencioso de
   "a busca rodou e não achou nada". O modelo concluía "não existe" e **negou 3× ofertas que
   estavam na própria tabela** exibida ao usuário. Na pior forma, a contestação virou um turno de
   **34 tool-calls / 593 segundos**, com 4 fallbacks repetidos — um DoS de si mesmo.
2. **Seam do fechamento**: confirmação **textual** de uma administradora (o usuário digitou
   "ITAÚ" 3×) nunca re-ancorava `recommendedOffer` — só o clique fazia isso. O aviso de troca de
   marca nomeava a marca **anterior errada** (snapshot stale). E o anti-refazer (nunca reabrir o
   fechamento de outra marca depois de uma proposta registrada) era regra-no-prompt: sob
   contestação, o agente **negou a proposta RODOBENS já registrada** e **afirmou falsamente que a
   ITAÚ estava registrada** (sem nunca chamar `check_proposal_status`) — a 1 clique de criar uma
   2ª proposta real (CPF + consulta de bureau) na mesma conversa.

## O que foi entregue

### FIX-262 — `tool-error` tratado + cap duro de tool-calls por turno
- Novo `case "tool-error"` no consumo do `fullStream` (`runner.ts`), com log estruturado e
  diferenciado (`tool-io-log.ts`, `outcome: "tool_error"` — nunca mais indistinguível de "rodou e
  não achou nada").
- Ao detectar `tool-error` OU estourar `TOOL_CALL_HARD_CAP = 12` (contagem de tool-calls REAIS do
  turno — `stepCountIs(10)` só limitava STEPS do modelo, e um step pode carregar várias chamadas
  paralelas, o que explica os 34 calls observados), o runner **para de relayar qualquer coisa pro
  usuário** neste turno (nenhum texto do modelo passa) e aborta a geração em background
  (`AbortController`, melhor esforço de custo/latência).
- O orchestrator assume com um fallback determinístico (`buildToolErrorRecoveryFallback`) que
  **reafirma** as opções já mostradas — nunca as nega.

### FIX-263 — Re-âncora textual + anti-refazer de proposta em código
- `index.ts`: confirmação textual de uma oferta já exibida (nome/valor batendo com um card do
  reveal) re-ancora `recommendedOffer`/`recommendedAdministradora` deterministicamente — mesma
  rota do clique `choose_offer`, agora também pro texto livre. Só pós-reveal, só com os 3 números
  completos, nunca ancora no escuro (Lei 3).
- `contract-input.ts`: `administradoraConflictsWithRegisteredProposal` — função pura que decide
  se o fechamento em curso conflita com uma proposta REAL já registrada.
- `route.ts` (`contract-submit`): guard ANTES de `startContract` que consulta
  `getLatestBeviProposal` (a fonte de verdade — tabela `bevi_proposals`, nunca o que o modelo
  afirma) e bloqueia com mensagem determinística quando a administradora pedida diverge da já
  registrada, nomeando a marca CERTA e convidando a checar o status.

## Decisões de design (decidi X em vez de Y porque Z)

- Decidi **suprimir TUDO do turno assim que `tool-error`/cap disparam** (não só o texto) em vez de
  deixar o modelo terminar o turno "sabendo do erro", porque o veredito provou que uma mensagem de
  erro no contexto não impede o modelo de negar a oferta de qualquer forma — a garantia tem que
  ser incondicional, não uma esperança de que o modelo reaja bem à instrução.
- Decidi **cap por CONTAGEM DE TOOL-CALLS real (não só steps)** porque `stepCountIs(10)` já
  existia e não preveniu os 34 calls — um step pode carregar várias chamadas paralelas/sentinelas.
- Decidi **abort best-effort via `AbortSignal` + `break` imediato no consumo**, em vez de deixar o
  stream terminar sozinho, porque o custo real do bug (593s) é de geração em background, não só de
  UX — cortar a montante importa mesmo sem garantia de que o SDK respeita 100% do tempo.
- Decidi **re-ancorar no `index.ts` (antes do modelo)** em vez de no `runner.ts` pós-turno, porque
  o aviso de troca de marca e o systemContext do PRÓPRIO turno já precisam da âncora atualizada —
  ancorar depois seria tarde demais pro turno corrente.
- Decidi **guard de anti-refazer no HANDLER de submit (`route.ts`)**, não no artifact-guard
  (`runner.ts`), porque a checagem exige leitura assíncrona de `bevi_proposals` (DB real) — o
  artifact-guard é síncrono por desenho; e o risco real (CPF + bureau) está no SUBMIT, não em
  mostrar o card.

## Testes (TDD strict — RED→GREEN registrado em cada item)

- **FIX-262**: `tool-io-log.fix-262-tool-error.test.ts` (unit + estrutural — log diferenciado,
  case tratado, cap exportado) + `runner.fix-262-tool-error-cap.integration.test.ts` (DB real —
  reproduz o cenário exato do veredito: comparação de 2 marcas → `tool-error` → negação
  suprimida; loop de tool-calls → cap respeitado, fallback nunca vaza).
- **FIX-263**: `contract-input.test.ts` (+5 casos da função pura) +
  `index.fix-263-reancora-textual.integration.test.ts` (DB real — confirma por texto re-ancora;
  menção ambígua/pré-reveal NUNCA ancora) + `route.fix-263-antirefazer.integration.test.ts` (DB
  real — bloqueia 2ª proposta de marca diferente; permite retry da MESMA marca; permite a 1ª
  proposta normalmente).
- Cada teste de regressão foi confirmado FALHANDO antes da implementação (stash/revert pontual +
  re-run), depois verde após o fix.

## Gate

- ✅ `pnpm test:unit` (container, workspace `r6-contencao`) — **337 arquivos, 3168 testes, 0
  falhas**.
- ✅ `pnpm test:integration` (`RUN_DB_TESTS=1`) — **74 arquivos, 297 testes, 0 falhas** — nenhuma
  regressão nos FIX r1-r5 (contract-submit, choose-offer, fulfillment, leads, admin guards, etc.).
- ✅ `biome check` limpo nos arquivos tocados (2 imports mortos pré-existentes em `route.ts`
  removidos como limpeza colateral).
- ⚠️ `tsc --noEmit` whole-repo segue com dívida pré-existente em arquivos de teste (gate do
  merge-wave é `test:unit`, não typecheck — decisão já registrada no projeto); meu código não
  introduziu nenhum erro de tipo novo (confirmado por diff do output do tsc antes/depois).

## Gaps / PENDENTE-KAIRO

- **Fora de escopo deste bloco** (achados N3-N8 e "pro teto" #2 do veredito r5, ex.:
  `resolveOfferByMention` v2 com valueMatch como CONJUNTO, `simulatorOfferAnswered` no clique,
  acento no catálogo parceiro "ITAU"): pertencem ao `bloco-r6-mencao-polish` (paralelo) ou a uma
  próxima rodada — não tocados aqui pra não colidir com escopo de arquivo compartilhado.
  `escopo_arquivos` deste bloco era `runner.ts` (FIX-262) e `index.ts`/`route.ts`/
  `contract-input.ts` (FIX-263) — respeitado à risca.
- **Não validado ao vivo** (E2E real contra a Bevi) — a verificação foi TDD com DB real +
  integração completa; a próxima rodada do Fable é quem re-exercita ao vivo se os 2 P1 fecharam de
  verdade desta vez.
