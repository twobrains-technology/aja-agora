---
titulo: "Funil/turno/orquestração — 3 bugs de PROD corrigidos"
data: 2026-06-30
branch: fix/funil-turno-orquestracao
itens: [FIX-113, FIX-115, FIX-114]
tipo: bloco-de-correcao
---

# Funil / turno / orquestração — 3 bugs de PROD

Logo após o último release, o Kairo testou em **produção (AWS prod)** e achou três
travas na jornada do chat, todas na mesma camada de **funil / gate / turno**. Este
bloco fecha as três, cada uma com regressão em 2 camadas (structural + cassette),
seguindo o TDD strict (teste falha → fix → teste passa).

O fio comum: **um gate avança internamente mas nada visível chega ao usuário** — a
tela congela, o valor cai pra texto sem componente, ou a descoberta dispara sem
identidade. As três correções devolvem ao usuário a sensação de que o agente
**sempre responde e sempre avança**.

---

## O que muda pro usuário

**1. O agente não trava mais em "blz" / "ta bom" (FIX-113).**
Afirmações curtas de continuidade congelavam a conversa: o usuário respondia "blz"
e o agente ficava mudo, só destravando quando ele mandava outra mensagem. Agora, se
um turno fecharia sem **nada visível** (texto, tool ou card), o sistema emite um
retorno honesto na hora — a tela nunca mais fica presa esperando.

**2. O valor do bem sempre avança, e o componente simples voltou (FIX-115).**
No passo do valor o componente não aparecia e, quando o usuário digitava "50k", o
funil às vezes travava. Agora são os **dois lados**: o passo do valor mostra a
**agulha simples** (slider de R$ 1.000 em R$ 1.000) e, se por qualquer motivo ela
não aparecer, o valor por **texto** ("50k", "50 mil", "R$ 50.000") é entendido e
**avança o funil sozinho** — inclusive quando o classificador de linguagem falha
por timeout. Nunca mais um beco sem saída no valor.

**3. A busca de grupos não falha mais com "dificuldade técnica" (FIX-114).**
Em prod o agente tentava buscar os grupos **antes** de coletar CPF+celular, batia na
trava de segurança da Bevi (que exige identidade pra simular) e cuspia "tô com uma
dificuldade técnica pontual pra acessar os grupos". Agora a descoberta só fica
disponível **depois** que a identidade foi coletada — o agente coleta o CPF primeiro
e só então busca, sem nunca narrar mecânica nem inventar uma falha.

---

## Como foi resolvido (decisões de design)

- **FIX-113 — decidi checar SÓ emissão visível, mantendo `handoff`, em vez de contar
  `gate`/`transitionedTo`.** `gate` e `transitionedTo` são estado interno do funil;
  presença deles não garante que o usuário viu algo. `handoff` fica na conta porque o
  card de handoff é a única emissão de um turno em que o agente é calado por design.
  Gates legítimos não sofrem: a pergunta do gate é texto (conta) e o simulador no
  reveal carrega cards (conta). Toquei só `empty-turn-guard.ts` — mudança mínima e
  escopada; o `route` já chamava o guard.
- **FIX-115 — decidi a agulha simples enviando o valor como TEXTO, não como ação
  estruturada.** Assim o componente se integra ao caminho de "valor por conversa"
  (canônico, FIX-104) e ao novo backstop: a agulha manda "Valor do bem: R$ 50.000",
  que o parser determinístico lê igual ao "50k" digitado. Troquei o gate de valor do
  picker complexo "Planeje sua conquista" pra agulha simples — **confirmado com o
  Kairo** (ele escolheu "trocar já pra agulha aqui") e alinhado à jornada canônica,
  que já aposentara o componente complexo. O `PlanEstimatePicker` e seus directives
  ficam para compat de mensagens antigas hidratadas.
- **FIX-115 — decidi um backstop DETERMINÍSTICO (regex) em vez de confiar no
  classificador LLM.** O valor por conversa dependia do analyzer, que cai em fallback
  neutro (valor nulo) em cold-start da Anthropic — e aí o funil travava. O parser puro
  entra só na coleta inicial e só quando o LLM devolveu nulo; o refit pós-reveal segue
  guiado pelo LLM (trocar de faixa é decisão de linguagem, não de regex).
- **FIX-114 — decidi gatear a descoberta no toolset (fail-closed) em vez de só
  tratar o erro depois.** Tirando `search_groups` do request enquanto não há
  identidade, o modelo **nem consegue** chamá-la cedo — a defesa fica a montante, não
  a jusante. As regras de prompt contra meta-narrativa e "dificuldade" inventada já
  existiam (FIX-36 / Maria); travei-as estruturalmente em vez de inflar o prompt.

---

## Root cause confirmado (o que verifiquei no código)

- **FIX-113 — CONFIRMADO.** `isTurnEmpty` (`empty-turn-guard.ts`) retornava `false`
  quando `gate`/`transitionedTo` estavam setados, bloqueando o fallback mesmo sem
  emissão visível. `chat-message.tsx` confirma que `data-gate`/`data-transition`/
  `data-handoff`/`data-welcome` renderizam; no web o campo do trace só é setado quando
  a part é escrita, então gates/handoffs legítimos continuam contando via texto/card.
- **FIX-115 — CONFIRMADO (dois lados).** O gate de valor servia o `PlanEstimatePicker`
  (kind "plan"), não a agulha; e o valor por texto dependia exclusivamente do analyzer
  LLM (`NEUTRAL_FALLBACK` com `creditMax=null` em timeout). `buildSearchSummaryDirective`
  trata `monthlyBudget` como opcional, então a agulha value-only é segura downstream.
- **FIX-114 — CONFIRMADO (com o log de prod).** `allowedTools` na fase `qualify`
  incluía `DISCOVERY_AND_REVEAL_CARDS` (com `search_groups`) **sem** checar
  `identityCollected` — o agente free-rodava a busca antes do CPF e batia no
  `IdentityNotCollectedError` (tripwire proposital do adapter, D1). NÃO é Duplicated
  Hash. O caminho orquestrado (`pipeSearchSummaryTurn`) já disparava o gate identify
  quando faltava identidade; o gap era só o free-run, agora fechado no toolset.

---

## Qualidade entregue (testes)

Regressão em 2 camadas por item (structural + cassette), conforme o CLAUDE.md:

- **FIX-113:** `empty-turn-guard.test.ts` (gate/transição sem emissão => vazio;
  handoff => não-vazio) + cassette em `agent-trajectory.test.ts` ("blz" calado
  detectado como mudo; gate legítimo não).
- **FIX-115:** `parse-asset-value.test.ts` (50k / 50 mil / R$ 50.000 / 1,5 milhão =>
  número; rejeita orçamento mensal) + `value-gate.fix115.test.ts` (gate de valor é a
  agulha) + `analyze.test.ts` (valor por texto avança o funil com analyzer mudo) +
  cassette em `agent-trajectory.test.ts`.
- **FIX-114:** `tool-policy.test.ts` (qualify sem identidade não expõe a descoberta;
  com identidade expõe; o builder confirma que o agent não recebe a tool cru) +
  cassette em `agent-trajectory.test.ts` (policy gateada + prompt veta meta-narrativa
  + detector do vazamento exato do bug).

**Gate verde:** `pnpm test:unit` — **205 arquivos, 2114 testes passando** (contra
Postgres transitório migrado). `pnpm test:integration` — 175 passando, 3 skipped.

---

## Gaps honestos

- **`PlanEstimatePicker` e o handler de ação do gate `credit` ficaram órfãos** (retidos
  para compat de mensagens antigas hidratadas). A limpeza completa (remover o componente
  por intenção e seu handler) é território do bloco irmão `web-valor-agulha` — não foi
  feita aqui para não ampliar a superfície de risco.
- **FIX-113 é defesa a jusante (fallback), não a montante.** O guard garante que o turno
  nunca fecha mudo, mas não força cada gate a emitir sua UI ideal quando o card não pode
  ser montado (ex.: meta faltando). O fallback honesto cobre o usuário; a emissão perfeita
  do gate fica como melhoria futura.
- **Camada 3 (eval LLM real) não roda aqui** — é nightly, depende de credencial Anthropic.
  As Camadas 1+2 (determinísticas) estão verdes e bloqueiam merge.
- **Testes de integração dependem de env** (`IDENTITY_ENC_KEY`, `DATABASE_URL`) que o
  bootstrap do worktree não gera completo; rodei com um Postgres transitório + chave de
  teste. O `test:unit` (gate do merge-wave) não precisa desse env além do DB.
