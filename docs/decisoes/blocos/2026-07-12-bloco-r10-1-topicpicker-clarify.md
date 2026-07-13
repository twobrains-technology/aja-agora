# ADR — Bloco r10-1 topicpicker-clarify: transição `clarify` sem intent nova nem estado novo

- **Data:** 2026-07-12
- **Branch:** `fix/r10-1-topicpicker-clarify`
- **Itens:** FIX-300 (enum canônico do topic-picker) + FIX-301 (transição `clarify`)
- **Natureza:** 2 itens que resolvem o MESMO problema de produto (P6+P7 do estudo: card
  alucinado + usuário confuso), FIX-300 isolado, FIX-301 toca zona compartilhada com o bloco
  `bloco-r10-1-funil-reveal` (merge posterior, conflito esperado e documentado no manifesto).

---

## FIX-300 — catálogo canônico (resumo, ver commit)

`present_topic_picker.topics` deixou de aceitar `z.string()` livre — agora é
`z.array(z.enum(CANONICAL_TOPIC_IDS))`, catálogo fixo em `topic-catalog.ts` (4 dúvidas do
mockup). `tool-policy.ts` tira a tool de `closing`/`terminal`; `artifact-guard.ts` ganha uma 2ª
linha (`topic-picker-server-gate`) pro instante exato do gate `decision` (que tecnicamente ainda
é fase `reveal` até o dispatch — por isso a tool-policy sozinha não bastava).

## FIX-301 — a decisão em aberto

O card (`fix-301-clarify-usuario-confuso.md`) pedia uma decisão real: como mapear/detectar a
intent "usuário confuso" (`confused` não existe no `UserIntent`/`turn-analyzer.ts`) e como
implementar a transição `clarify` sem reestruturar a máquina de estados (`Gate` em
`qualify-state.ts`).

### Trade-off 1 — nova intent `confused` vs. reaproveitar `expressing_doubt`

- **Via A (nova intent):** adicionar `confused` ao enum `UserIntent` (turn-analyzer.ts +
  qualify-state.ts) com exemplos próprios no prompt do analyzer LLM (Haiku).
- **Via B (reaproveitar):** tratar `expressing_doubt` como o sinal de confusão, combinado com "há
  um gate REALMENTE pendente de resposta".

**Decisão: Via B.** Razões:
1. `expressing_doubt` já cobre semanticamente "não entendi" — os exemplos do prompt do analyzer
   (`turn-analyzer.ts`) incluem "não sei", "to em dúvida", frases de quem não conseguiu decidir/
   entender. Criar uma 5ª categoria só aumenta a superfície de classificação (mais uma fronteira
   ambígua pro Haiku errar) sem ganho de precisão real — o sinal que importa pra decidir
   "reancorar no gate" não é a NUANCE da dúvida, é "o usuário não avançou E há uma pergunta
   pendente".
2. Zero mudança em `turn-analyzer.ts`/`types.ts` (arquivos citados no manifesto, mas que o crítico
   já sinalizava como caminho incerto) — reduz a superfície de teste (não precisa validar que o
   Haiku classifica "confused" corretamente, um risco de confiabilidade de LLM que a Via A
   herdaria).
3. Minimiza conflito com o bloco paralelo `bloco-r10-1-funil-reveal`, que também mexe em
   `qualify-state.ts`/`orchestrator/index.ts` — menos superfície editada, merge mais barato.

O sinal real de "confuso com algo pendente" não é só o intent — é
`intent === "expressing_doubt" && gateAwaitingReply(meta, hasContactName) !== null`.

### Trade-off 2 — reancorar via novo estado no enum `Gate` vs. curto-circuito no orquestrador

- **Via A (novo estado):** um `Gate` `"clarify"` que a máquina de estados (`nextGate()`) devolve
  quando detecta confusão.
- **Via B (comportamento condicional):** `clarify` não é um Gate novo — é um curto-circuito em
  `orchestrator/index.ts` que acontece ANTES de invocar a LLM (mesmo padrão do
  `isExactnessOrCriteriaQuestion`, FIX-282/293): reancora no **mesmo** gate que já estava
  pendente, com um lead-in universal, sem chamar a LLM (Lei 4 — nunca deixar o texto já
  streamado pro usuário antes de decidir suprimir).

**Decisão: Via B**, exatamente como o manifesto já recomendava ("não reestruturar `Gate`"). Um
Gate novo obrigaria `nextGate()`/`decideShowGate()`/`gateQuestion()`/os 2 adapters (web+whatsapp)
a aprender um estado que não carrega NENHUMA informação nova além de "estou confuso" — pura
duplicação da máquina existente. O curto-circuito reaproveita 100% da renderização já existente
(evento `{type:"gate", gate}` pros gates de coleta; `emitServerCard(decision_prompt)` pro gate
`decision`) — o usuário vê exatamente o card/pergunta que já veria numa emissão normal, só que
puxado de novo, na hora certa.

### Caso especial — o gate `decision`

`nextGate()` só retorna `"decision"` enquanto `!meta.decisionDispatched`. Assim que o card é
mostrado, o dispatch marca `decisionDispatched=true` e `nextGate()` avança pro terminal
(`"search"`) — ou seja, o **usuário confuso respondendo ao card que acabou de ver** não teria
pra onde reancorar usando só `nextGate()`. Por isso `gateAwaitingReply()` (novo, em
`qualify-state.ts`) trata esse caso à parte: `revealCompleted && decisionDispatched &&
!contractClosed` → `"decision"`, ANTES de delegar pro `nextGate()` genérico. É a única exceção —
todos os outros gates guiados por dado (`credit`, `lance`, `identify`, …) continuam corretos via
`nextGate()` puro, porque o dado em si (não uma flag de "já mostrei uma vez") é que os mantém
pendentes.

Gates sem pergunta re-apresentável (`name`, `doubts-wait`, `search`) são excluídos —
`gateAwaitingReply()` devolve `null` pra eles (nada a reancorar).

## Escopo dos testes — o que este bloco cobre e o que fica de fora

O card FIX-301 listava 2 regressões: (1) "não entendi" no gate `decision` reancora com copy
simplificada — **coberta** por este bloco; (2) pergunta *on-topic* fora de ordem ("em quanto
tempo recebo o carro?") no meio de um gate pendente, onde o LLM historicamente "dissertava sobre
consórcio genérico" em vez de reancorar — **fora do escopo determinístico** deste bloco. Essa 2ª
regressão depende de o analyzer classificar a pergunta como `asking_question` (não
`expressing_doubt`), e responder objetivamente à pergunta ANTES de reancorar é um problema de
qualidade de resposta do LLM (soft), não um invariante representável em código sem risco de
regredir o comportamento LEGÍTIMO de "pergunta no meio do gate → o agente responde, sem gate
forçado" (COLLECTION_GATES já trata isso hoje). Fica como follow-up pontual, não coberto pelos
testes deste bloco.

## Limitação conhecida (documentada, não coberta pelos testes deste bloco)

Alguns gates de coleta emitem um **card companheiro** além da pergunta textual quando disparados
pelo fluxo normal (ex.: `lance-embutido` também emite `embedded_bid` — ver
`orchestrator/index.ts`, bloco `result.nextGateToFire`). O curto-circuito de `clarify` reemite
SÓ o evento `gate` (pergunta/card do próprio gate) — ele não replica a lógica de card-companheiro
de cada gate individual (isso infla a superfície de `orchestrator/index.ts` sem necessidade pros
cenários testados: "não entendi" no gate `decision` e reancoragem genérica). Se isso incomodar em
QA manual (usuário confuso no meio do gate `lance-embutido` vê a pergunta mas não o card
`embedded_bid` de novo), é um follow-up pontual — não um problema da transição em si.

## Referências

- `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md` (P6, P7).
- `~/.claude/reference/arquitetura-agentes-ia.md` (Lei 4: invariante crítico vira código, curto-
  circuito ANTES da LLM — nunca depois, o texto já teria streamado).
