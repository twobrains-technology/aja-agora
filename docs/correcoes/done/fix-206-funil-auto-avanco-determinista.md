---
id: FIX-206
titulo: "Funil não pode terminar um turno sem próximo passo: auto-avançar o gate no mesmo turno (estratégia 1)"
status: done
commit: 004ae2d
executado_em: 2026-07-02
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/whatsapp/interactive-handlers.ts
  - src/lib/whatsapp/adapter.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/qualify-state.*.test.ts
  - src/lib/agent/orchestrator/runner.*.test.ts
  - tests/regression/agent-trajectory.test.ts
  - src/lib/agent/HARD_RULES.md
rodada: 2026-07-02 — Kairo reportou no WhatsApp; investigação root-cause na sessão principal
---

## Palavras do operador
> "esse bug que mostrei é referente a IA não continuar a conversa, ela faz um comentário
> e não segue mais. isso aí do print já tinha passado uns 5 minutos e nada. aí sempre eu
> preciso mandar um continua - vai. etc. temos que refinar isso de verdade, pegar o erro
> e garantir que foi resolvido de fato."
>
> (Ao ser perguntado sobre o caminho): "foi o click no botão. mas independente pode ser
> texto tbm. acontece nos dois"

## Cenário exato
- **Canal:** WhatsApp (print). Ocorre também na web (mesma orquestração).
- **Passos (o do print):**
  1. Agente pergunta a experiência com botões: `🌱 É a primeira vez` / `✅ Já conheço` /
     `🤔 Tenho dúvidas` (formatter.ts:755-757).
  2. Usuário **clica um botão** de experiência (no print: primeira vez / tenho dúvidas).
  3. Agente responde a explicação de consórcio (4-5 frases, SEM pergunta no final — é o
     que o directive manda, `directives.ts:48` e `:56`).
  4. **E trava.** Nenhum botão de "Entendi, pode continuar" (gate `consent`) aparece.
     Passaram ~5 min e nada.
  5. Só destrava quando o usuário **digita** "continua" / "vai".
- **Também com texto:** usuário faz uma dúvida real no meio da qualificação → agente
  responde → mesmo travamento.

## Esperado × Atual
- **Esperado:** o agente CONDUZ a jornada (core value do produto). Depois de explicar/reagir
  na qualificação, o próximo passo (o botão do gate) aparece **no mesmo turno** — o usuário
  nunca precisa cutucar com "continua/vai".
- **Atual:** o agente dá a explicação e o turno morre em silêncio; o próximo gate só dispara
  no PRÓXIMO turno **do usuário**.

## Root cause (INVESTIGADO — provado no código)

O funil decide se mostra o próximo gate ao fim de cada turno via **`decideShowGate`**
(`src/lib/agent/qualify-state.ts:123-188`). Ela **suprime de propósito** o gate (retorna
`false`) em vários casos, contando com "re-engajar num turno POSTERIOR do usuário"
(comentário literal, linhas 120-121: *"let the agent reply conversationally and re-engage
on a later turn"*):

1. `gate === "doubts-wait"` → `false` (linha 130).
2. `intent === "asking_question"` → `false` (linha 172).
3. `intent === "expressing_doubt"` → `false` (linha 173).
4. `intent === "off_topic"` → `false` (linha 174).
5. `intent === "neutral"` com qualify data já presente → `false` (linhas 182-187).

Combinado com os **directives de experiência que proíbem pergunta no final**
(`buildExperienceFirstDirective` — `directives.ts:48`: *"NÃO faça pergunta no final"*;
`buildExperienceDoubtsDirective` — `:56`), o resultado é **explicação fechada + gate
suprimido = silêncio total**. O usuário não tem gancho pra responder e fica esperando um
próximo passo que só vem se ELE mandar outra mensagem.

### Beco sem saída DETERMINÍSTICO — o do print (clique "🤔 Tenho dúvidas")

1. `handleExperience` (`interactive-handlers.ts:280-301`) seta `experiencePrev="doubts"`,
   `doubtsAddressed=false` (linha 290) e roda `buildExperienceDoubtsDirective` via
   `runDirectiveWithOrchestrator` — que é turno de **servidor** (`isUserTurn=false`,
   `adapter.ts:335-343`).
2. No runner, o flag `doubtsAddressed` (o que LIBERA o próximo passo) só é marcado dentro de
   `if (isUserTurn && !producedArtifact)` (`runner.ts:694-699`) — **que NÃO roda em turno de
   servidor**. Então `doubtsAddressed` fica `false` pra sempre.
3. `nextGate` (`qualify-state.ts:40`) retorna `"doubts-wait"` (`experiencePrev==="doubts" &&
   !doubtsAddressed`).
4. `decideShowGate("doubts-wait")` → `false` (linha 130) → `nextGateToFire=null`
   (`runner.ts:733`) → o orquestrador só emite `finish` (`index.ts:342`). **Trava.**
5. Só destrava quando o usuário **digita** algo (`isUserTurn=true` → linha 696 marca
   `doubtsAddressed=true` → aí o `consent` pode disparar, dependendo do intent).

> Obs.: mesmo o clique "🌱 É a primeira vez" (`experience_first`) só NÃO trava porque
> `decideShowGate` tem `if (!isUserTurn) return true` (linha 133) — MAS essa linha vem
> DEPOIS do `doubts-wait → false` (linha 130). Qualquer turno de servidor que resolva em
> `doubts-wait` fura o auto-avanço. O `doubts-wait` via clique é, na prática, redundante com
> o botão **"Entender mais antes"** que o card de `consent` já oferece (`formatter.ts:555`,
> `qualify_start_more`).

### Princípio já cravado pelo próprio Kairo (não é design novo)
`analyze.ts:99-105` (FIX-115): *"se o componente não aparecer tem que se resolver mesmo
assim … senão o funil TRAVA"*. Este fix estende o mesmo princípio aos gates
experiência/consent/dúvidas.

## Correção proposta (o quê × onde) — estratégia 1

> Direção decidida: **puxar o próximo botão no MESMO turno**. Reusa componentes existentes
> (o card de `consent` já tem `Entendi, continuar` / `Entender mais antes`). O agente decide
> a forma mais limpa com TDD; abaixo é a direção, não pseudo-código obrigatório.

| O quê | Onde |
|-------|------|
| Turno **server-authored** (clique/directive) NUNCA pode terminar num gate mudo (`doubts-wait`) quando há um gate real pendente. Fazer o caminho do clique "Tenho dúvidas" convergir pro `consent` após a explicação (o `consent` já tem "Entender mais antes" como saída pra quem ainda tem dúvida) — eliminando o `doubts-wait` redundante do caminho de clique. | `qualify-state.ts` (nextGate/decideShowGate), `interactive-handlers.ts` (`handleExperience`), `runner.ts` (marcação de `doubtsAddressed`/cálculo de `nextGateToFire`) |
| Garantir que a regra "turno de servidor sempre avança" (`decideShowGate` linha 133) tenha precedência sobre a supressão de `doubts-wait` (linha 130) para turnos server-authored — sem quebrar o caso de TEXTO onde `doubts-wait` (esperar o usuário) ainda faz sentido. | `qualify-state.ts:decideShowGate` |
| Varrer as demais reações de qualificação server-authored (`buildExperienceReturningDirective`, `buildQualifyStartYesDirective`, `buildCreditReactionDirective`, `buildTimeframeReactionDirective`, `buildLanceReactionDirective`) e confirmar que CADA uma é seguida do próximo gate — nenhuma termina o turno sem próximo passo. | `interactive-handlers.ts`, `adapter.ts` (`fireGate`/`consumeEvents`), `route.ts` (paridade web) |
| **Paridade web↔WhatsApp** — o mesmo fix vale nos dois canais (a orquestração é compartilhada; o web tem seu próprio dispatch em `route.ts`). | `route.ts` |

⚠️ **Invariante a preservar:** NÃO reintroduzir o BUG-FUNIL-PULA-PASSO2 (o funil não pode
PULAR experiência/consent — isso é o oposto, já corrigido em `analyze.ts:147-166`). Auto-avançar
≠ pular etapa: cada gate obrigatório da jornada continua aparecendo, só que sem exigir o
"continua/vai".

## Regressão exigida (TDD strict — 3 CAMADAS obrigatórias)

**Camada 1 (structural, todo PR):**
- `qualify-state`: provar que, num turno server-authored com `experiencePrev="doubts"` e
  `doubtsAddressed=false`, `decideShowGate`/`nextGate` NÃO deixa o funil parar em `doubts-wait`
  mudo — resolve pra `consent` (ou o mecanismo escolhido oferece o próximo passo).
- `runner`: provar que o clique "Tenho dúvidas" (directive, `isUserTurn=false`) produz
  `nextGateToFire !== null` (o próximo passo é oferecido no mesmo turno).

**Camada 2 (cassette determinístico — `tests/regression/agent-trajectory.test.ts`):**
- Cassette novo `BUG-EXPERIENCE-EXPLAINS-THEN-STALLS` (ou nome equivalente): stream do agente
  explicando consórcio (o texto do print) sem pergunta → assert de que o turno emite o gate
  `consent` (evento `gate`), não fecha em `finish` mudo. Cross-ref pro teste structural.
- `MockLanguageModelV2` + `simulateReadableStream` (padrão da suíte). 100% determinístico.

**Camada 3 (eval LLM, nightly — estrutura em `tests/eval/agent-flow.eval.test.ts`):**
- Cenário: persona leiga (Helena) clica "Tenho dúvidas" / responde "primeira vez" → assert
  comportamental de que a conversa NÃO fica parada (o próximo passo aparece sem o usuário
  cutucar). Critério estrutural (gate emitido / frase de avanço), não LLM-judge ainda.

**Sincronia:** se mexer em prompt/cassette, atualizar `HARD_RULES.md` no MESMO commit
(o teste `HARD_RULES.test.ts` trava isso).
