# ADR — Bloco r10-1 web-reengage: entrega proativa de reengajamento no canal web

- **Data:** 2026-07-12
- **Branch:** `fix/r10-1-web-reengage`
- **Item:** FIX-302 (rodada 10, onda 1, loop-de-goal consórcio)
- **Natureza:** o watchdog de re-engajamento (FIX-207) e a escada de cobrança (FIX-211) já
  existem e são testados no WhatsApp — o gap era 100% de ENTREGA no canal web (o worker
  filtrava `channel === "whatsapp"` e exigia `waId`). Root cause e correção já fechadas no
  fix-card; a única decisão real era COMO o cliente web recebe a mensagem persistida.

---

## Contexto

`gate-reengage-poll.ts` varre conversas ATIVAS com um gate do funil pendente há mais que
`GATE_REENGAGE_TIMEOUT_MS` (90s) e reabre o funil. No WhatsApp, a entrega é direta (Meta
Cloud API via `fireGate`) — sempre existe um canal push. No web, **não existe uma sessão SSE
viva pra empurrar**: o `/api/chat/stream` (SSE) só conecta quando `handoff.status ===
"handed_off"` (`provider.tsx:184`), e mesmo que conectasse sempre, o worker roda num
**processo separado do app** (`scripts/proposal-worker.ts` vs. o processo Next.js) — o
`message-bus` (`src/lib/chat/message-bus.ts`) é um `EventEmitter` in-memory, explicitamente
single-process (comentário no próprio arquivo: "For multi-process, swap for Redis pub/sub").
Bridging cross-process exigiria Redis pub/sub — infraestrutura nova, fora do escopo declarado
do bloco (`escopo_arquivos` do manifesto lista só 3 arquivos de backend).

## Opções levantadas

1. **(Recomendada, escolhida) Persistir na tabela `messages` + reusar `/api/chat/resume`.**
   O worker persiste a mensagem de reengajamento como uma mensagem `assistant`/`web` normal
   (`saveMessage`, a mesma função usada pelo `web/adapter.ts` em turnos ao vivo). Nenhum
   endpoint novo: `getResumableConversation` (usada por `GET /api/chat/resume`) já lê TODAS
   as mensagens da conversa ordenadas por `createdAt` — a mensagem aparece automaticamente na
   próxima vez que o cliente consultar o resume, sem mudança de contrato.
2. Novo endpoint de poll dedicado (`GET /api/chat/poll?since=<messageId>`), devolvendo só
   mensagens novas após um cursor — mais eficiente em payload, mas endpoint novo (fora do
   `escopo_arquivos` do manifesto) + mais superfície de teste, pra um ganho que não importa
   no volume desta feature (poll leve, poucas mensagens por conversa).
3. Bridging cross-process do `message-bus` via Redis pub/sub, pra reusar a SSE já existente
   em toda conversa ativa (não só handoff). Tecnicamente mais "ao vivo", mas exige subir a
   SSE fora do cenário de handoff (mudança de comportamento em `provider.tsx`, fora do
   `escopo_arquivos`) + infra nova (canal Redis dedicado) — desproporcional pro problema
   (usuário ocioso 90s+, não precisa de latência de push).

## Decisão

**Escolhida a opção 1 (persistir + reusar `/api/chat/resume`).** `AskUserQuestion` foi
lançada com a opção 1 recomendada em 1º lugar; sem resposta em tempo hábil, seguiu o default
declarado no `_prompt.md` do bloco: "escolha o caminho que reusa mais infra existente".

**Porquê:** zero endpoint novo, zero mudança de contrato de API, reusa 100% de infra já
testada (`saveMessage`, `getResumableConversation`) — e é a única opção que não esbarra na
limitação real do sistema (worker e app são processos separados; SSE cross-process exigiria
Redis pub/sub, infraestrutura nova fora de escopo).

### Bug lateral corrigido no caminho (Lei "erro que você vê, você corrige")

Reusar a escada `reengageQuestionForGate` (FIX-211) pro canal web expôs um bug que era
inofensivo até agora: a função sempre chamava `gateQuestion(gate, category, creditValue,
undefined, ...)` — `channel` undefined cai no default `"whatsapp"` de `gateQuestion`. Pro
gate `identify`, o texto WhatsApp diz "Seu celular eu já pego aqui do WhatsApp" — mentira no
canal web (o form pede CPF **e** celular, `gatePartData` kind `"identity"`). Corrigido:
`reengageQuestionForGate` ganhou um 6º parâmetro `channel: "web" | "whatsapp" = "whatsapp"`
(default preserva os 2 call sites pré-existentes em `whatsapp/adapter.ts` sem mudança),
threaded até `gateQuestion`. Regressão em `gate-reengage.escada.test.ts`.

## Desenho da entrega

- `findPendingGateConversations` parou de filtrar `channel === "whatsapp"` — varre as duas.
- `runReengageCycle` ramifica por canal DEPOIS de limpar o marcador (idempotência
  preservada): WhatsApp sem alteração nenhuma (`fireGate`, single-fire, mesmos testes
  passando). Web: gates de coleta obrigatória (`isMandatoryCollectionGate` — credit, lance,
  lance-value, lance-embutido, identify) reusam a escada FIX-211 (`reengageQuestionForGate`)
  E **re-armam o marcador** (`pendingGateSince`/`gateAttempts`) pra continuar cobrando a cada
  novo ciclo de 90s até o teto de 4 tentativas — a 4ª já é `SPECIALIST_EXIT_OFFER` e não
  re-arma (mesmo anti-armadilha do FIX-211: nunca loop infinito). Gates não-obrigatórios
  (experience/timeframe/simulator-offer/desire) usam a pergunta base (`gateQuestion`),
  single-fire, sem escalar — espelha o comportamento do `fireGate` do WhatsApp pra esses
  gates.
- Publica best-effort no `message-bus` (`publishMessage`) — inofensivo quando não há
  assinante no processo do worker; nunca bloqueia nem derruba o ciclo.

## Gap explícito (fora do escopo deste bloco)

O `escopo_arquivos` do manifesto limita este bloco a 3 arquivos de backend
(`gate-reengage-poll.ts`, `gate-reengage.ts`, `chat/resume/route.ts`) e proíbe smoke de
browser. **O frontend (`theater-chat.tsx`/`provider.tsx`) hoje só consulta
`/api/chat/resume` UMA VEZ, no mount do painel teatro** (`theater-chat.tsx:67-104`) — não há
poll periódico enquanto a aba fica ociosa. A mensagem de reengajamento fica **disponível**
(persistida, sem reload manual — a regressão exigida no fix-card, validada por teste de
integração) mas só chega visualmente ao usuário no PRÓXIMO mount/reconexão do painel, não
"empurrada" pra uma aba já aberta. Fechar esse último elo (poll periódico leve em
`theater-chat.tsx` reconsultando `/api/chat/resume`, ou plugar a mensagem no `message-bus`
que já alimenta a SSE de handoff) é follow-up natural — fora do `escopo_arquivos` declarado
e sem regressão de teste mandatada neste card. Sinalizando aqui pra não virar "resolvido"
silenciosamente.
