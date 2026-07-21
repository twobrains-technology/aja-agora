---
bloco: bloco-funil-completo-langgraph
branch: feat/langgraph-runtime-funil-completo
campanha: .processo/loop/2026-07-20-1948-langgraph-runtime.md (Rodada 1)
itens: [FIX-359, FIX-360, FIX-361]
item_nao_executado: [FIX-362 — ver seção própria abaixo]
executado_em: 2026-07-20
commits:
  - bfe2ca0a / 11034cb1 (FIX-359)
  - b15291cc (FIX-360)
  - 0c0dcb7d (FIX-361)
---

# Funil completo do runtime LangGraph — streaming, funil, guards (Rodada 1)

## Resumo

Sobre a fundação da Rodada 0 (walking skeleton `analyze→route→converse→discovery→
emitCard→persist`), esta rodada completa: (1) streaming de token AO VIVO de verdade,
(2) o funil INTEIRO pós-reveal (rapport, experience, reco-consent, timeframe, lance/
lance-value/lance-embutido, simulator-offer, decision), e (3) `evaluateArtifactGuards`
como 2ª linha de defesa em toda emissão de card, incluindo o "reveal em dois tempos"
(hero fica pendente até o usuário consentir).

`pnpm test:unit` (407/407 arquivos, 3606 testes) e `pnpm build` (✓ Compiled
successfully) verdes na última verificação, feita ao final da rodada (ver nota sobre
modo urgência abaixo).

## O que foi construído (por item)

### FIX-359 — streaming de token ao vivo
`run-turn.ts` trocou `graph.invoke()` por `graph.stream(input, { streamMode:
["custom", "values"] })`: os eventos que `nodes/converse.ts` empurra via
`config.writer` (`text-delta`/`tool-call`) saem AO VIVO, evento a evento, enquanto o
grafo ainda está rodando; os demais 12 tipos (gate/artifact/meta-update/finish/etc.)
só saem do estado final (`values`, pós-`persist`) — a garantia "persistMeta antes de
qualquer gate" continua por TOPOLOGIA, não timing. Provado por teste de integração
(DB real, `FakeStreamingChatModel` com delay real entre chunks): o chamador recebe
≥2 `text-delta` ANTES do node `persist` gravar a mensagem no banco.

### FIX-360 — funil completo
- `FunnelState` (state.ts) ganhou os campos pós-reveal: `desireAnswered`,
  `discoveredCreditTarget`, `motivationAsked`/`motivationMirrored`, `experiencePrev`/
  `doubtsAddressed`, `topicPickerDispatched`, `recoConsentDispatched`/`Answered`,
  `simulatorOfferDispatched`, e `qualifyAnswers.{prazoMeses,hasLance,lanceValue,
  lanceEmbutido,lanceEmbutidoPercent}`.
- Novo nó **`advance`** (entre `route` e `converse`) marca os side-effects de
  dispatch/resposta que `nextGate`/`decideShowGate` (qualify-state.ts, reusados
  tal-e-qual) LEEM mas não ESCREVEM: rapport via `shouldAskMotive`/
  `shouldMirrorMotivation` (reusados), reco-consent/lance-embutido via heurística
  determinística de sim/não em texto livre (mesmo papel de `detectYesNoText` do
  runtime Vercel, duplicada — não importada — por isolamento de ownership do módulo
  nesta onda), lance-value via backstop determinístico (`parseAssetValue`, mesmo
  padrão do FIX-115 pro creditMax).
- **`route` roda DUAS VEZES** (`route` → `advance` → `routeFinal`, mesma função
  pura) — sem isso, o evento "gate" mostraria o gate que o usuário ACABOU de
  responder neste turno, não o próximo (já que `route` original computa ANTES de
  `advance` mutar o funil).
- `discovery` agora RE-DISPARA quando o usuário pede uma faixa de valor nova
  pós-reveal (`discoveredCreditTarget` divergente), preservando a idempotência
  original em afirmativos curtos na mesma faixa.
- `emitCard` ganhou `topic_picker` (novato, emissão única), `embedded_bid`
  (educação do lance embutido) e a cascata `scarcity`→`decision_prompt` (ou
  `two_paths` no ramo `hasLance==="so_parcela"`).
- Prova por teste de integração: a sequência completa `experience→reco-consent→
  timeframe→lance→lance-value→lance-embutido→simulator-offer→decision` roda sem
  travar, e o escape (pergunta no meio do gate `credit`) não avança nem quebra o
  turno — o gate reabre no turno seguinte.

### FIX-361 — evaluateArtifactGuards + reveal em dois tempos
- Helper `nodes/guarded-artifact.ts`: toda emissão (discoveryNode e emitCardNode)
  passa por `evaluateArtifactGuards` (reusado tal-e-qual) antes de virar
  `TurnEvent` — ganha de graça as proteções de pós-fechamento, re-reveal,
  single-option, duplicação intra-turno e `topic-picker-server-gate`.
- **Reveal em dois tempos**: `discoveryNode` guarda o payload JÁ coagido (I3) de
  `recommendation_card` em `funnel.pendingRecommendationCard` quando o guard
  `hero-awaits-reco-consent` suprime a emissão imediata; `emitCardNode` libera
  assim que `recoConsentAnswered` vira true — **sem** rodar o guard de novo no
  release (achado ao vivo: a regra `reveal-loop` bateria no MESMO card e ele nunca
  sairia — o release é a resolução do hold, não uma emissão nova a validar).
- `emit.ts` documenta a cobertura dos 19 `ArtifactType`: 7 emitidos server-side
  nesta rodada, resto `TODO(rodada-2)`.

## Decisões de design (X em vez de Y, porque Z)

1. **`route` roda 2x (route→advance→routeFinal)** em vez de um único cálculo de
   gate por turno. Porque: `advance` precisa saber qual gate estava ativo ANTES de
   decidir o que mutar (ex.: "a resposta do usuário reconhece o reco-consent
   pendente?"), mas o evento final "gate" precisa refletir o estado JÁ avançado —
   as duas necessidades exigem 2 leituras da mesma função pura, não uma reescrita
   com side-effects misturados.
2. **`simulatorOfferAnswered` não gate o avanço** — descobri que `nextGate`
   (qualify-state.ts:342) só consulta `simulatorOfferDispatched`, nunca
   `Answered`. Simplifiquei `advance.ts` pra não fingir um 2º estágio que o
   `nextGate` real nunca lê (evita código morto).
3. **`detectYesNoText` duplicado, não importado** de `orchestrator/index.ts` — o
   módulo `langgraph/` é ownership isolado desta onda (paralelo a outros blocos
   mexendo em `index.ts`); duplicar ~15 linhas puras é mais barato que arriscar
   conflito de merge num arquivo de 1400+ linhas sob mudança concorrente.
4. **Release do hero pendente NÃO passa pelo guard de novo** — ver FIX-361 acima.
   Acho isso o achado mais importante da rodada: um guard que decide "espera" não
   pode ser a MESMA porta que decide "libera", porque a condição que o fez esperar
   (`revealCompleted && isUserTurn && sem troca de faixa`) continua verdadeira no
   turno da liberação.
5. **`contemplation_dial`/`contract_form`/`real_offer`/cerimônia de fechamento
   ficam TODO(rodada-2)** — pesquisa (fork dedicado no runtime Vercel) confirmou
   que a cerimônia de fechamento não tem lógica determinística clara reaproveitável
   além do disparo do `contract_form`; forçar isso nesta rodada arriscava
   "completude > jornada que roda".

## Testes

- `run-turn.streaming.test.ts` (FIX-359, 2 testes) — streaming ao vivo + ordem
  gate/meta-update pós-persist.
- `nodes/advance.test.ts` (FIX-360, 15 testes) — rapport, reco-consent,
  simulator-offer, lance-embutido, lance-value, `detectYesNoText`.
- `nodes/route.test.ts` (+3 testes FIX-360) — re-descoberta em troca de faixa.
- `nodes/emit-card.test.ts` (FIX-360/361, 13 testes) — topic_picker, embedded_bid,
  decision/scarcity/two_paths, guard `premature-decision`, release do hero
  pendente.
- `run-turn.funil-completo.integration.test.ts` (FIX-360, DB real, 2 testes) —
  sequência completa pós-reveal + escape.
- `run-turn.integration.test.ts` (atualizado, FIX-361) — prova que
  `recommendation_card` fica PENDENTE (não emitido) na 1ª descoberta, matching o
  novo invariante de reveal em dois tempos.

**Total: ~33 testes novos/atualizados no módulo langgraph.** `pnpm test:unit`
407/407 arquivos (3606 testes) e `pnpm build` verdes — verificados 1x ao final da
rodada (ver nota abaixo).

## Nota sobre modo urgência (transparência de processo)

A meio da Rodada 1 (durante o FIX-361), o Kairo entrou ao vivo na sessão e ativou o
modo urgência (`/modo-urgencia`), pedindo pra cortar a ceremônia de TDD/suíte por
edição e focar em terminar o CÓDIGO. A partir daí:
- Parei de rodar a suíte completa após cada edição (só rodei arquivos pontuais
  durante o debug de 2 bugs reais que os testes já escritos capturaram — ver
  decisão 4 acima, que só foi encontrada PORQUE um teste falhou e eu investiguei).
- O FIX-361 foi commitado com `--no-verify` (autorizado pela skill pra este
  contexto específico).
- Ao final, MESMO sob modo urgência, rodei `pnpm test:unit` e `pnpm build` UMA
  vez (não ceremônia — necessário pra saber a verdade antes de reportar "verde" e
  decidir a tag-sentinela) — ambos passaram.

## FIX-362 — NÃO executado (decisão do Kairo em sessão, não trava a onda)

O card (WhatsApp validado + invariantes I3/I4/D6 + sondas de não-engessar) é, na
prática, inteiramente sobre ESCREVER TESTES — não há código de produção pendente
pro item em si. Quando o modo urgência entrou, o Kairo pediu explicitamente pra
parar de escrever suíte e focar no código; decidi então NÃO escrever os testes
deste card, mas VERIFIQUEI por leitura de código (não teste) os dois pontos
centrais que o card cobria:

- **WhatsApp**: `src/lib/whatsapp/formatter.ts` (`artifactToWhatsApp`) já mapeia
  os 19 `ArtifactType` — os 7 que o runtime LangGraph emite (comparison_table,
  recommendation_card, topic_picker, embedded_bid, scarcity, two_paths,
  decision_prompt) chegam ao WhatsApp SEM precisar de nenhuma mudança de código
  (contrato `TurnEvent` idêntico ao Vercel). `whatsapp/adapter.ts`
  (`consumeEvents`) consome o mesmo switch de 14 tipos que o canal web — nenhum
  bug de fiação encontrado.
- **D6**: `respectsNetCreditGuardrail` (recommendation.ts:213) já está embutido
  no ranking interno de `recommend_groups` — a MESMA tool que `discoveryNode`
  reusa via `tool-adapter.ts`. Nada a fazer.
- **I3**: já coberto pelos builders reusados (`coerce*Payload` dentro de cada
  `buildXCard`).
- **I4**: já coberto por `EphemeralTextFilter` reusado em `nodes/converse.ts`
  (fundação, FIX-358).
- **I1**: já coberto por `readyForDiscovery` (fundação, testado desde FIX-358).

O card **fica em `docs/correcoes/todo/`** (não movido pra `done/`) — os
invariantes estão satisfeitos NA PRÁTICA (por reuso), mas a "regressão exigida"
(sondas mecânicas de byte-diff, teste de integração do canal WhatsApp) não foi
escrita. `TODO(rodada-2)`: escrever essas sondas quando a suíte voltar a ser
prioridade.

## Gaps honestos (TODO rodada-2)

- FIX-362 completo (sondas de não-engessar + teste de integração WhatsApp),
  conforme nota acima.
- `contemplation_dial`, `contract_form`, `real_offer`, `signature_handoff`,
  `document_upload`, `whatsapp_optin` — cerimônia de fechamento, fora de escopo
  desta rodada (não há invariante determinístico claro reaproveitável do runtime
  Vercel além do disparo pontual do `contract_form`).
- `simulation_result`/`group_card`/`scenarios`/`financing_comparison` — cards de
  "what-if" avulso; precisam de uma ponte tool-result→artifact que não existe
  ainda no `converse.ts` (hoje resultado de tool vira só `ToolMessage`, nunca
  `TurnEvent`).
- `modelAsked` no evento `gate` continua sempre `false` (herdado da fundação) —
  seguro, só não-otimizado.
- Spike de gateway LiteLLM via túnel SSM continua bloqueado (SSM Agent loopback
  na instância EC2) — `PENDENTE-KAIRO`, sem mudança desde a Rodada 0.

## Próximo passo

Rodada 2 (se houver): FIX-362 completo, cerimônia de fechamento
(contract_form→real_offer→signature_handoff→document_upload), ponte
tool-result→artifact pros cards de what-if avulso, e — quando a cota Anthropic
destravar (01/08) ou o túnel SSM for corrigido — validação conversacional ao vivo
via coletor Haiku (juízo de negócio/UX que esta rodada não pôde fazer, só
invariantes determinísticos).
