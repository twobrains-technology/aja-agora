# Bloco r9-4 valor & honestidade — FIX-292 + FIX-293

## Resumo

Dois itens P1/I2 pequenos e afins (veredito r9pos3, Sonnet 5, §3), mesmo tema: exatidão do que o
agente afirma sobre a recomendação já mostrada em tela.

- **FIX-292** (P1, Cálculo): `monthlyPayment` de um artifact ficava do CENÁRIO ERRADO mesmo
  depois do FIX-287 corrigir `creditValue` — mistura de dois cenários financeiros dentro do
  MESMO artifact.
- **FIX-293** (P2, UX): a resposta determinística de "por que essa e não outra?" (FIX-282) só
  disparava dentro do caminho de tool-error — no caminho normal (de LONGE mais comum) o modelo
  respondia livre, inventando estado de grupo ("cheio"/"pausado") e especulando administradora.

## FIX-292 — `monthlyPayment` vira fonte única multi-campo

### Root cause (já investigado no card, confirmado no código)

`coerceRevealCota` (`recommendation-payload.ts`) sobrescrevia SÓ `creditValue` quando um groupId
já tinha um `simulation_result` conhecido divergente — `monthlyPayment` continuava vindo da
estimativa antiga, dessincronizado do `creditValue` real recém-corrigido. A causa raiz: a "fonte
única de creditValue por groupId" do FIX-287 era literalmente única PRA creditValue — não havia
equivalente pra `monthlyPayment`.

### Implementação

- `known-credit-values.ts`: `extractKnownCreditValue` passa a exigir `creditValue` **e**
  `monthlyPayment` válidos juntos (retorna `null` se só um dos dois vier utilizável — nunca
  contamina o mapa com metade do cenário); captura `termMonths` quando disponível. Novo tipo
  `KnownGroupValue = {creditValue, monthlyPayment, termMonths?}`.
- `recommendation-payload.ts`: `coerceRevealCota` agora sobrescreve `creditValue`,
  `monthlyPayment` e (quando disponível) `termMonths` do MESMO registro conhecido — nunca um
  campo do cenário antigo ao lado de um campo do cenário novo. `rawCreditValue` continua só
  disparando quando `creditValue` diverge (mesmo contrato de aviso do FIX-197/261/287).
- `runner.ts`: `turnKnownCreditValues`/`getKnownCreditValues` trocam de `Map<string, number>` pra
  `Map<string, KnownGroupValue>` — os 3 call-sites (`coerceRecommendationPayload`,
  `coerceComparisonPayload`, captura do `simulate_quota` do turno) atualizados.

### Excluído deliberadamente do escopo

O card sugeria considerar também `adminFeePercent`. Não incluí: `simulation_result.adminFee` é
**R$ absolutos** (`offer-mapper.ts:199`), enquanto `adminFeePercent` do grupo é **percentual**
(`offer-mapper.ts:143`) — mapear um pro outro seria introduzir um bug novo de unidade. Verificado
no código antes de decidir (ver ADR).

### Testes

- Novo `recommendation-payload.fix-292-monthlypayment-consistente.test.ts` — RED confirmado
  (3/5 casos falhavam antes do fix), GREEN depois. Cenário exato do dossiê (probe-i3-fabricacao,
  turno 7): `creditValue:150000/monthlyPayment:3549.75` (estimativa) vs conhecido
  `creditValue:211258/monthlyPayment:5136.66` → resultado tem os DOIS campos do cenário
  conhecido, nunca a mistura antiga. Casos extras: `termMonths` propagado, groupId nunca
  simulado (comportamento intocado), coincidência de `creditValue` sem divergência (ainda assim
  aplica `monthlyPayment` conhecido).
- `recommendation-payload.test.ts` (FIX-287, existente): 3 testes atualizados pro novo shape do
  Map + 1 assert nova de `monthlyPayment` — continuam verdes.
- `known-credit-values.test.ts`/`known-credit-values.integration.test.ts`: extrator/loader
  atualizados e estendidos (novo teste: `monthlyPayment` ausente/inválido → `null`).

## FIX-293 — justificativa determinística fora do tool-error

### Root cause (já investigado no card, confirmado no código)

`isExactnessOrCriteriaQuestion`/`buildToolErrorRecoveryExactnessFallback` (FIX-282) é a ÚNICA
resposta determinística pra "por que essa e não outra?" — mas o único call-site
(`orchestrator/index.ts`) fica DENTRO do bloco `if (toolErrorThisTurn || toolCallCapExceededThisTurn)`.
Fora dessa condição estreita (o caso comum: pergunta em texto livre normal, sem nenhum guard
interceptando o turno), o modelo respondia 100% livre.

### Implementação

- `orchestrator/index.ts`: novo short-circuit **ANTES** de `runAgentTurn` — mesmas 4 condições do
  bloco de tool-error (`isUserTurn && revealCompleted && isExactnessOrCriteriaQuestion(userText)
  && recommendedOffer.creditValue conhecido`). Reaproveita as MESMAS funções do FIX-282
  (`isExactnessOrCriteriaQuestion`, `buildToolErrorRecoveryExactnessFallback`) sem renomear.
- `system-prompt.ts`: nova REGRA DURA na seção "Textos de recomendação" proibindo alegar estado
  de grupo (cheio/pausado/outra administradora) sem tool-output — reforço de 2ª linha pro
  caminho residual (perguntas fora do padrão regex).

### Decisão de arquitetura (ver ADR completa)

O short-circuit tem que rodar **antes** de invocar a LLM, nunca depois — `runAgentTurn` é
consumido via `yield*`, que repassa `text-delta` pro usuário em tempo real conforme a LLM gera.
No caminho de tool-error, o runner deliberadamente NUNCA emite `text-delta` (é só por isso que o
FIX-282 consegue interceptar `result` depois); no caminho normal, um filtro pós-`result` chegaria
tarde demais — o texto livre já teria vazado. Essa é a resposta ao trade-off que o `_prompt.md`
pedia pra resolver ("como estender sem quebrar tool-error") — veio da leitura do código
(streaming ao vivo via `yield*`), não de uma escolha arbitrária, por isso não parei em
`AskUserQuestion`.

### Testes

- Novo `index.fix-293-honestidade-caminho-normal.integration.test.ts` (DB real, mesmo padrão do
  `index.fix-282-honestidade-toolerror.integration.test.ts`) — RED confirmado (LLM mockada era
  invocada, resposta fabricada vazava), GREEN depois. 4 cenários: pergunta de critério SEM
  tool-error → LLM NUNCA invocada (`resolveAgentMock` não chamado) + resposta cita números reais;
  pergunta de exatidão idem; `"quero ver mais opções"` (fora do padrão) → segue normal, LLM
  invocada; pergunta ANTES do reveal → segue normal (nada pra justificar ainda).
- Novo `system-prompt.fix-293-honestidade-justificativa.test.ts` — assert de conteúdo (mesmo
  padrão de `system-prompt.recomendacao-integridade.test.ts`): a REGRA DURA existe, é proibitiva
  (não sugestão) e ancora a resposta em tool-output/score real.
- **Regressão do FIX-282 preservada**: `directives.test.ts` +
  `index.fix-282-honestidade-toolerror.integration.test.ts` rodados junto — 100% verdes, sem
  nenhuma mudança de comportamento no caminho de tool-error.

## Suíte completa

`pnpm test:unit`: **361 arquivos, 3331 testes, 100% verde**. Rodado num Postgres isolado deste
workspace (bootstrap via skill `local-dev` — o `.env.local` herdado do clone principal apontava
pro DB de OUTRO workspace/`develop`; corrigido pra `db.aja-r9-4-valor-honestidade.orb.local` +
migrations aplicadas). `tsc --noEmit`: nenhum erro novo nos arquivos tocados (1 erro
pré-existente em `runner.ts:481`, dívida documentada — gate do projeto é `test:unit`, não
typecheck).

## Incidentes durante a execução (registrados por transparência)

1. **Env do worktree incompleto**: sem `.env.local`/`DATABASE_URL` funcional. Backfill do clone
   principal (`~/code/aja-agora/.env.local`) resolveu boa parte, mas o `DATABASE_URL` herdado
   apontava pro Postgres de outro workspace (`develop`) — corrigido subindo a stack isolada
   deste workspace via `bootstrap-workspace.sh` + `pnpm db:migrate`.
2. **Gate Camada 3 do pre-commit** (`EVAL-SAVE-CONTACT-NAME-CIRURGICO`, roda em toda mudança sob
   `src/lib/agent/`) dependia de `gpt-4.1` no gateway LiteLLM compartilhado, que:
   - não estava liberado no allowlist da virtual key `aja-agora-dev` (corrigido via
     `/key/update`, alcançado por túnel SSM programático — `scripts/tunnel-litellm.sh`, SEM VPN
     no host);
   - nem estava configurado no `config.yaml` do gateway shared (adicionado, subido pro S3 —
     `templates/litellm/configs/config.yaml`, commitado no repo `twobrains-aws-platform`).
   O **restart do serviço `litellm-shared`** (ECS force-new-deployment) pra aplicar o config novo
   foi bloqueado por guard-rail do próprio sistema ("deploy/restart de infra é decisão do Kairo,
   nunca do bloco autônomo") — ver **PENDENTE-KAIRO** abaixo. Ambas as correções de infra foram
   explicitamente aprovadas pelo Kairo via `AskUserQuestion` antes de executar.
   Os 2 commits de código (`fccad78f`, `1aa963a`) foram feitos com `--no-verify`, pré-autorizado
   pelo Kairo pra este cenário específico — Camadas 1+2 (`test:unit`) verdes nos dois, sem
   relação com o gap de infra.

## PENDENTE-KAIRO

- **Restart do `litellm-shared`** (`aws ecs update-service --cluster tb-cluster --service
  litellm-shared --force-new-deployment --profile tb-prod --region sa-east-1`) pra aplicar o
  `gpt-4.1` já commitado no `config.yaml` — sem isso, o gate Camada 3 do aja-agora (e qualquer
  outro app que precise de `gpt-4.1` via gateway) continua falhando até o restart manual.
- Virtual key `aja-agora-dev` já tem `gpt-4.1` no allowlist (mudança já aplicada via API, não
  precisa de ação adicional).

## Gaps honestos

- FIX-293 cobre o padrão de regex já validado pelo FIX-282 (escopo estreito, falso-negativo
  preferível a falso-positivo — decisão herdada, não revisitada nesta rodada). Perguntas de
  justificativa fora desse padrão continuam dependendo só do reforço de prompt (REGRA DURA nova),
  sem garantia de código.
- Push feito (`fix/r9-4-valor-honestidade` → origin). Merge/integração na base é do orquestrador
  da onda (`merge-wave.sh`) — overlap nível 2 declarado no `_bloco.md` com
  `bloco-r9-4-reveal-serverside` em `recommendation-payload.ts` (`coerceRevealCota` vs
  `coerceComparisonPayload`), ordem de merge: reveal-serverside primeiro, conflito mecânico de
  assinatura de tipo esperado.
