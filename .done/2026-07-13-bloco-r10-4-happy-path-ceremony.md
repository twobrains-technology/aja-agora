# Bloco r10-4 happy-path-ceremony — FIX-311

## O que foi implementado

Investigação de causa-raiz (onda 4) achou que `scarcity`/`decision_prompt` NUNCA apareciam em
nenhum dos 2 dossiês limpos investigados (Madalena aceita o hero, Mario segue o aceite direto) —
o funil pulava direto pro fecho assim que o usuário demonstrava interesse claro. Causa: os dois
fast-paths do ramo FELIZ do funil (`route.ts:508-522`, ação `interest`; `route.ts:1125-1145`,
aceite do gate `simulator-offer`) iam direto pro próximo passo sem passar pela cerimônia de
fechamento — que só existia, corretamente implementada, no ramo de recusa/ambiguidade do
simulador (`route.ts:1147-1189`). Quem hesitava recebia MAIS cuidado no fecho do que quem aceitava
de cara — o inverso do que o produto quer.

**Forma da extração escolhida:** função helper local ao arquivo, `pipeClosingCeremony`
(`src/app/api/chat/route.ts`) — sem módulo novo nem parametrização extra além do necessário
(`conversationId`/`meta`/`contactName`/`writer`/`userKey`). Dispara `buildScarcityDirective` → card
`scarcity` → `buildDecisionPromptDirective` → card `decision_prompt`, na mesma ordem de antes.
Idempotência (`decisionDispatched`) continua responsabilidade do CALLER, igual ao padrão que já
existia no ramo de recusa.

Os dois fast-paths religam ao helper, ambos guardados por `if (!decisionDispatched)`:
- **Ação `interest`:** religa a cerimônia ANTES de `buildAdvanceToContractDirective` — reverte
  conscientemente a decisão do FIX-38 ("clique explícito pula o card de decisão"). Achado real:
  "aceitar de cara" não é dispensa de cuidado, é só um caminho mais curto até a mesma decisão.
- **Gate `simulator-offer="yes"`:** o dial (`buildSimulatorDialDirective`, conceito do Bernardo)
  continua sendo mostrado — não foi removido — e a cerimônia dispara DETERMINISTICAMENTE logo em
  seguida, no MESMO turno, em vez de depender de um turno de texto livre futuro classificar a
  resposta como avanço (`orchestrator/index.ts`, fora do escopo deste bloco) — o que nos 2
  dossiês investigados nunca acontecia, porque o clique seguinte ia direto pro fast-path
  `interest`, que também pulava a cerimônia.

## TDD (integração, RED→GREEN provado)

`src/app/api/chat/route.fix-311-happy-path-ceremony.integration.test.ts` (DB real, agente
mocado que nunca chama tool — mesmo padrão do FIX-246), 4 cenários:
1. Ação `interest`: `scarcity` e `decision_prompt` aparecem, nessa ordem — **FALHOU antes** (nenhum
   dos dois aparecia), **passou depois**.
2. Gate `simulator-offer="yes"`: mesma cerimônia, mesma ordem, no mesmo turno do dial — **FALHOU
   antes**, **passou depois**.
3. Ação `interest` com `decisionDispatched` já `true` (cerimônia já mostrada por outro caminho):
   NÃO repete a cerimônia (idempotência) — já passava antes (trivial) e continua passando.
4. Regressão — gate `simulator-offer="no"` (ramo de recusa/ambiguidade): cerimônia continua
   idêntica após a extração — já passava antes e continua passando.

3 arquivos de teste pré-existentes travavam a decisão ANTIGA do FIX-38 e foram atualizados pra
refletir a reversão consciente ("palavra nova vence" — FIX-311 supera FIX-38 de propósito, os
guards antigos foram corrigidos, não defendidos):
- `src/app/api/chat/route.lead-form-prefill.test.ts`
- `tests/regression/agent-trajectory.test.ts` (describe `FIX-38-NO-DOUBLE-CONFIRM` renomeado pra
  `FIX-311-HAPPY-PATH-CEREMONY`)
- `tests/regression/fix-237-cards-orfaos.test.ts`

`pnpm test:unit` completo verde ao final: 368 arquivos / 3403 testes. `pnpm typecheck` e lint
(biome) sem erro nos arquivos tocados.

## Infra usada

- DB do workspace: `aja_agora_ws_r10_4_happy_path_ceremony` clonado de `aja_agora_template`
  (Postgres shared `aja-shared-pg`, acessível do host via DNS `.orb.local` do OrbStack —
  `bootstrap-workspace.sh --db-only`, sem precisar de container próprio pra rodar vitest).
- `.env.local` do worktree gerado incompleto pelo bootstrap (mesma classe da lição "Worktree env
  bootstrap") — `DATABASE_URL` corrigido pro banco do workspace via a ponte `.orb.local`, e
  `IDENTITY_ENC_KEY` (vazio no template, bloqueava 2 testes pré-existentes não relacionados a este
  fix) backfilled do clone principal.

## Resumo final

- **Extração:** função helper local `pipeClosingCeremony`, sem abstração maior que o necessário.
- **Teste de regressão:** ramo de recusa/ambiguidade (`simulator-offer="no"`) coberto e continua
  idêntico após a extração.
- **Caso de borda fora do escopo:** o caminho de texto livre (`orchestrator/index.ts`,
  `nextGateToFire === "decision"`) já implementava a cerimônia corretamente e não foi tocado —
  fora de `escopo_arquivos` do bloco (só `src/app/api/chat/route.ts`).
- Nenhum PR aberto, nenhum merge feito — só push da branch, conforme a regra da onda.
