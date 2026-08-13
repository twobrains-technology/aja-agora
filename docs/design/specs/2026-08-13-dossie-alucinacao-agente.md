# Dossiê de causa-raiz — por que o agente "alucina" em produção (2026-08-13)

> **Autor:** Super Especialista de IA (revisor de arquitetura de agente).
> **Escopo:** as duas sessões de WhatsApp de 2026-08-13 — `a68b1945-a7de-48e5-849d-5e35c18a4c8d`
> (carro BYD Song, R$ 238 mil, 02:52→02:55, venda perdida) e
> `04fda013-1868-42c7-a9aa-a864d8df000d` (moto PCX, R$ 22 mil, 02:56→02:59).
> **Fontes:** observations completas do Langfuse de produção (projeto `aja-agora`,
> `cmsicnldl0006mv07gy700qy6`), código na `main` (`7e5af2c2`), e três sondas empíricas
> rodadas contra o sanitizer/ancoragem reais (reproduzem byte a byte o que produção entregou).
> Tudo que está marcado **PROVADO** tem trace ou `arquivo:linha`; **INFERÊNCIA** é dedução de
> mecanismo com os dois lados provados; **HIPÓTESE** está aberta.

---

## Veredito em uma frase

O agente não alucinou: **ele obedeceu, com precisão, a um sistema que dá ordens contraditórias**
— directives e prompt escritos para um runtime que não existe mais mandam chamar tools que o
grafo nunca expõe, um guard de ancoragem anula o mecanismo de destravamento do funil em livelock
permanente, e o sanitizer descarta a fala que a própria directive ditou — e cada frase "sem nexo"
que chegou ao cliente é a tradução honesta, feita pelo modelo, de um estado de servidor quebrado
que só ele estava vendo.

---

## 1. Causa-raiz por defeito (as três camadas em cada sintoma)

### Defeito A — S1: "Infelizmente tive um problema na busca" → venda perdida

**Camada onde nasce: ESTADO/FLUXO.** A conversa morreu num **livelock determinístico entre dois
guards**, e tudo que o cliente viu depois é consequência.

A cadeia, elo a elo:

1. **PROVADO** — Cliente responde "238" ao pedido de valor (trace `2602a7b4`, 02:53:45). O estado
   resultante ficou **meio-capturado**: `qualifyAnswers = {creditMin: 214200, creditMentionedAtDesire:
   238000}` e `creditMax` **ausente** (trace `f83ff29a`, span `advance`, output).
2. **PROVADO (sonda empírica)** — `valorAncoradoNoTexto("238", 238000) === false` (e
   `"22k" → true`, `"238 mil" → true` — por isso a S2 passou por este mesmo ponto e a S1 não).
   O guard de ancoragem FIX-378 (`src/lib/agent/langgraph/nodes/analyze.ts:87-98`) viu um
   `creditMax=238000` que "não está no texto" e **deletou só o `creditMax`** (linhas 95-97),
   deixando o `creditMin=214200` derivado (238000×0,9) órfão no estado. O analyzer LLM entendeu
   "238" corretamente pelo contexto; o veto determinístico re-derivou por regex e errou — é o
   padrão já documentado na memória "duas fontes de verdade", reincidindo.
3. **PROVADO** — Com `creditMax === undefined`, `nextGate` devolve `"credit"` para sempre
   (`src/lib/agent/qualify-state.ts:353`). O funil nunca chega em `identify` → o tripwire D1 do
   WhatsApp nunca pede o CPF (`src/lib/whatsapp/adapter.ts:776-782`) → `identityCollected` nunca
   vira true → a busca nunca é autorizada.
4. **PROVADO + INFERÊNCIA** — O mecanismo de escape existe e estava armado: FIX-307 promove
   `creditMentionedAtDesire → creditMax` após 3 turnos travados (`qualify-state.ts:158-174`,
   `GATE_STUCK_ESCAPE_THRESHOLD = 3`; contador `gateStuckTurns.credit = 1` visível no trace
   `f83ff29a`). Só que o patch do escape passa pelo MESMO guard FIX-378 no turno seguinte do nó
   `analyze` — e "238000" nunca está ancorado no texto do turno em que o escape dispara ("Ok 3
   anos", "02874137138"). **O escape promove, o guard reverte, o contador recomeça: livelock por
   construção.** (A colisão é INFERÊNCIA de mecanismo; cada metade dela está provada em código e
   o estado final observado — `creditMax` ausente até o fim da sessão — é consistente só com ela.)

**Camada 2 (CONTEXTO), o amplificador.** No turno 02:53:45 o modelo escreveu
"Perfeito, R$ 238 mil. Deixa eu buscar os melhores grupos de consórcio para esse valor e te
mostrar as opções. Um minutinho! 🔍". **PROVADO (sonda)** — o sanitizer entrega exatamente
`"Perfeito, R$ 238 mil. \n\n Um minutinho!"` (drop `process-preamble` na frase informativa,
o filler "Um minutinho!" sobrevive, o emoji cai) — byte-idêntico ao que produção mandou. Mas o
histórico do checkpointer guarda a fala **crua** (`converse.ts:865-870` persiste o `merged` sem
filtro; o histórico do trace `f83ff29a` contém a promessa completa com 🔍). Resultado: no turno
seguinte o modelo relê **a própria promessa que o cliente nunca ouviu**, com o system prompt
mandando "**Prometeu, entrega NO MESMO TURNO** … (as ferramentas estão na sua mão)"
(`system-prompt.ts:38`) e citando `search_groups` pelo nome em ~25 pontos que o `leanSystemPrompt`
não remove (`converse.ts:125-142` corta só a seção "## Fluxo de Vendas"; sobram
`system-prompt.ts:45,447,455,464,493,495…`).

**Camada 3 (FALA), a consequência honesta.** **PROVADO** — o modelo chamou
`search_groups {category:"auto", creditValue:"238000"}` e o `ToolNode` devolveu
`Error: Tool "search_groups" not found. Please fix your mistakes.` (trace `f83ff29a`, span
`converse`; contrato do pacote em
`node_modules/@langchain/langgraph/dist/prebuilt/tool_node.js:194,217` — com
`handleToolErrors=true`, default, o erro cru vira ToolMessage no contexto). O toolset do
`converse` é **fixo e nunca contém `search_groups`** por desenho
(`converse.ts:50-95`, `WHAT_IF_TOOL_NAMES` — a busca é o nó `discovery`). "Tive um problema na
busca" é a tradução fiel do que o modelo viu. Depois: "já está resolvido" (confabulação induzida
— única fala sem lastro, mas nascida do erro anterior), a recusa do CPF (defeito C), e o handoff
— o próprio prompt oferece o caminho ("problema técnico → suporte"). Última fala do cliente:
"Porra de consultor cacete" (trace `ca6238d8`).

**Por que os sinais não pegaram:** ver §3. Nota importante: **um sinal determinístico PEGOU** —
`gate_entregue=0` / `gate_afundado=credit` no turno que matou a venda. Ele apontava o lugar certo
(funil afundado em `credit`) e ninguém estava olhando/alertando para ele.

### Defeito B — S2: directive manda chamar tool fantasma; servidor já tinha feito a busca

**Camada onde nasce: CONTEXTO (comando duplicado).**

**PROVADO** (trace `5b616a0b`, 02:57:52):

- 02:57:52.509 — o nó `discovery` rodou `recommend_groups` **server-side** com sucesso (7+
  grupos; estado atualizado: `identityCollected: true`, `searchDispatched: true`,
  `revealCompleted: true`, oferta TRADIÇÃO ancorada).
- 02:58:05.810 — treze segundos DEPOIS, o `converse` recebeu como mensagem do turno a directive
  `buildSearchSummaryDirective` (`orchestrator/directives.ts:361-387`): "FLUXO OBRIGATÓRIO …
  1. Chame search_groups com category=\"moto\", creditMin=19800, creditMax=22000 ANTES de
  anunciar qualquer coisa" — mais 5 passos numerados mandando chamar `recommend_groups`,
  `present_recommendation_card`, `simulate_quota`, `present_comparison_table`.
- O modelo obedeceu à letra: chamou `search_groups(category="moto", creditMin=19800,
  creditMax=22000)` — os argumentos EXATOS da directive — e tomou `Tool "search_groups" not
  found`. Gastou **3 rodadas de LLM** (~6,5 s) brigando com uma busca que o servidor tinha
  concluído no mesmo turno; na 2ª rodada pediu CPF por texto ("Preciso confirmar seus dados…")
  com `identityEnc` JÁ no estado — pedido que o sanitizer podou da entrega; a 3ª rodada veio
  vazia. O cliente recebeu: "Ótimo, Kairo! Deixa eu tentar de outro jeito aqui."

O system message do turno até dizia a verdade ("As ofertas REAIS … JÁ FORAM BUSCADAS",
`blocoOfertas`, `converse.ts:509-532`) — mas a directive, mais específica, mais recente e
imperativa ("FLUXO OBRIGATÓRIO", "ANTES de anunciar qualquer coisa"), venceu. Duas autoridades na
mesma janela, em contradição direta: **o grafo fez a busca; o texto mandou o modelo fazê-la; a
policy negou a ferramenta.** A directive é arqueologia do runtime Vercel (onde `search_groups`
era tool do LLM) rodando intacta no runtime LangGraph.

**Camadas 1 e 3:** o estado estava correto (a busca rodou); a fala foi a melhor saída possível
dado o contexto envenenado. Este defeito é 100% camada 2.

### Defeito C — S1: o cliente OFERECE o CPF e o agente RECUSA

**Camadas: ESTADO (metade) + CONTEXTO (metade).**

- **PROVADO (código)** — a captura determinística de CPF no WhatsApp só funciona quando o funil
  está no gate identify: `captureIdentifyText` retorna `handled: false` se
  `nextGate(meta) !== "identify"` (`src/lib/whatsapp/identify-capture.ts:130`). Com o funil em
  livelock no `credit` (defeito A), o CPF digitado espontaneamente ("02874137138", trace
  `eb3ea18a`) passou reto pelo servidor e caiu no modelo. **O cliente entregou a chave da única
  porta trancada e o sistema não tinha fechadura naquele estado.**
- **PROVADO (código)** — o system prompt proíbe, sem qualificação de canal: "NUNCA peça dados
  pessoais (nome, CPF, email, telefone) por texto" (`system-prompt.ts:63`; reforços em
  `:220,223,301,318`). Essa regra é verdadeira na WEB (form/card) e **falsa no WhatsApp**, onde a
  identidade é coletada POR TEXTO por desenho (`adapter.ts:776-782`, `IDENTIFY_WHATSAPP_PROMPT`).
  O modelo aplicou a regra que tinha: "Opa, não precisa compartilhar CPF comigo não!". Não é
  desobediência — é obediência à regra errada para o canal.

### Defeito D — S2: o turno mudo (cliente escolhe o grupo, agente não diz uma palavra)

**Camada onde nasce: FALA — mas por maquinário determinístico do servidor, não pelo modelo.**

**PROVADO** (trace `71191c00`, 02:58:23): o modelo NÃO ficou mudo. Ele escreveu
"Beleza, dá uma olhada na simulação da BANCO DO BRASIL:" (1ª rodada, exatamente o que a directive
pediu), rodou `simulate_quota` com groupId/creditValue literais, escreveu "Agora vou mostrar o
detalhamento completo:" e rodou `present_simulation_result` — tudo com sucesso. O turno fechou
com `textChars=0` mesmo assim. A sonda empírica reproduz o mecanismo, frase a frase:

1. `"Beleza, dá uma olhada na simulação da BANCO DO BRASIL:"` → termina em `":"`, ≤90 chars →
   `ehGancho` (`sanitizer.ts:1024-1027`) → **segurada** como gancho, só sai "junto com o que ela
   anuncia" (`sanitizer.ts:1216-1224`). Sonda: `out:"", tail:"", dropped:[]` — some sem motivo
   registrado.
2. `"Agora vou mostrar o detalhamento completo:"` → `process-preamble`
   (`ANNOUNCEMENT_VERB` sem dado concreto, `sanitizer.ts:89-103`) → **dropada**, e a regra "o
   gancho vai junto" (`sanitizer.ts:1210-1214`) teria matado o gancho se ele chegasse aqui;
3. `present_simulation_result` é tool de APRESENTAÇÃO → `pedeFalaDepoisDasTools` = false → o
   loop encerra sem rodada final de fala (`converse.ts:1134`);
4. `flush()`: "Gancho que sobrou no fim do turno não anuncia nada — descarta"
   (`sanitizer.ts:1163-1164`).

O detalhe que transforma bug em tese: **a frase engolida foi DITADA pelo próprio servidor.**
`buildGroupSelectedDirective` prescreve o exemplo `"Beleza, dá uma olhada na simulação da X:"`
(`orchestrator/directives.ts:214`) — formato-gancho, terminado em dois-pontos — que o sanitizer
do mesmo servidor foi desenhado para segurar-e-descartar. Um subsistema determinístico dita o
formato; outro subsistema determinístico o suprime; o modelo, no meio, fez tudo certo.

**Web × WhatsApp** (pergunta 4 da missão): na web o custo é baixo porque o card É a resposta na
tela e a fala em volta é acessória. No WhatsApp o card também EXISTE — correção factual ao
briefing: `simulation_result` tem mapper (`src/lib/whatsapp/formatter.ts:1339-1340`), e o cliente
recebeu algo clicável (INFERÊNCIA: a directive seguinte, trace `54149a44`, diz "O usuário já viu
o card de decisão e reafirmou que quer seguir" — ele clicou "Tenho interesse!" 15 s depois). O
que faltou foi a FALA do vendedor em volta do card: 15 segundos de silêncio humano num canal onde
silêncio é abandono. E o sinal `turno_mudo=1` disparou sem ninguém agir — o guard de turno vazio
não roda em directive (`adapter.ts:720-723`, por design) e a decisão registrada em
`converse.ts:1169-1184` ("a solução não é falar mais — é o guard do canal não tratar um turno que
ENTREGOU CARDS como se ninguém tivesse dito nada") diagnostica certo e ainda não foi implementada.

**Onde no grafo isso se resolve:** não é um nó novo — são três contratos: (a) o filtro libera o
gancho quando um `artifact` sai no mesmo turno (o card é o conteúdo que ele anuncia); (b) a
directive prescreve INTENÇÃO, nunca formato de frase (o exemplo com ":" fabrica o gancho); (c) o
score distingue "mudo de verdade" de "card sem fala" (hoje `turno_mudo` só olha `textChars`,
`funil-scores.ts:96-102`).

### Defeito E — S2: funil fora de ordem (experiência e prazo DEPOIS do fechamento)

**Camada: ESTADO/FLUXO.** **PROVADO** pela sequência de directives: pré-cadastro fechado às
02:58:38 (`54149a44`), "Usuário escolheu 'É a primeira vez'" às 02:58:49 (`aa93010c`), escolha de
prazo às 02:59:08 (`7255388b`). Dois trilhos dirigem a mesma conversa sem reconciliação: o trilho
de CLIQUES (interactive-handlers → directives, que levou o cliente de lista → simulação →
pré-cadastro em 60 segundos) e o trilho do `nextGate` (que ainda devia `experience`/`timeframe` e
continuou entregando a fila velha depois que os marcos posteriores já tinham acontecido —
`routeFinal` devolvia `gate=experience` enquanto o cliente escolhia grupo, trace `5b616a0b`). É a
mesma duplicidade de comando do defeito B, no nível do fluxo: o cliente correu na frente e o funil
não consome o progresso do trilho paralelo.

---

## 2. O desenho que permite tudo isso — e como o estado da arte resolve

O diagnóstico estrutural, em uma linha: **a migração Vercel→LangGraph moveu a EXECUÇÃO da busca
para o grafo, mas deixou o COMANDO da busca no texto.** O grafo está certo
(`graph.ts:106-116`: `advance → discovery → routeFinal → converse`, busca ANTES da fala,
interrupt+checkpointer para durabilidade — é o padrão recomendado). O que sobrou errado:

1. **Três fontes de verdade sobre tools.** O toolset REAL é `WHAT_IF_TOOL_NAMES`
   (`converse.ts:50-95`, vinculado via `bindTools` — que é, confirmado na doc corrente do
   LangGraph JS, o lugar certo: o nó é dono do toolset que o modelo enxerga). Mas o system prompt
   descreve um segundo toolset (com `search_groups`/`recommend_groups` como tools do LLM) e as
   directives comandam um terceiro. `tool-policy.ts` (o allowlist por fase, FIX-114/19) governa o
   runtime Vercel e nem é consultado pelo `converse` — a análise inicial que atribuía o defeito a
   `tool-policy.ts:150-156` estava mirando a tabela errada: no LangGraph a tool nunca esteve lá,
   em fase nenhuma. **Regra do estado da arte (Rasa CALM, 12-factor, e a Lei 4 da casa): o que o
   prompt/directive diz sobre ferramentas tem que DERIVAR do toolset vinculado, nunca ser texto
   paralelo mantido à mão.**

2. **Directive como macro de procedimento = LLM dirigindo fluxo por procuração (Lei 1 violada
   por dentro).** `buildGroupSelectedDirective` manda: chame `simulate_quota` com ESTES argumentos,
   depois `present_simulation_result`, não chame X, não repita Y. Isso não é NLU nem geração de
   linguagem — é um script fixo executado via LLM, com a latência e a não-determinismo do LLM e
   nenhum dos benefícios. No LangGraph isso é um NÓ (como `discovery` já é): clique →
   `Command(goto: "simulate")` → nó determinístico roda simulação e emite o card → `converse`
   recebe o RESULTADO no estado e só faz o que é dele: apresentar com as palavras dele. A regra
   de fronteira: **directive carrega fatos e intenção ("o cliente escolheu o grupo X; a simulação
   está pronta; apresente"), nunca sequência de tool-calls.** O padrão correto já existe em casa:
   `buildRecoConsentAcceptedDirective` (`directives.ts:400-402`) — só narrativa, zero tool, card
   emitido server-side.

3. **Guards empilhados sem árbitro = blocklist brigando com blocklist (Lei 2).** FIX-378 (âncora
   de valor) × FIX-307 (escape de gate preso) se anulam em livelock — cada um nasceu de um
   incidente real e está certo sozinho; ninguém verificou a composição. O mesmo padrão no turno
   mudo: gancho-segurado × preamble-drop × loop-break-de-apresentação, três mecanismos razoáveis
   que compostos produzem silêncio total. **Allowlist de transições no nível da máquina de
   estados (o que PODE acontecer a partir daqui) em vez de acúmulo de vetos locais** é exatamente
   o que a referência de arquitetura prescreve; um teste de invariante por comportamento composto
   ("estado meio-capturado nunca sobrevive a um turno"; "turno com card entregue nunca tem fala
   zero") teria pegado os dois.

4. **Dois "clientes" da mesma fala (entregue ≠ persistido).** O sanitizer edita o que o cliente
   vê; o checkpointer guarda o que o modelo disse (`converse.ts:865-870`). Toda edição vira uma
   divergência de realidade que o modelo carrega para sempre ("prometi a busca" que ninguém
   ouviu). O estado da arte aqui é simples: **ou a fala editada é a fala persistida, ou o corte é
   anotado no contexto do turno seguinte** ("sua frase X foi suprimida pelo sistema; o cliente
   não a viu") — hoje o modelo é o único participante que não sabe que foi censurado.

---

## 3. Por que os juízes não pegaram — e qual sinal determinístico pega

Os quatro juízes (`judge_resolved=1`, `judge_avancou=1`, `judge_hallucination=0`,
`judge_tone=0.62` no turno que matou a S1) julgam **prosa contra o histórico visível** — e a
prosa estava impecável: educada, coerente, e (a parte que ninguém quer ouvir) **verdadeira**: o
agente tinha mesmo um problema na busca. `judge_hallucination=0` está tecnicamente CORRETO — não
houve alucinação de fala; houve defeito de estado e contexto, camadas que um juiz de texto não
enxerga por construção. É a mesma conclusão do incidente de 2026-08-10 (memória "juiz LLM não
pega funil parado"), agora com prova dupla.

Os sinais que funcionam são os que já apontavam ou passaram a apontar o FATO do servidor:

- **Já existia e disparou**: `gate_entregue=0` + `gate_afundado=credit` — apontava o lugar exato.
  Faltou Monitor/alerta consumindo (HIPÓTESE: não confirmei a configuração de Monitors da
  instância; o sinal no trace está lá).
- **Criado hoje e correto**: `tool_falhou`/`tool_falha_nome`/`tool_falha_tipo`
  (`funil-scores.ts:214-235`) + reescrita do erro cru em instrução de conduta
  (`tool-falha.ts`). Ancorado no fato (ToolMessage com status error), não na frase. Avaliação de
  suficiência no §5 (P0.5): **necessário, não suficiente** — trata o sintoma da tool fantasma,
  não a directive que a comanda nem o livelock.
- **Faltam, todos ancorados em fato de servidor, zero regex sobre fala**:
  - `fala_podada` — `droppedSegmentReasons()` já existe (`sanitizer.ts:1297`) e não vira score;
    o turno mudo teria saído com `process-preamble` no comment em vez de silêncio inexplicado.
  - `escape_revertido` — o instante exato do livelock é observável: o mesmo turno em que o patch
    do FIX-307 é promovido e o FIX-378 o reverte. Um score booleano ali transforma "3 dias de
    vendas perdidas" em "alerta no primeiro cliente".
  - `fala_entregue_difere_do_historico` (nº de chars podados por turno) — mede a dívida de
    realidade entre o que o modelo acha que disse e o que o cliente ouviu.
  - **Invariante de build, não de produção**: teste que varre directives + system prompt e falha
    se citarem tool fora do toolset vinculado do runtime. Mata a CLASSE do defeito B em CI.

---

## 4. O que NÃO é a causa (hipóteses descartadas com evidência)

- **"Modelo fraco" (Haiku 4.5)** — descartado. Nos traces, o modelo seguiu instruções à letra:
  chamou `search_groups` com os argumentos exatos da directive, `simulate_quota` com o groupId
  literal, escreveu a frase de introdução no formato pedido, e continuou vendendo até depois do
  "Porra de consultor" ("Entendo a frustração… Qual é a sua região?"). Os erros de entendimento
  da sessão foram do lado DETERMINÍSTICO (`valorAncoradoNoTexto("238")`), não do modelo — o
  analyzer LLM entendeu "238" certo. Trocar de modelo não muda nenhum dos cinco defeitos.
- **Temperatura/aleatoriedade** — descartado. Os defeitos são reprodutíveis por construção: o
  livelock é aritmético, a tool fantasma falha 100% das vezes (não está no bind), o gancho é
  regex. As duas sessões quebraram nos mesmos pontos pelos mesmos mecanismos.
- **"Falta uma trava no prompt"** — descartado e invertido. As falas ruins nasceram de travas:
  a recusa do CPF É uma regra do prompt aplicada no canal errado (`system-prompt.ts:63`); o
  silêncio do turno mudo É o sanitizer executando suas regras; a promessa fantasma sobreviveu
  porque a regra "Prometeu, entrega" colidiu com a poda da entrega. O prompt já opera acima do
  limite de aderência (Lei 4: degradação omission-dominated acima de ~15 constraints — este tem
  dezenas). Cada trava nova piora as outras.
- **"Alucinação" no sentido clássico (modelo inventando fato)** — 95% descartado. Todo número
  citado saiu de tool real (R$ 696,72/44m = retorno literal do `simulate_quota`). As frases "sem
  nexo" mapeiam uma a uma para fatos de servidor quebrados. Exceção honesta: "já está resolvido"
  (trace `1b8b2111`) é confabulação — mas induzida pelo erro anterior e sem trava possível que
  não seja consertar a causa.
- **`tool-policy.ts:150-156` (FIX-114) como culpado direto** — descartado. A tabela governa o
  runtime Vercel; o `converse` do LangGraph nem a consulta — usa `WHAT_IF_TOOL_NAMES` fixo, onde
  `search_groups` nunca existiu em fase nenhuma. O conserto não é "liberar a tool na fase" — é
  parar de mandar o modelo chamá-la.

---

## 5. Plano priorizado

### P0 — estanca a sangria (cada item cabe numa sessão)

1. **[código] Desarmar o livelock FIX-378×FIX-307** — `src/lib/agent/langgraph/nodes/analyze.ts:87-98`:
   o veto de ancoragem não se aplica a valor promovido pelo escape de gate preso
   (`stuckGateDefaultApplied`) nem a valor igual a `creditMentionedAtDesire` (o cliente JÁ disse
   esse número; só não NESTE turno). Regressão: transcrição da S1 como cenário determinístico.
2. **[código] `valorAncoradoNoTexto` entende resposta numérica nua ao gate de valor** —
   `src/lib/agent/valor-declarado.ts`: "238" respondendo pergunta de valor ancora 238000 (contexto
   do gate dá a escala). É o conserto da causa; o item 1 é o cinto de segurança.
3. **[contexto] Directives param de comandar tools no runtime LangGraph** —
   `orchestrator/directives.ts:361-387` (`buildSearchSummaryDirective`) e `:208-224`
   (`buildGroupSelectedDirective`/`buildSimulateDirective`): reescrever no padrão
   `buildRecoConsentAcceptedDirective` (`:400-402`) — fato + intenção de apresentação, zero
   tool-call, zero formato de frase. A busca o grafo já fez; a simulação vira P1.4.
4. **[código] CPF espontâneo sempre tem fechadura** — `src/lib/whatsapp/identify-capture.ts:130`:
   CPF válido (DV) com `identityCollected=false` é capturado em QUALQUER gate — a validação de
   dígito verificador é âncora determinística suficiente; recusar a chave que o cliente entrega
   nunca é o comportamento certo.
5. **[contexto] Regra de CPF por canal** — tirar o "NUNCA peça dados pessoais por texto" do prompt
   base (`system-prompt.ts:63,220`) e movê-lo para bloco por canal no `converse` (o `blocoCanal`
   já existe, `converse.ts:557-563`): na web, o card cuida; no WhatsApp, "o CPF chega por
   mensagem e você o encaminha ao sistema, nunca o recuse". Avaliação do FIX-431 feito hoje
   (`tool-falha.ts`): **fica, está certo e os scores são o sinal que faltava — mas é rede, não
   conserto**; complemento necessário: a orientação de tool ausente deve ser sensível ao estado
   (`tool-falha.ts:75-77` — quando `recommendedOffer` existe, a conduta certa é "os resultados já
   estão no seu contexto; apresente-os", não "colete a próxima informação").

### P1 — estrutura (o desenho que impede a reincidência)

6. **[código] Simulação por clique vira nó determinístico** — mesmo padrão do `discovery`:
   handler do clique grava a intenção no estado → nó roda `simulate_quota` + emite o card →
   `converse` só apresenta. Toca `graph.ts`, `interactive-handlers.ts:660-700`,
   `orchestrator/directives.ts:208-224`.
7. **[código] Gancho × card** — o filtro libera o gancho pendente quando um `artifact` é emitido
   no mesmo turno (`sanitizer.ts:1163-1164,1216-1224` + ponto de emissão em
   `converse.ts:1054-1067`): o card É o conteúdo anunciado.
8. **[código] Reconciliar trilho de clique × `nextGate`** — `qualify-state.ts`: marco posterior
   invalida gate opcional anterior (decisão tomada ⇒ `experience`/`timeframe` nunca mais
   disparam). Evidência: traces `aa93010c`/`7255388b` depois de `54149a44`.
9. **[eval/CI] Invariante estático de toolset** — teste que extrai nomes de tool citados em
   `directives.ts` + `system-prompt.ts` e falha se algum não estiver em `WHAT_IF_TOOL_NAMES`.
   Mata a classe inteira do defeito B, incluindo as ~25 menções a `search_groups` no prompt
   (limpeza guiada pelo teste, não à mão).
10. **[contexto] Fala podada é anotada para o modelo** — quando o sanitizer corta a fala
    entregue, o turno seguinte recebe a anotação no contexto (ou a mensagem persistida é a
    editada). Fecha a fenda "prometi algo que ninguém ouviu" (`converse.ts:865-870`).

### P2 — observabilidade e medição

11. **[eval] Scores novos** em `funil-scores.ts`: `fala_podada` (motivos de
    `droppedSegmentReasons()`, `sanitizer.ts:1297`), `escape_revertido` (livelock no flagrante),
    `fala_podada_chars` (entregue − gerado). Todos fatos de servidor; nenhum regex sobre fala.
12. **[eval] Redefinir `turno_mudo`** (`funil-scores.ts:96-102`): fala vazia SEM artifact = mudo
    real (grave); fala vazia COM artifact entregue = `card_sem_fala` (menor, mas monitorado no
    WhatsApp).
13. **[eval] Monitors no Langfuse** para `tool_falhou`, `gate_afundado`, `escape_revertido`,
    `card_sem_fala` (skill `langfuse` §6.1) — o sinal do gate afundado JÁ tinha disparado nesta
    sessão e morreu sem leitor.

---

## 6. O que medir depois (prova de que o conserto funcionou)

- `tool_falha_nome="search_groups"` → **zero** em produção (hoje: 2 sessões/2).
- `gate_afundado="credit"` recorrente na mesma conversa → **zero** (o livelock era o único
  produtor conhecido).
- Funil WhatsApp: % de sessões que atingem `reveal` sem handoff técnico — a S1 inteira teria
  convertido; é a métrica de negócio do defeito A.
- `card_sem_fala` no WhatsApp → tende a zero com P1.7; enquanto existir, aponta o próximo guard
  em atrito.
- Re-rodar as duas transcrições como cenários determinísticos (harness de conversa real): S1 tem
  que terminar em busca disparada; S2 tem que apresentar a simulação COM fala e gates na ordem.

---

*Sondas empíricas deste dossiê (reproduzíveis): `valorAncoradoNoTexto("238", 238000)=false`;
filtro sobre a fala do turno 02:53:45 da S1 devolve byte-idêntico ao entregue em produção com
drop `process-preamble`; filtro sobre os dois segmentos do turno mudo devolve vazio (gancho
segurado + preâmbulo dropado). Rodadas em 2026-08-13 contra a `main` `7e5af2c2` via vitest.*
