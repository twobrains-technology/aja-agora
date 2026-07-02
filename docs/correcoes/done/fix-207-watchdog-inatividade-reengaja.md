---
id: FIX-207
titulo: "Watchdog de inatividade: re-engajar o funil quando o usuário fica parado num gate pendente (estratégia 3)"
status: done
commit: 004ae2d
executado_em: 2026-07-02
pendente_kairo: "watchdog WEB (push server→client em sessão SSE fechada) não coube no hotfix — WhatsApp entregue completo"
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/agent/personas.ts
  - src/lib/conversation/meta.ts
  - src/lib/workers/gate-reengage-poll.ts
  - src/lib/chat/stream-watchdog.ts
  - src/lib/whatsapp/adapter.ts
  - src/app/api/chat/route.ts
rodada: 2026-07-02 — rede de segurança para a cauda não-determinística do FIX-206
---

## Palavras do operador
> "1 e 3 tem que acontecer" (estratégia = puxar o botão junto **E** watchdog por inatividade)

## Cenário exato
- **Complementa o FIX-206.** O FIX-206 mata o caminho determinístico (cliques/explicações
  fechadas). Sobra a **cauda não-determinística**: o LLM classifica um turno de texto como
  `asking_question`/`expressing_doubt`, `decideShowGate` legitimamente suprime o gate
  (`qualify-state.ts:172-173`), e o `consent` já foi ofertado antes (idempotente →
  `nextGate` cai em `doubts-wait`). Se o usuário faz uma pergunta e depois **não fala mais**,
  o funil fica parado — sem o watchdog, ninguém re-engaja.
- **Passos:**
  1. Usuário está na qualificação, faz uma dúvida real ("e a taxa de administração?").
  2. Agente responde. `decideShowGate` suprime o próximo gate (correto — respeitou a dúvida).
  3. Usuário fica parado (satisfeito, distraído, esperando).
  4. **Esperado:** após X de inatividade, o sistema re-engaja com o próximo passo do funil.
  5. **Atual:** silêncio indefinido (o mesmo sintoma do print — só que aqui a supressão do
     gate foi legítima; o que falta é a rede que reabre o funil).

## Esperado × Atual
- **Esperado:** nenhuma conversa fica presa indefinidamente num gate pendente. Passado um
  teto de inatividade, o sistema dispara o próximo passo (o botão do gate) sozinho.
- **Atual:** não há re-engajamento — depende 100% do usuário voltar a falar.

## Root cause (INVESTIGADO)

Não há nenhum mecanismo de re-engajamento por inatividade. O funil só avança quando um
turno é processado (`processWithOrchestrator` / `route.ts`), e o próximo gate só é decidido
DENTRO de um turno (`decideShowGate`). Quando `decideShowGate` suprime (legitimamente) e o
usuário some, **não existe timer/job** que reabra o funil. É a lacuna deliberada que o
comentário de `decideShowGate` deixa em aberto ("re-engage on a **later turn**") — mas
"later turn" nunca chega se o usuário não fala.

## Infra existente pra ancorar (NÃO reinventar)

- **`src/lib/workers/proposal-status-poll.ts`** (FIX-44) — worker **BullMQ** com polling
  recorrente + **varredura de inatividade** (`markStaleProposalsLost`,
  `PERDIDO_INACTIVITY_DAYS`, `runPollCycle`, `startProposalStatusWorker`). É o **molde exato**
  do watchdog de gate: um ciclo recorrente que varre conversas paradas e age. Requer `REDIS_URL`.
- **`src/lib/chat/stream-watchdog.ts`** (FIX-110) — watchdog **client-side** (função pura
  testável `isStreamStuck` + `STREAM_STALL_TIMEOUT_MS`). Molde pro caso **web** (sessão SSE
  ativa), onde um job server-side não "empurra" fácil numa sessão já aberta.

## Correção proposta (o quê × onde)

> Direção decidida (Kairo): watchdog por inatividade. Priorizar o **WhatsApp** (assíncrono,
> molde `proposal-status-poll`) — é o canal do print. Para o **web**, usar o padrão
> client-side (molde `stream-watchdog`) OU um caminho server→client viável; se o push web for
> custoso demais pra 1 hotfix, entregar o WhatsApp completo e deixar o web como
> **PENDENTE-KAIRO** documentado (não fingir que cobriu).

| O quê | Onde |
|-------|------|
| Marcar no meta da conversa um `pendingGateSince` (timestamp) + o gate pendente, quando um turno termina com um gate REAL suprimido (nextGate ≠ `doubts-wait`/`search`, `decideShowGate` retornou `false`) e nada visível foi emitido depois. Limpar quando o usuário responde ou o gate dispara. | `personas.ts` (tipo `ConversationMetadata`), `meta.ts`, ponto de decisão em `runner.ts`/`index.ts` |
| **WhatsApp:** worker recorrente (molde `proposal-status-poll`) que varre conversas com `pendingGateSince` além do teto de inatividade + sem atividade do usuário, e dispara `fireGate(nextGate)` no canal. Idempotente (não re-disparar o mesmo gate; respeitar `consentOffered` etc.). | `src/lib/workers/gate-reengage-poll.ts` (NOVO), `adapter.ts` (`fireGate`) |
| **Web:** watchdog client-side (molde `stream-watchdog`, função pura testável) que, após inatividade pós-turno-sem-próximo-passo, chama a API pra buscar/disparar o próximo gate. OU caminho server→client equivalente. | `stream-watchdog.ts`, `route.ts` |
| Teto de inatividade **configurável por env** (padrão sugerido 60-90s — generoso o bastante pra não atropelar quem está digitando, finito o bastante pra não deixar "preso pra sempre"; espelha a filosofia do `STREAM_STALL_TIMEOUT_MS`). | worker/config |

⚠️ **Invariantes:**
- **Idempotência** — o re-engajamento NÃO pode duplicar mensagens nem re-disparar um gate já
  respondido (respeitar `consentOffered`, `searchDispatched`, `decisionDispatched` etc.).
- **Nunca re-engajar** conversa em handoff humano (`handoffSuggested`/`isHandedOff`),
  fechada (`contractClosed`), ou em coleta de lead — só o funil de qualificação parado.
- **Não travar QA por falta de Redis** — se `REDIS_URL` ausente em dev, o worker degrada com
  log (mesmo padrão do `proposal-status-poll`), não derruba o app.

## Regressão exigida (TDD strict — 3 CAMADAS)

**Camada 1 (structural):**
- Função pura de decisão do watchdog (espelho de `isStreamStuck`): dado `pendingGateSince`,
  `now`, `msSinceLastUserActivity`, estado da conversa (não-terminal, não-handoff) → decide
  `shouldReengage`. Testar os limites (abaixo do teto = não; acima = sim; terminal/handoff = nunca).
- `runPollCycle`-equivalente: dado um conjunto de conversas, seleciona só as elegíveis.

**Camada 2 (cassette / integration):**
- Integration test do worker: conversa parada num gate pendente há > teto → o ciclo dispara
  `fireGate` uma vez; conversa que respondeu → não dispara; conversa em handoff/fechada → não
  dispara. Determinístico (clock injetado, sem `Date.now()` real — usar o padrão do projeto,
  ex. `simulatorNow`/clock injetável).

**Camada 3 (eval, nightly — estrutura):**
- Cenário de inatividade não roda bem em eval síncrono; documentar o gap e cobrir por
  Camadas 1+2 (o comportamento é determinístico dado o clock).

**Nota:** o campo novo no `ConversationMetadata` exige cuidado com a serialização do meta
(o mesmo cuidado que quebrou a develop antes — ver memória "develop quebrada drizzle-meta").
Rodar o gate de teste no container com o pg migrado.
