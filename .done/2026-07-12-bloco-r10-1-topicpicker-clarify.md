# Bloco r10-1 topicpicker-clarify — FIX-300 + FIX-301

## Resumo

2 itens do estudo P6+P7 (rodada 10, loop-de-goal consórcio, teste manual Qwen 3.5 Fast) — o
"vetor de card alucinado" (topic_picker com chips "a"/"b" no gate `decision`) e o "usuário
confuso sem reancoragem" ("não entendi" abrindo menu genérico ou dissertação livre).

## FIX-300 — TopicPicker vira enum canônico

`present_topic_picker.topics` aceitava `z.string()` livre — o Qwen chamou a tool no gate
`decision` com chips fabricados e o Zod validou por não ter allowlist. Correção:

- `src/lib/agent/orchestrator/topic-catalog.ts` (novo) — catálogo canônico fixo (4 dúvidas do
  mockup: lance, sorteio, contemplação, cartas variam) + `resolveTopicPickerPayload` (id → label).
- `ai-sdk.ts` — `topics: z.array(z.enum(CANONICAL_TOPIC_IDS))`, rejeita qualquer id fora do
  catálogo.
- `tool-policy.ts` — `present_topic_picker` sai de `closing`/`terminal`.
- `artifact-guard.ts` — 2ª linha (`topic-picker-server-gate`) suprime especificamente no instante
  do gate `decision` (que tecnicamente ainda é fase `reveal` até o dispatch — por isso a
  tool-policy sozinha não bastava).
- `runner.ts` — resolve `topics` (ids) pro copy canônico antes de montar o payload do artifact.

## FIX-301 — transição `clarify` sem intent nova, sem estado novo

Decisão registrada em `docs/decisoes/blocos/2026-07-12-bloco-r10-1-topicpicker-clarify.md`:

- **Sem intent `confused` nova** — reusa `expressing_doubt` (já existe, já cobre "não entendi"
  semanticamente) combinado com "há um gate REALMENTE pendente" (zero mudança em
  `turn-analyzer.ts`).
- **Sem estado novo no enum `Gate`** — `clarify` é um curto-circuito em `orchestrator/index.ts`,
  ANTES de invocar a LLM (mesmo padrão do `isExactnessOrCriteriaQuestion`), que reancora no MESMO
  gate/card com um lead-in simplificado (`CLARIFY_LEAD_IN`, `gate-questions.ts`).
- **Caso especial `decision`**: `nextGate()` avança pro terminal assim que o card é despachado,
  mesmo sem resposta do usuário — `gateAwaitingReply()` (novo, `qualify-state.ts`) trata esse
  caso à parte antes de delegar pro `nextGate()` genérico.
- **Limitação documentada**: gates com card companheiro (ex.: `lance-embutido` + `embedded_bid`)
  reancoram só a pergunta textual/gate, não o card companheiro — fora do escopo testado.

## Testes (TDD strict, sem smoke de browser)

- `ai-sdk.fix-300-topicpicker-enum.test.ts` — schema rejeita ids fora do catálogo (sonda
  adversarial "a"/"b").
- `tool-policy.test.ts` (+describe FIX-300) — `present_topic_picker` ausente em closing/terminal.
- `artifact-guard.test.ts` (+describe FIX-300) — suprime no gate `decision`, não afeta outros
  artifacts.
- `qualify-state.fix-301-clarify.test.ts` — `gateAwaitingReply` puro, 7 cenários.
- `index.fix-301-clarify-usuario-confuso.integration.test.ts` — reancora no gate `decision` e num
  gate de coleta (`credit`), LLM NUNCA invocada (`resolveAgent` mockado); intent não-confuso não
  short-circuita.

`pnpm test:unit`: 365 arquivos / 3350 testes verdes. Pre-commit Camada 3 (LLM real,
`ANTHROPIC_API_KEY` decriptado do vault) verde nos 2 commits.

## Commits

- `ba4954d9` — fix(consorcio): trava topic_picker num catalogo canonico fixo (FIX-300)
- `e80d0e44` — fix(consorcio): reancora no mesmo gate quando o usuario esta confuso (FIX-301)

## Gaps / pendências

- Segunda regressão do card FIX-301 ("em quanto tempo recebo o carro?" fora de ordem → o LLM
  dissertava genérico) fica de fora do escopo determinístico deste bloco (documentado no ADR) —
  depende do analyzer classificar como `asking_question`, é qualidade de resposta do LLM, não um
  invariante de estado.
- Merge deste bloco na base deve vir DEPOIS do `bloco-r10-1-funil-reveal` (conflito esperado em
  `orchestrator/index.ts`, documentado no manifesto original).
