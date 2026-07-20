# Goal — Runtime de IA LangGraph chaveável (site + WhatsApp)

> 2026-07-20 · Operador: Kairo · Status: criticada → rodando

## Objetivo macro

Um **segundo runtime de IA construído do zero em LangGraph.js** para os dois canais (site +
WhatsApp), **chaveável por flag `AI_RUNTIME`** com o atual (Vercel AI SDK) sem destruí-lo, aplicando
**best practice de agente conversacional** (latitude total — não replicar as travas atuais). O alvo
real é **matar a fragilidade do funil**: hoje a ordem é um if-cascade implícito (`nextGate`) com
escapes/watchdog empilhados que fazem o agente **travar e se perder na dinâmica**. Um **grafo de
estado explícito** (nós + arestas condicionais, com aresta de escape em todo nó) resolve isso, e de
brinde torna a "tool sumida" (buscar grupos) **estruturalmente impossível** (vira nó determinístico).
Encerra quando um **juiz Opus** sela que dá pra chavear `langgraph` ⇄ `vercel`, a jornada roda
inteligente ponta-a-ponta, os invariantes duros são mantidos **em código**, e o modelo **não está
engessado** (conversa/copy/ordem continuam do LLM).

## Decisões do Kairo (2026-07-20, human checkpoint pós-crítico)
- **Destino:** LangGraph é o desafiante; **avaliar/migrar/deletar o Vercel é problema do Kairo depois**.
  Meu objetivo é implementar bem em LangGraph — **sem obsessão por paridade 1:1** dos ~350 FIXes.
- **Grafo × engessar:** **best practice de mercado, latitude total**, não limitado às travas atuais —
  honrando a lei-mãe "não engessar" (que coincide com best practice: grafo pro fluxo/tools, fala do modelo).
- **Validação:** túnel SSM pro LiteLLM + rodar ao vivo; se falhar, selar por invariantes determinísticos
  (conversacional vira PENDENTE-KAIRO até 01/08, quando a cota Anthropic destrava).

## Correção epistêmica (achado do crítico — honesto)
O sintoma citado *"não acha a tool de buscar grupos"* **já está em boa parte corrigido** no código
(FIX-332, `tool-policy.ts:177-208`: `search_groups` fica sempre disponível pós-reveal) ou é **drift
prompt×policy** (FIX-343/350, editável no prompt). O único caso genuíno de tool inalcançável é
**pré-identidade — o invariante I1 de propósito**. Portanto a campanha **não** se justifica por "falta
uma trava" (o CLAUDE.md alerta exatamente contra isso); se justifica pela **fragilidade arquitetural do
funil** (estado implícito + remendos). O grafo é a resposta a ISSO; a tool-como-nó é consequência.

## Arquitetura (o corte + a fronteira de reuso)

**Costura do toggle: `runTurn()` (`orchestrator/index.ts:296`)** — a fronteira que os dois canais
consomem. Dispatcher por `AI_RUNTIME` (default `vercel`): `runTurnVercel` (o atual, extraído sem mudar
comportamento) vs `runTurnLangGraph` (novo). **Consistência por-conversa (fix ALTA-1):** uma conversa
usa UM runtime do início ao fim — **todos** os `runTurn`/directive-turns (inclusive `isUserTurn:false`,
cerimônia de fechamento, injeção de card server-side) de uma conversa `langgraph` vão pro grafo; os
branches de clique **puramente determinísticos** de `route.ts` (que já não chamam o LLM) ficam
compartilhados e intactos.

**Estado do grafo (fix ALTA-6):** estado LIMPO tipado (`messages` + `funnel` struct: campos coletados
+ ofertas + flags de apresentação + `intent`), **autoridade do fluxo**. Persiste via **projeção** pros
campos de `ConversationMetadata` que a UI/adapter/admin/mesa leem (`gatePartData(gate, meta)`,
evento `meta-update`) — não é "diff cego idêntico", é o **conjunto de campos que a superfície
compartilhada consome** (definido no ITEM F). Flags de remendo do runtime velho (`gateStuckTurns` etc.)
não precisam existir.

**Provider (fix ALTA-3):** `ChatAnthropic` (`@langchain/anthropic`) **reusando `resolveGatewayHost()`
via `clientOptions.fetch`** (o gateway resolve host por SRV dinâmico, NÃO base URL fixa),
`apiKey: LITELLM_API_KEY`, `model: AI_MODEL ?? "claude-sonnet-5"`, sem temperature/thinking p/ Sonnet-5.
**Cache (fix MÉDIA-8):** replicar os breakpoints `cache_control` nos blocos estáveis do prompt.

**Reuso (os "componentes" — NÃO reescrever):**
- **Tools:** via **adapter AI-SDK-tool → LangChain-tool (fix ALTA-4)** — os objetos de `buildConsorcioTools`
  (`tools/ai-sdk.ts`) são do pacote `ai`, não LangChain; extrair os `execute` puros p/ módulo neutro OU
  envolver em `DynamicStructuredTool` (zod→schema). What-if via `ToolNode` (`@langchain/langgraph/prebuilt`);
  toolset por fase reusa `allowedTools(meta, channel)` (`tool-policy.ts`).
- **Descoberta como NÓ:** `runDiscovery`/`search_groups`/`recommend_groups` disparados por transição
  (identidade + valor), nunca discricionários.
- **Analyzer como NÓ (fix MÉDIA-10):** `analyze.ts`/`turn-analyzer` reusados num nó `analyze` no início
  de todo turno de usuário — alimenta `intent`/meta que as guardas de aresta precisam.
- **Coerção I3 + guards:** `coerce*Payload` + `evaluateArtifactGuards` (`*-payload.ts`, `artifact-guard.ts`).
- **Cards server-side:** `server-cards.ts` builders. **Compliance I4/I5/D7:** `sanitizer.ts`.
- **Cálculo/scoring + D6:** `recommendation.ts` (`respectsNetCreditGuardrail`), `consorcio/*`, `qualify-config.ts`.
- **Persistência:** `persistMeta`/`saveMessage`/tabela `artifacts`/`recordStageReached`.
- **System-prompt enxuto:** blocos de `system-prompt.ts` (`<voice>`/exemplos/compliance) **sem** o "Fluxo
  de Vendas siga esta ordem" (agora é o grafo — elimina o drift prompt×código).

**Intacto:** os 2 channel adapters, o front (`artifact-renderer.tsx`), o `formatter.ts` WhatsApp, o
schema do DB, o contrato `TurnEvent`, e o runtime Vercel (default).

**Contrato de saída (fix MÉDIA-7):** `runTurnLangGraph` emite os **14 eventos** que `pipeOrchestratorToWriter`
consome: `text-delta, lead-collection-prompt, artifact, gate(+modelAsked), transition,
welcome-categories, handoff, lead-stage, tool-call, suppression, usage, finish, meta-update, text-boundary`.
`meta-update` carrega a projeção do `ConversationMetadata` (load-bearing p/ `gatePartData`).

## Definition of Done — a RUBRICA (mecanicamente checável)

Só encerra quando **todas** batem o teto E o juiz **Opus** declara "matador, dá pra chavear".

| Dimensão | Critério de teto | Como checa |
|---|---|---|
| **Chaveamento** | `AI_RUNTIME=langgraph` roda os 2 canais; `=vercel` idêntico a hoje. 1 flag, sem tocar front/adapters/schema. Consistência por-conversa (sem mistura de runtime). | inspeção do seam + E2E nas 2 posições |
| **Jornada (negócio)** | Funil fecha name→desire→motivo→credit→identify→**discovery(nó)**→reveal→decision→closing; **0 `NoSuchToolError`** (grep no log); nenhum gate trava sem escape. | E2E conversacional (coletor Haiku) + juízo |
| **Não-engessar (sondas mecânicas, fix MÉDIA-9)** | (a) usuário puxa off-topic no gate `credit` → agente responde E volta a coletar credit em ≤2 turnos; (b) "não entendi" 2× → as 2 respostas **byte-diferentes** (grep de igualdade); (c) mesma entrada em 3 runs → 3 fraseados distintos; (d) coletor = modelo **mais fraco** que o de prod (Haiku sonda Sonnet-5). Zero `const` de fala. | dossiê + greps determinísticos |
| **Invariantes duros** | I1 identidade antes de discovery (impossível pelo grafo); I3 payload coagido; I4 sem "reservado"/"garantida"; I5 ressalva; D6 netCredit≥bem; escassez só com slot real; `taxaContemplacao` nunca. | testes de invariante (vitest, imgameável) |
| **Paridade de cards/UX** | os 22 tipos de card (`chat/types.ts`) emitidos server-side coeridos renderizam na web; no WhatsApp degradam certo (texto/interativo/`null`); zero card órfão. | prints 375/1440 + transcrição WhatsApp |
| **Testes/build** | invariantes LangGraph verdes; **Vercel segue verde**; `pnpm test:unit` + `pnpm build` verdes na base integrada. | juiz lê saída verde pós-integração (1x/rodada) |

## Itens — Rodada 0 (serial: spike + contrato + skeleton) `[fix ALTA-5]`
> O caminho crítico é serial; a paralelização real só existe DEPOIS que o contrato de interface está
> cravado. Rodada 0 estabelece isso.

### ITEM 0A — Spike de fundação (gateway + tool-call) `[serial, primeiro]`
- **O quê:** provar 1 chamada `/v1/messages` via `ChatAnthropic` + `resolveGatewayHost` (SRV-fetch),
  resolvendo `claude-sonnet-5` no LiteLLM, com **1 tool-call nativo** (Anthropic passthrough) voltando ok.
- **Aceite:** script/teste que imprime a resposta do modelo + o tool_call parseado. Se o passthrough de
  tool não funcionar via LangChain, **ISTO é o gate de fundação** — replaneja (OpenAI-compat `/v1/chat/completions`)
  antes de construir o grafo. Requer o túnel SSM (validação Q3).

### ITEM 0B — Contrato de interface + toggle + extração `[serial, após 0A]`
- **O quê:** `src/lib/llm/runtime.ts` (flag, espelha `utils/env.ts`); extrair a orquestração atual p/
  `runTurnVercel` sem mudar comportamento; `runTurn` vira dispatcher (consistência por-conversa, ALTA-1);
  instalar `@langchain/langgraph@1 @langchain/anthropic@1 @langchain/core@1` (zod4 ok); definir os TIPOS:
  estado do grafo, `RuntimeAdapter`, o mapeamento dos 14 `TurnEvent`, a projeção estado→`ConversationMetadata`,
  a assinatura do adapter de tool. **Só os tipos/contratos** — implementação vazia (stubs) que compila.
- **Aceite:** `pnpm build` verde com o dispatcher e stubs; `=vercel` intacto (suíte verde).

### ITEM 0C — Walking skeleton (grafo mínimo end-to-end) `[serial, após 0B]`
- **O quê:** grafo com nós `analyze → route → converse` + `discovery` + `emit_card` + `persist`, rodando um
  slice REAL: name→desire→credit→identify→**discovery**→reveal→closing. Streaming `["messages","custom"]`
  (tokens + cards). Emite os eventos, persiste messages/artifacts/meta (projeção).
- **Aceite:** com `AI_RUNTIME=langgraph`, um E2E curto no canal web percorre até o reveal com cards
  renderizando + persistência no shape que a UI lê; **um clique de card** (ex.: decision) funciona sob a flag.

## Itens — Rodada 1+ (paralelizável contra o contrato de 0B)
### ITEM D — Nós de funil completos + roteador (best practice)
- Nós `rapport`(name/desire/motivo/espelho), `experience`, `reco-consent`, `timeframe`,
  `lance`/`lance-value`/`lance-embutido`, `simulator-offer`, `decision`, `closing`. Roteador conditional-edge
  com **aresta de escape em todo nó** (usuário sempre desvia; o card só aparece no momento certo — o modelo
  decide a FALA). Reusar a lógica de ordenação de `nextGate`/`decideShowGate` como guarda, sem re-injetar copy.
### ITEM E — Cards + coerção + invariantes-guard
- Toda emissão passa por `coerce*Payload`+`evaluateArtifactGuards`; saída do `converse` pelo `sanitizer`;
  `recommend`/`rank` com `respectsNetCreditGuardrail`; escassez só com slot real. Remover do prompt as regras
  que viraram nó. Os 22 cards cobertos.
### ITEM F — Persistência-projeção + fiação dos 2 canais + WhatsApp
- Módulo `emit.ts` (efeitos do grafo → 14 TurnEvents + escritas de DB idênticas em campos consumidos).
  Definir o **conjunto de campos** da projeção que a UI/admin/mesa exigem. Validar `pipeOrchestratorToWriter`
  (web) e `consumeEvents`/`artifactToWhatsApp` (WhatsApp) consumindo o stream sem alteração.
### ITEM G — Testes necessários
- Invariantes LangGraph (I1/I3/I4/D6, discovery-nó, 0 `NoSuchToolError`, dispatch da flag); Vercel verde;
  sondas de não-engessar (byte-diff de "não entendi", variância de copy). **Sem** regex travando copy.

## Model routing
| Fase | Modelo | Como se força |
|---|---|---|
| definir / criticar / plano E2E | Opus | `model: "opus"` |
| executar (blocos) | sonnet (build de runtime > volume trivial) | `TB_BLOCK_MODEL=claude-sonnet-5` no `launch-blocks.sh` |
| coleta determinística (invariantes) | nenhum — vitest | — (preferido) |
| coleta conversacional | haiku via Claude in Chrome | `model: "haiku"` (coleta, não julga) |
| julga a RODADA | Sonnet lê o dossiê | `model: "sonnet"` |
| SELA o marco | `claude-opus-4-8` lê o dossiê | `model: "opus"` (1x/marco) |

> Produto verificado É uma IA: runtime aponta pro gateway (virtual key `aja-agora-dev`,
> `litellm-srv.tb.local:4000`) — config do produto, não routing da campanha.

## Política de exits
- Exit primário: **verifier-pass** (Opus 10/10 "matador, dá pra chavear"). Sem cap de rodadas.
- No-progress (2 rodadas sem ganho) → **troca de ângulo obrigatória**. NÃO encerra.
- Observabilidade: tokens/tempo por rodada no LEDGER.
- Human checkpoint: decisão de produto/UX/copy/escopo/infra/prod → `AskUserQuestion`.

## LEDGER de rodadas (append-only)
Evidências em `.processo/loop/2026-07-20-1948-langgraph-runtime/evidencias/rodada-N/`.

| Rodada | Data | Blocos | Evidências | Score juiz (por dimensão) | Achados → próxima | Custo |
|---|---|---|---|---|---|---|
| 0 (spec) | 2026-07-20 | crítico Opus | — | veredito: passa-com-ajustes; ALTA-1..6 + MÉDIA-7..10 fechados na spec; decisões do Kairo capturadas | 4 investigadores + crítico |
| 0 (fundação) | 2026-07-20 | bloco-fundacao-langgraph (FIX-355..358, Sonnet) | — | lançado — walking skeleton serial (flag+dispatcher, provider SRV-fetch, contrato estado/tool-adapter/14-eventos, grafo mínimo) | — |

## Riscos e gaps honestos
- **Validação exige gateway alcançável** (túnel SSM; cota Anthropic direta estourada até 01/08). Fallback: invariantes.
- **Bevi homologação = proposal-hash compartilhado** → QA conversacional NUNCA em paralelo (coletor serial).
- **Tool-calling nativo via LangChain no passthrough LiteLLM = NÃO-PROVADO** → é o gate do ITEM 0A.
- **Fundação serial e acoplada** → Rodada 0 é serial de propósito; paralelismo só na Rodada 1+.
- **Fora de escopo:** paridade 1:1 dos ~350 FIXes (decisão do Kairo); default de prod segue Vercel; mesa/copiloto humano.
