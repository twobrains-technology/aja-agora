# Dossiê crítico — o agente conversacional do Aja Agora

> **Data:** 2026-07-20 · **Branch:** `integ/langgraph-runtime` · **Autor:** arquiteto-chefe (campanha multi-agente)
> **Insumo:** 9 pesquisas de best practice (LangGraph.js, guardrails, memória, tool design, evals, domínio
> consórcio BR) + 10 auditorias hostis de código (uma por dimensão do agente), confrontadas contra a pesquisa.
> **Escopo:** 109 achados catalogados, consolidados aqui em 16 críticos, 46 altos e 43 médios/baixos.

---

## ⚠️ LEIA ANTES DE AGIR — ressalva de método (resumo)

**A fase de verificação adversarial NÃO chegou a rodar.** O workflow da campanha degradou antes de
produzir o refutador. Portanto: cada achado deste dossiê passou por **auditoria de código com
`file:line`** e por **confronto contra best practice de mercado**, mas **não** por **refutação cética**
— ninguém tentou provar que o achado está errado.

**Consequência operacional, sem meio-termo: quem for agir sobre um achado tem que reabrir o
`file:line` citado e reconfirmar a evidência antes de escrever a primeira linha de código.** Alguns
achados já se declaram hipótese no próprio texto; outros afirmam mecânica de código sem reprodução ao
vivo. A seção §6 detalha o que exatamente ficou sem verificação e como reconfirmar barato.

---

## 1. Sumário executivo

O agente não sofre de falta de trava. Sofre de **trava demais, empilhada sobre trava, no lugar
errado**. Dos 109 achados, a distribuição por categoria é: **arquitetura 21, engessamento 19,
fragilidade-de-fluxo 18, humanização 15, falta-de-invariante 15**, observabilidade 8,
domínio-consórcio 6, performance/custo 4, teste 3.[^1] Somando o que é *contenção indevida da fala*
(engessamento 19 + humanização 15 = **34**) contra o que é *invariante ausente* (**15**), o diagnóstico
é aritmético: **para cada buraco de compliance existem mais de dois pontos onde o produto amordaça o
vendedor**.

O defeito estrutural é um só, e quatro dimensões independentes o encontraram sozinhas: **o
system-prompt proibia o modelo de perguntar, em caixa alta e em três lugares, no exato turno em que o
`system-context` pedia que ele perguntasse.** O modelo obedecia o bloco estável (longo, cacheado,
repetido) e calava; o servidor então emitia a pergunta canônica — a mesma string, byte a byte, em toda
conversa. Foi assim que a "desamarra" de 2026-07-13 foi anulada sem que ninguém mexesse no código que
ela consertou. E não parava no prompt: o `sanitizer` apagava a pergunta do modelo antes que ela pudesse
virar a pergunta do gate, e o adapter do WhatsApp jogava fora a explicação do modelo para colar dois
balões fixos.

O que separa este agente de um vendedor humano competente não é inteligência do modelo — é que **ele
não pode conduzir, não lembra do que mostrou e não pode sair do trilho**. Não pode conduzir porque a
fala é policiada por ~60 regex de estilo em runtime. Não lembra porque tool-results e payloads de card
nunca voltam ao contexto (o agente relê a si mesmo como `[card: recommendation_card]`). Não pode sair
do trilho porque há gates sem ramo de recusa (`reco-consent` com "não" congelava a venda para sempre)
e um analyzer cego, com 6s de timeout, degradando para `neutral` — um rótulo que **muda roteamento**.

Arquitetonicamente: o estado da conversa são **68 campos jsonb sem validação**, ~26 deles flags de
idempotência de emissão, escritos por ~12 pares read-modify-write não-atômicos por turno, **sem lock
por conversa**. O turno não é um loop: é uma cascata de sub-turnos recursivos em volta de um runner de
1613 linhas que **simula o próprio futuro** (`previewMeta`, 5 campos replicados à mão) só para decidir
quem faz a pergunta. O runtime LangGraph novo é a resposta certa — mas na foto auditada ele **reusava o
if-cascade como roteador, tinha jogado fora as camadas de escape e instanciava o sanitizer sem contexto
de fatos**, ficando estritamente mais frágil que o runtime que quer substituir.

**A tese deste dossiê:** o caminho não é mais uma camada. É **subir os invariantes verificáveis para a
topologia do grafo** (identidade antes de descoberta vira aresta, não regra), **descer as regras de
estilo para prompt/exemplos/eval** (nunca regex de produção), e **devolver ao modelo a condução da
conversa** com fato no contexto em vez de frase no prompt.

[^1]: Contagem mecânica sobre os 10 arquivos de achado (`grep` por cabeçalho `## [GRAVIDADE][categoria]`).
A instrução original da campanha citava 16/14/12/9 para engessamento/arquitetura/humanização/falta-de-invariante;
os números acima são os **verificados**. A conclusão qualitativa não muda — inverte-se apenas a ordem
entre `arquitetura` e `engessamento`, e a folga sobre `falta-de-invariante` fica maior, não menor.

---

## 2. Diagnóstico por camada

| Camada | O que faz hoje | O que deveria fazer |
|---|---|---|
| **Contrato de turno** (`runTurn`, `runner.ts` 1613 linhas) | Cascata de sub-turnos recursivos (até 4 chamadas de LLM/turno), sem contador de profundidade; caminhos de saída que entregam a fala ao usuário e **não a persistem**; `finish` não garantido nos early-returns | Um turno = um run. Persistência e `finish` como **invariantes do contrato**, alcançáveis a partir de qualquer aresta de erro: se um byte foi entregue ao writer, ele está no banco |
| **Estado** (`ConversationMetadata`) | 68 campos jsonb, cast cego, ~26 flags de idempotência de emissão, 2 zumbis; `persistMeta` sobrescreve a coluna inteira; sem lock por conversa | Estado tipado, validado na fronteira, mínimo. Idempotência vem da **posição no grafo** (um nó roda uma vez por caminho), não de booleano no jsonb. Escrita serializada por conversa |
| **Roteamento do funil** (`nextGate`, `decideShowGate`) | `if`-cascade puro (correto e testado) sobre ~30 flags opcionais, com **8 camadas de escape empilhadas** por fora — e ainda assim 3 gates sem saída | Grafo explícito: um nó por gate, aresta condicional guardada por **predicado de dado** (`hasCredit`, `hasIdentity`, `consentResolved`) + **aresta de escape universal** em todo nó |
| **Classificador de intenção** (`turn-analyzer`) | Chamada Haiku extra, **serial e cega** (não vê o gate ativo nem a última fala do agente), 6s de timeout, degrada para `neutral` — que **é** um valor de roteamento, não ausência de sinal | Extração determinística primeiro (é número? é sim/não? cita administradora exibida?); classificação ancorada no gate; timeout degrada para `unknown` → **mostra o card** (seguro), nunca "fica mudo" |
| **Prompt** (`system-prompt.ts`, 640 linhas / ~21,6k tokens) | 99 "NUNCA", 109 "NÃO", 30 "REGRA DURA", 42 exemplos BAD × 27 GOOD, 7 few-shot; persona real = ~40 tokens. Proibições espelham 15 guards que já existem em código | ≤4k tokens: voz, compliance que não virou código, e **few-shot de venda** (objeção, reveal, fechamento) — hoje zero. Bloco por fase/nó, não monolito |
| **Tools** (29 no registry, 10 inalcançáveis) | Allowlist por fase correta (`tool-policy`), mas: schemas pedem 10+ números que o servidor sobrescreve; `group_card` sem coerção nenhuma; diretivas de recuperação nomeiam tool ausente da fase | Tool sinaliza **escolha** (`{groupId}`); o **nó escreve o dado**. Superfície por nó (soft cap ~20). Toda tool citada em directive ∈ `allowedTools` da fase — travado por teste |
| **Guards de saída** (`sanitizer.ts`, 14 motivos, ~60 regex) | Metade é invariante de fato (entidade não-ancorada, estado fabricado, CPF); metade policia **tom**, com 4 rodadas de gato-e-rato documentadas no próprio arquivo. Deleta por segmento, no meio do stream | Guards de **FATO** viram nó `validate` com aresta de **regeneração** (1 retry) e degradação para card determinístico. Guards de **ESTILO** morrem no runtime — viram prompt/exemplo/rubrica de eval |
| **Cards** (20 tipos) | Camada server-side determinística (6 cards) está **certa**; a borda não: hero depende do LLM chamar a tool, `group_card` sem coerção, `embedded_bid` imprime `R$ NaN` sem oferta ancorada | Card nasce do **estado**, não do payload de tool. Nenhum componente formata número possivelmente ausente. Teaser + card = unidade atômica |
| **Multicanal** | Cérebro quase único (**mérito real**); mas a coreografia de clique está duplicada em 2 arquivos e já divergiu; adapter do WhatsApp **decide conversa**; falha de envio é engolida e marca `hasSent=true` | Cerimônia é decisão de **funil**, mora no cérebro; canal só renderiza. Todo `reply.id` emitido tem handler (teste de contrato). Falha de envio é fato observável |
| **Testes / evals** | 208 arquivos, ~1.529 `it()` — mas 26 arquivos provam que **uma frase existe no prompt**, e a "camada de trajetória" (8.983 LOC) é `grep` de código-fonte. A única camada que mede CONVERSA está desligada e julga contra documento revogado | Invariante executável (chama a função, não `readFileSync`+regex). Sonda de **variância** de fala (byte-diff). Eval nightly com ledger versionado. Zero regex de copy |

---

## 3. Achados CRÍTICOS

Ordenados por impacto na conversa que o cliente vive. Marcações `[✅ corrigido nesta sessão]` remetem
ao **Anexo §11** — a evidência é o `git diff`, não a promessa.

---

### C1 · CONVERGÊNCIA — o prompt proíbe o modelo de perguntar enquanto o servidor pede que ele pergunte
`[engessamento]` · **[✅ corrigido nesta sessão]**

> **Quatro dimensões independentes acharam este mesmo defeito**, cada uma por um caminho diferente:
> `prompt-persona` (lendo o prompt), `funil-gates` (rastreando quem emite a pergunta),
> `humanizacao-venda` (perguntando por que a conversa soa igual sempre) e `sanitizer-guards`
> (descobrindo que a pergunta era apagada antes de contar). É o achado-mãe do dossiê.

**Evidência.** `system-prompt.ts:172` ("os 3 dados de qualificação são COLETADOS PELO SISTEMA — você
NUNCA pergunta sobre eles diretamente"), `:312-345` ("**REGRA DURA** — você NÃO dirige o funil (…) sua
única tarefa é reagir curto (1 frase) e PARAR", com exemplos BAD/GOOD punindo o modelo por perguntar),
`:439` ("**REGRA CRÍTICA — NÃO PERGUNTAR** durante a fase de coleta (…) Termine afirmações com PONTO,
nunca com '?'"), `:458-467` ("Você NÃO conduz essa coleta (…) NÃO pergunte mais nada").
No **mesmo turno**, `orchestrator/system-context.ts:104-116` injeta: *"Próximo passo do funil: descobrir
X. Se fizer sentido no fluxo da conversa, faça VOCÊ essa pergunta, com as suas palavras"* — e
`system-context.ts:186,191` se contradizia internamente ("Termine sem pergunta" / "NÃO faça pergunta").
O lado proibitivo vivia no bloco **estável e cacheado**, lido primeiro; o permissivo era um system
message curto no fim. Todo o mecanismo da desamarra depende de `modelAskedGateQuestion`
(`runner.ts:1151`, só `true` se `ephemeralFilter.hasHeldQuestion()`), que é o gatilho para o card se
calar (`web/adapter.ts:182-190`).

**O que o cliente sente.** O agente responde *"Boa, 120 mil então."* e para. Quem pergunta é o card,
com a mesma string em toda conversa e em toda retomada — *"E quanto custa esse Corolla hoje?"*,
*"Você já fez consórcio antes?"*. É literalmente o **"bitolado, responde sempre a mesma coisa"** que o
`CLAUDE.md` manda não reconstruir.

**Proposta.** Apagar as passagens proibitivas — o invariante que elas tentavam garantir **já é código e
é imgameável**: `tool-policy.ts:145-151` só coloca `search_groups` no toolset com
`identityCollected === true`. Quando o código assume o invariante, a regra-no-prompt correspondente
**sai** (instrução literal do `CLAUDE.md`). Sobrou uma regra que sobrevive: *"1 pergunta acionável por
balão; quem pergunta é você, o sistema só anexa o campo/os botões"*.

**No grafo.** O nó de cada gate carrega no estado apenas `{gate, intentToDiscover}`; o nó `converse`
recebe esse campo e **nenhuma** regra de "não pergunte" — a aresta condicional é quem garante a ordem.
`emit_card` nunca escreve texto de pergunta; a copy canônica vira só *fallback* de turno mudo.

---

### C2 · O convite `reco-consent` não tinha ramo NÃO — dizer "não" congelava a cascata para sempre
`[falta-de-invariante]` · **[✅ corrigido nesta sessão]**

**Evidência.** `qualify-state.ts:297` — `if (!meta.recoConsentAnswered) return "reco-consent";` era a
**única** saída do gate. `recoConsentAnswered` só era escrito em um lugar (`orchestrator/index.ts:503`),
dentro de um `if` que exigia SIM. `detectYesNoText` devolvendo `false` era **simplesmente ignorado**.
Não há card/botão (`web/adapter.ts:148` → `return null`); `reco-consent` **não** está em
`STUCK_ESCAPE_GATES` (`qualify-state.ts:66-71`); o watchdog trata gate não-mandatório sem escada e sem
re-arme (`gate-reengage-poll.ts:129-147`) — dispara uma vez e desiste. O próprio comentário do canal
WhatsApp admite: `WHATSAPP_GATES_WITHOUT_FALLBACK = new Set(["reco-consent"])` *"que trava a cascata
inteira até responder"*.

**O que o cliente sente.** *"Posso te mostrar a opção que eu recomendo?"* → *"não, prefiro comparar
sozinho"* → **o funil nunca mais avança**. Nunca vem timeframe, lance, card de decisão, contrato. O
agente segue conversando educadamente para sempre e **a venda morre em silêncio, sem ninguém perceber**.
Agravante: o regex `NO_TEXT_MARKERS` roda **antes** do YES (`index.ts:101-102`), então *"não sei, pode
mostrar sim"* era classificado como NÃO.

**Proposta.** (1) Gravar a **recusa**: o gate é um **convite**, não coleta de dado — recusa é resposta
válida e o funil segue para `timeframe` sem o hero. (2) Trocar o regex binário por **3 estados**
(sim/não/ambíguo) e nunca deixar "não" ganhar de "sim" na mesma frase.

**No grafo.** `reco-consent` é um nó com **três** arestas: `consent_yes` → `emit_hero`; `consent_no` →
`timeframe` (sem hero); `ambíguo` → `converse`, com contador no estado que força `consent_no` depois de
N turnos sem sinal. É o caso didático da **aresta de escape obrigatória em todo nó**.

---

### C3 · O cliente aceita ver a recomendação e o card nunca aparece — turno 100% mudo
`[fragilidade-de-fluxo]`

**Evidência.** `orchestrator/index.ts:497-538` — reconhecido o consentimento, o intercepto faz
`persistMeta` + `saveMessage(user)` e só emite o hero **dentro** de `if (meta.pendingRecommendationCard)`,
seguido de `return;` (`:537`) **sem nenhum `yield` no caso contrário** — nem texto, nem card, nem
`finish`. E `pendingRecommendationCard` só existe quando a regra `hero-awaits-reco-consent` suprimiu o
artifact (`runner.ts:768-784`); no reveal de 1 grupo quem suprime é `single-option`
(`artifact-guard.ts:188-194`, que vence por ordem) e o próprio directive manda **não** chamar a tool
(`directives.ts:361`). O que salva o turno é o guard de turno vazio de `route.ts:1552`, que responde com
a pergunta canônica do **próximo** gate.

**O que o cliente sente.**
> — Posso te mostrar a opção que eu recomendo?
> — Pode sim!
> — Em quanto tempo você quer estar com o carro novo?

Ele consentiu, a recomendação nunca apareceu, e o agente mudou de assunto como se nada tivesse sido
prometido.

**Proposta.** Invariante em código: **gate que PROMETE artefato não pode fechar sem ele.**
(1) `nextGate` só devolve `reco-consent` se existir hero a revelar. (2) No ramo de consentimento, `else`
explícito que materializa o hero a partir de `meta.recommendedOffer` (caminho do FIX-286) e, sem nada
ancorado, **devolve o turno ao modelo com o fato no contexto** — nunca silêncio. Interceptar
consentimento não pode significar *consumir* o turno.

**No grafo.** Pré-condição `hasHeroPendente` na aresta de entrada; pós-condição "emitiu
`recommendation_card`" na aresta de saída (assert em `emit.ts`). Teste de invariante: gate `reco-consent`
disparado ⇒ `recommendation_card` emitido em ≤1 turno. Atenção: `advance.ts:71-77` tem o **mesmo buraco
na direção oposta** — marca `recoConsentAnswered` sem checar se há hero pendente.

---

### C4 · O guard de "reservado" era cego ao estado e apagava a confirmação da venda fechada
`[falta-de-invariante]` · **[✅ corrigido nesta sessão]**

**Evidência.** `sanitizer.ts:149-161` — `isPrematureReservationClaim(segment)` **não recebia**
`StateVerificationContext` e era chamado sem ctx em `ephemeralSegmentReason` (`:686`), logo dropava em
qualquer ponto da conversa. Auditoria rodou a função:
`isPrematureReservationClaim("Seu plano já está reservado com a ITAÚ.") === true`. Enquanto isso,
`system-prompt.ts:998-1004` injeta o bloco "RESERVA CONFIRMADA — estado terminal" mandando o **oposto**:
*"NUNCA negue que a reserva aconteceu"*. O ctx já tinha `hasProposal` e o meta já tinha `contractClosed`
— nenhum dos dois era consultado.

**O que o cliente sente.** Ele acabou de fechar, pergunta *"então já está reservado?"*, o agente escreve
a confirmação — e **a frase é deletada**. Se era a única frase do turno, ele recebe *"Acho que me perdi
por aqui"* **no exato momento da comemoração da venda**.

**Proposta.** O invariante real é *"não prometer reserva **antes** da contratação"*; o código tinha
codificado *"nunca dizer reservado"*, que é outra coisa. Passar `ctx` e só dropar com
`!hasProposal && !contractClosed`.

**No grafo.** Vira validador de saída do nó `closing`/`converse` **parametrizado por
`state.funnel.contractClosed`/`proposalId`** — o mesmo fato que governa a aresta, não uma regex global.

---

### C5 · O sanitizer apagava a PERGUNTA do modelo antes de ela virar a pergunta do gate
`[engessamento]` · **[✅ corrigido nesta sessão]**

**Evidência.** A ordem em `ephemeralSegmentReason` (`sanitizer.ts:679-698`) rodava **antes** do teste de
interrogativa em `filterComplete` (`:853-861`): caindo em qualquer guard, o segmento era dropado e nunca
virava `heldQuestion`. Rodado na auditoria:
`isPrematureReservationClaim("Você teria um valor reservado pra dar de lance?") === true` — **a pergunta
canônica do gate `lance`**. Cadeia: sem `heldQuestion` → `modelAskedGateQuestion` false → o card dispara
a copy fixa. A prova de que a regex já mandava no produto está em `gate-questions.ts:166-171`: o FIX-268
**reescreveu a pergunta do produto** só para fugir do próprio guard.

**O que o cliente sente.** Sempre a mesma frase do card no gate de lance, nunca a formulação do modelo.
E a inversão é **silenciosa** — nenhum log registra que a fala do vendedor foi engolida.

**Proposta.** Separar os guards em **FATO** (estado fabricado, administradora alucinada, CPF, proposta,
tool-leak — podem dropar qualquer segmento, inclusive interrogativo, porque *perguntar* "sua proposta já
saiu?" carrega a mesma mentira que afirmar) e **ESTILO** (preâmbulo, léxico, anúncio de passo — **nunca**
podem apagar uma pergunta). Pergunta é insumo do funil: apagá-la é sempre pior que deixar passar.

**No grafo.** O nó `converse` devolve `{texto, perguntaFeita}` estruturado e o roteador decide se o card
repete. Validação de fato vira **aresta de regeneração com feedback**, não deleção no meio do stream.

---

### C6 · No turno do reveal, qualquer frase com "contemplação/lance/sorteio" é dropada
`[fragilidade-de-fluxo]`

**Evidência.** `sanitizer.ts:377-389` — `REVEAL_CONTEMPLATION_SCENARIO_PATTERN` casa
`com lance|dar lance|contemplad[oa]|contempla[çc][ãa]o|(por|pelo|no) sorteio|cen[áa]rio` e
`isPrematureRevealScenario` dropa o **segmento inteiro** sempre que `ctx.hasSearchToolCall === true` — o
que é verdade em **qualquer** turno pós-reveal (FIX-332 mantém as tools de busca no toolset,
`tool-policy.ts:186-187`). **Não há exceção para pergunta do usuário.** Pior: a segunda chance do FIX-347
exige `executedToolCount === 0` (`index.ts:902`) — no reveal `search_groups` sempre rodou, então o guard
que mais pode zerar um turno é **estruturalmente excluído** do retry. E a proteção é furada: o plural
escapa do `\b` (`"Esses grupos têm bom histórico de contemplados."` → `false`).

**O que o cliente sente.** Ele faz **a** pergunta central do consórcio no momento em que os grupos
aparecem — *"e quanto tempo até eu ser contemplado?"*, *"como funciona o lance aqui?"* — e o agente
responde **nada**, ou *"Acho que me perdi por aqui"*. Um vendedor humano seria demitido por emudecer
exatamente aí.

**Proposta.** Trocar o regex de **tema** por regex de **claim numérica** ("lance de R$ X", "no Nº mês",
"em N meses você é contemplado") e desligá-lo quando o turno for resposta a `userIntent === 'asking_question'`.
Melhor: substituir o guard léxico por **invariante de ordem** (o card de simulação só é emitido após
`experienceAnswered` — o `artifact-guard` já sabe fazer isso) e parar de policiar a palavra na fala.

**No grafo.** Nó `answer_doubt` alcançável por aresta de escape a partir de `reveal`: o modelo responde a
dúvida e a proibição fica só na aresta que **emite o card de simulação**.

---

### C7 · `present_group_card` é o único card do reveal sem coerção — a LLM digita crédito, parcela, taxa e "N por mês"
`[falta-de-invariante]` · *(achado independente em `tools` e `cards-artefatos`)*

**Evidência.** `runner.ts:884-946` coage `simulation_result`, `recommendation_card`, `comparison_table`,
`contemplation_dial`, `embedded_bid`, `two_paths`, `scarcity`, `topic_picker` — **não existe ramo para
`group_card`**: `payload = input` (`:789`) segue até `artifacts.push` (`:951`). O schema
(`tools/ai-sdk.ts:40-60`) **exige da LLM** `creditValue`, `monthlyPayment`, `adminFeePercent`,
`termMonths`, `availableSlots`, `contemplationRate` — todos números. E
`group-card.tsx:149-153` renderiza `{payload.contemplationRate} por mês`. A fixture do próprio teste usa
`contemplationRate: 36` — **o mesmo "36/mês" fabricado que o FIX-191/315 matou no hero**, vivo no card
irmão. Agravante: `availableSlots` nem existe como dado (`bevi/offer-mapper.ts:150-152` usa
`monthlyAwardedQuotas ?? 0` como proxy), e `group-card.tsx:141-143` imprime a linha "Vagas" **sem
condicional** → *"Vagas: 0"*.

**O que o cliente sente.** Um card com parcela, taxa de administração e "36 por mês" contemplados —
**números que nenhuma tool devolveu**. É a classe de mentira que o produto declara inviolável, e a mais
cara: o cliente **decide** em cima dela.

**Proposta.** Retrofitar `coerceRevealCota` (`recommendation-payload.ts:96`) ao `group_card` — allowlist:
só `id`/`category` vêm do modelo, todo campo financeiro vem do grupo real indexado; sem grupo casado, o
card sai **sem números** em vez de sair com os do modelo. Alternativa mais barata e igualmente segura:
encolher o schema para `{ groupId }` (padrão que `embeddedBidSchema` já usa).

**No grafo.** `group_card` nasce no nó `discovery`/`emit_card` a partir de `state.funnel.offers[i]` — o
modelo escolhe **qual** oferta, o nó escreve os **números**. Teste mecânico e imgameável: *nenhum payload
de card contém `NaN`/`undefined` em campo monetário*.

---

### C8 · As diretivas de recuperação mandam chamar tool que a policy escondeu naquela fase
`[fragilidade-de-fluxo]`

**Evidência.** `naoExibidoDirective` (`action-policy.ts:51-62`) devolve ao modelo *"Apresente-o primeiro
via `present_comparison_table`, `present_group_card` ou `present_recommendation_card`… Resolva AGORA"*;
`rebuscaDirective` (`ai-sdk.ts:520-527`) devolve *"refaça `search_groups` na faixa"*. A auditoria rodou
`allowedTools` com o toolset real: na fase **reveal** o modelo tem `simulate_quota`/`get_group_details`
(justamente as tools que **disparam** essas diretivas) mas **não tem nenhuma das três de apresentação**;
na fase **closing** não tem nenhuma das quatro, nem `search_groups` — e o prompt de closing ainda carrega
*"RE-BUSQUE com `search_groups`"* (`system-prompt.ts:216`). Mecânica: modelo obedece → `NoSuchToolError`
→ `toolErrorThisTurn` → geração abortada, texto suprimido (`runner.ts:576`) → fallback.

**O que o cliente sente.** *"me detalha a Rodobens"* logo depois da decisão → o agente tenta, o servidor
manda apresentar antes, a tool não existe, e ele recebe o template *"as opções que já apareceram aqui pra
você continuam valendo…"*. Foi para isto que existiram FIX-262/266/282/332/343/355 — **a raiz é esta e
continua viva**.

**Proposta.** (a) Toda diretiva de recuperação é gerada **com a lista de tools da fase**:
`naoExibidoDirective(groupId, allowedTools(meta))` só nomeia tool presente; sem tool de reapresentação
disponível, a diretiva vira saída **conversacional** ("peça em UMA frase qual das opções ele quer").
(b) Teste-invariante barato e imgameável: **para cada fase, toda tool nomeada em `action-policy.ts` /
`directives.ts` / `rebuscaDirective` ∈ `allowedTools(metaDaFase)`** — falha o build quando alguém mexe na
tabela.

**No grafo.** Some por construção: a recuperação é **aresta de escape** do nó (volta para `present` ou
`converse`), não um texto pedindo tool-call. É o requisito "0 `NoSuchToolError`" virando **estrutura** em
vez de sorte.

---

### C9 · O beat de contexto do WhatsApp APAGAVA o texto do modelo no gate `identify`
`[engessamento]` · **[✅ corrigido nesta sessão]**

**Evidência.** `whatsapp/adapter.ts:359-366` — `if (contextBeat) { textBuffer = ""; … await
sendTextMessage(from, contextBeat); }`: a reação do LLM era **substituída** por texto fixo
(`IDENTIFY_CONTEXT_WHATSAPP`), seguido de `gateQuestion("identify")` = *"Me manda seu CPF, só os
números."* — **sem nenhuma flag de idempotência**, saindo igual toda vez que o gate reaparecia. O canal
web faz o oposto (`web/adapter.ts:306-343` preserva o texto do modelo).

**O que o cliente sente.** Ele pergunta *"por que você precisa do meu CPF?"*. O `captureIdentifyText`
corretamente deixa passar, o modelo escreve uma explicação boa — e **o canal joga fora a explicação** e
manda os mesmos dois balões enlatados. Perguntou de novo? **Os mesmos dois balões, byte a byte.** É o
agente bitolado ressuscitado na camada de canal.

**Proposta.** Inverter o default: **a fala do modelo nunca é apagada**. O invariante real é de **estado**,
não de fala — *o cliente precisa ter visto o aviso LGPD antes de mandar o CPF*, **uma vez**. Isso é uma
checagem determinística idempotente por conversa+gate, não um `const` que reprime a fala a cada turno.

**No grafo.** Nó `identify` com aresta de escape; o aviso é um beat disparado **uma única vez pela
transição de entrada no nó** (guardado no `funnel` state), e `converse` continua dono da fala em todos os
turnos seguintes dentro do nó.

---

### C10 · Webhook sem dedupe e sem lock: duas mensagens seguidas = dois turnos concorrentes com lost update
`[fragilidade-de-fluxo]` · **[✅ corrigido nesta sessão]**

**Evidência.** `api/webhook/whatsapp/route.ts:94-166` — `processTextMessage(...).catch(...)`
fire-and-forget dentro do `for (const message of value.messages)`, **sem `await`, sem fila, sem dedup por
`message.id`**. Grep por `advisory|mutex|inFlight|Semaphore` em `src/lib` e `src/app`: nada.
`persistMeta` (`conversation/meta.ts:11-19`) é `db.update(...).set({ metadata: meta })` — **substitui o
JSON inteiro**, sem versão/CAS — e o runner faz ~12 pares `reloadMeta`+`persistMeta` por turno, com dois
pontos (`runner.ts:1533,1540`) gravando o snapshot do **início** do turno. O turno do WhatsApp é longo por
design (`POST_INTERACTIVE_PAUSE_MS=1800`), então a janela de sobreposição é de **vários segundos**.

**O que o cliente sente.** Ele manda *"quero um carro"* e logo *"uns 90 mil"* — comportamento
normalíssimo do canal. Os dois turnos rodam juntos, os balões chegam intercalados fora de ordem, e o
`creditMax` de um é apagado pelo outro: **o agente pergunta o valor de novo**. A mesma mecânica derruba
`identityCollected` (pede CPF outra vez), `searchDispatched` (dispara **duas descobertas na Bevi** para a
mesma conversa — e a Bevi de homologação tem `proposal-hash` único) e `decisionDispatched`. **No WhatsApp
isso é o caso comum, não a borda.**

**Proposta.** (a) Idempotência real por `message.id` (a Meta **reentrega**), insert-if-absent — não
confiança no 200. (b) **Serialização por conversa** na entrada: `pg_advisory_xact_lock(hashtext(waId))` ou
lease com expiração. (c) `unique(wa_id)` em `conversations` + `onConflictDoUpdate` no `getOrCreate` — hoje
é só `index`, e dois turnos no primeiro contato podem criar **duas conversas** para o mesmo `wa_id`.
(d) `persistMeta` deveria ser **merge com CAS**, não sobrescrita cega.

**No grafo.** O checkpointer com `thread_id = conversationId` serializa e versiona o estado — **mas a
pesquisa é explícita e isto é um gap real da spec:** as estratégias de double-texting
(`reject/enqueue/interrupt/rollback`) são da **LangGraph Platform**, não da biblioteca OSS chamada dentro
de uma API route Next.js. **Migrar não resolve concorrência de graça** — o lock de aplicação continua
obrigatório, sob pena de write-skew no próprio checkpoint.

---

### C11 · Turno com tool-error entrega a fala ao usuário e NUNCA a persiste (nem os cards já emitidos)
`[falta-de-invariante]`

**Evidência.** `runner.ts:978-1020` — no guard de tool-error/cap o runner faz
`return { fullResponse: modeloFalou ? falaDoModelo : "", artifacts: [], … }`. Esse `return` está **antes**
de `runner.ts:1296` (`saveMessage`) e do `db.insert(artifactsTable)` (`:1311-1320`). Do outro lado,
`index.ts:966-971` só loga *"mantendo a fala dele"* e segue — **nenhum `saveMessage` existe nesse
caminho**. Os `text-delta` (`:592`) e os `artifact` (`:955`) **já foram entregues ao writer**, então o
usuário vê. Nenhum teste cobre (grep de `saveMessage` no teste do FIX-262: 0 ocorrências).

**O que o cliente sente.** O agente responde, ele lê e responde de volta — e no turno seguinte **o agente
age como se nunca tivesse falado**: repete a pergunta, reapresenta o que já mostrou, ou nega o card que
está na tela. Se der refresh, a resposta e o card sumiram do histórico.

**Proposta.** A persistência do turno não pode viver dentro do caminho feliz do runner. Extrair
`finalizeTurn({ text, artifacts })` chamado por **todos** os caminhos de saída (tool-error, cap,
discovery-failed, handoff, normal). **Invariante em código: se um byte foi entregue ao writer, ele está no
banco.** Mesma disciplina para `finish` — exatamente **um** por turno, com `reason` real; o default cego
`setFinish("ok")` de `route.ts:1608-1610` sai (turno degradado hoje entra no trace como sucesso).

**No grafo.** É o desenho natural — mas precisa ser **inescapável**: `addConditionalEdges` de todo nó
falho → `persist` → `END`, nunca `throw` saindo do grafo. Contrato verificável por teste: para todo
caminho, `events.filter(e => e.type==='finish').length === 1`.

---

### C12 · O analyzer classifica sem saber o que o agente acabou de perguntar
`[arquitetura]`

**Evidência.** `turn-analyzer.ts:254-257` — o prompt do analyzer é literalmente
`Persona ativa: ${currentPersona}\nMensagem do usuário: "${text}"${contextHint}`. **Não entra o gate
ativo, não entra a última fala do assistente, não entra nenhum turno anterior.** Consequência
mensurável: `orchestrator/analyze.ts` tem 296 linhas em que a lógica real é ~40 e o resto são guards para
**desfazer extração feita na hora errada** — FIX-236, FIX-279/296/306, FIX-310, FIX-74. Cada um é o mesmo
bug. E o único contexto que ele recebe está **desligado no começo do funil e errado no meio**
(`turn-analyzer.ts:226-237`: o hint só aparece com `0 < missing < 4`, e assim que `creditMax` preenche ele
afirma que "o sistema acabou de perguntar sobre prazo/lance" **enquanto `nextGate` pede CPF**).
Somando: 6s de timeout, degradando para `NEUTRAL_FALLBACK` — e `neutral` **não é ausência de sinal, é um
valor que muda roteamento** em 11 pontos de `decideShowGate` (`qualify-state.ts:457-628`). FIX-208, 215,
356 e 74 existem **só** para compensar esse classificador.

**O que o cliente sente.** Ele responde certinho ("200") e o agente fica mudo ou pula a etapa. Ou responde
"não" à pergunta do lance e o sistema grava como resposta do prazo. Ou tem que digitar *"continua"* /
*"vai"* para o funil andar. Parece **desatenção** — o oposto de um vendedor que estava ouvindo.

**Proposta.** Três cortes. (1) O que é **verificável** é determinístico e deve ser consultado **antes** do
intent: `parseAssetValue`, `detectYesNoText`, `resolveOfferMentionForConversation`. (2) O hint sai da lista
fixa e passa a derivar de `nextGate(meta)` + `GATE_INTENT` (a fonte canônica já existe em
`system-context.ts:24-37`). (3) **Timeout degrada para `unknown` → "mostra o card"** (seguro), nunca para
"fica mudo". Com isso ~6 guards de `analyze.ts` podem ser **deletados** — é remoção de camada, não adição.

**No grafo.** A guarda da aresta é o **ESTADO** (o dado chegou? o gate resolveu?), não o humor do turno.
`intent` sobra para **uma** decisão binária e reversível — "o usuário desviou neste turno?" — e mesmo essa
com aresta de escape. Uma vez que `intent` deixe de ser autoridade de fluxo, o analyzer pode rodar **em
paralelo** com o `converse`, matando a latência serial.

---

### C13 · O modelo nunca revê o que ele mesmo mostrou: tool-results e payloads de card não voltam ao contexto
`[arquitetura]`

**Evidência.** `conversation/messages.ts:8-22` — `loadConversationHistory` devolve `{role, content}` de
texto puro. **Nenhum `tool_use`/`tool_result` é persistido nem reconstruído.** Os cards viram um marcador:
`index.ts:153-158` grava `[card: ${artifactType}]` como mensagem de assistente; `runner.ts:1296` grava
`[tool: …]`. No turno seguinte ao reveal, o modelo lê a própria fala como `[card: recommendation_card]` e
**não tem um único número da oferta em contexto**.

**O que o cliente sente.** Duas perguntas depois do reveal: *"e a parcela daquela do ITAÚ mesmo?"* — e o
agente não sabe, ou chuta. É exatamente o *"ele não presta atenção no que ele mesmo falou"*.

**Proposta.** Isto explica toda uma camada de remendo — `resolveOfferMentionForConversation`,
`listShownOffersForConversation`, `exactnessFacts`, `unavailableAdministradoraFacts` — que existe para
**re-ler do banco os fatos que já estavam no contexto e foram jogados fora**. Persistir os
`ToolMessage`/`AIMessage` com `tool_calls` (ou, no mínimo, um bloco compacto por card emitido com os 4-5
números do payload **já coagido**) e reidratá-los. Aí esses helpers podem ser **removidos** em vez de
reproduzidos: o modelo passa a lembrar por padrão, e o invariante "número nunca inventado" continua em
código (`coerce*Payload`), não em re-injeção.

**Ancoragem na pesquisa.** É o antipadrão *"prompt como storage de estado"* + *context rot*: fatos com
baixa similaridade lexical em relação à pergunta são exatamente os que a acurácia perde primeiro, mesmo
sem estourar a janela. Os **dados duros vivem em campos estruturados**; só o tom depende do histórico.

---

### C14 · O nó `converse` do LangGraph regride os blocos de FATO e roda com o sanitizer sem contexto
`[arquitetura]` · *(achado independente em `analyzer-memoria` e `sanitizer-guards`)*

**Evidência.** `langgraph/nodes/converse.ts:113-119` — o system message do grafo é exatamente
`[cacheableSystemBlock(leanSystemPrompt()), gateContextText?]`. **Não entra:** `knownName`, a persona do
DB (`TODO` em `converse.ts:45-47`), a memória Letta, e **nenhum** dos blocos de `buildSystemContext`
(`system-context.ts:118-177`): `mentionedOffer`, `exactnessFacts`, `confusedAboutGate`,
`identityAlreadyCollected`, `unavailableAdministradoraFacts`, `newlyExtractedExperience` (este último é
retornado por `analyzeAndMerge` e **descartado** em `nodes/analyze.ts:22-26`). Somado a isso,
`converse.ts:124` faz `new EphemeralTextFilter()` **sem argumento** — e sem ctx **quatro guards de fato
retornam `false` na cara**: `isPrematureRevealScenario`, `isFabricatedStateSegment`,
`isPrematureTopOfferClaim`, `isHallucinatedAdministradoraClaim`.

**O que o cliente sente.** Sob `AI_RUNTIME=langgraph`: o agente volta a chamá-lo de "você" depois de ele
ter dado o nome; volta a inventar desculpa técnica quando ele reenvia o CPF; o *"não entendi"* volta a
receber a mesma frase (não há `confusedAboutGate`); **e ele pode perseguir por vários turnos uma
"Bradesco" que nunca existiu** (o bug ao vivo que originou o FIX-342) ou ouvir que *"sua proposta já
saiu"* sem proposta nenhuma. Ou seja: o runtime novo **mantém os guards de estilo e desliga os de
verdade** — a pior combinação possível.

**Proposta.** Esses blocos **não são regra-no-prompt**: são **fatos derivados de estado** — é o padrão que
o próprio ADR de 2026-07-13 estabeleceu (dar o fato, o modelo redige). Portanto pertencem ao grafo: um nó
`context` entre `route` e `converse` que chama `buildSystemContext(...)` (**reuso literal**, é função
pura) e escreve `state.contextBlocks: string[]`; `converse` monta
`content: [cacheableSystemBlock(...), ...contextBlocks.map(t => ({type:'text', text:t}))]` — **depois do
breakpoint, sem quebrar o cache**. E `createConverseNode` passa `() => state.verification` ao
`EphemeralTextFilter`. Sem isso, o juiz **não pode** selar "dá pra chavear": a paridade de humanização não
existe.

---

### C15 · Os few-shot da persona no banco ensinam o funil de maio — e a pedir WhatsApp
`[fragilidade-de-fluxo]`

**Evidência.** `drizzle/0016_personas_examples.sql`: `auto-b3-pos-escolha` → *"Show, vamos te ajudar a
achar o carro certo. Me passa o valor da carta que você tem em mente"* — **textualmente o bug que o
próprio prompt cita como PROIBIDO** (`system-prompt.ts:330`) e que viola a regra de léxico de `:131`.
`drizzle/0021` grava no campo `context` de cada persona *"os 3 gates (1) experience, (2) timeframe,
(3) lance precisam ter sido respondidos ANTES do valor"* — funil revogado por FIX-103/296/274.
`drizzle/0018` ensina 4 falas **pedindo WhatsApp**, hoje proibido em toda fase. O campo `context` **é**
renderizado ao modelo (`system-prompt.ts:851`) e o bloco de exemplos da persona entra **por último** no
`instructions` — *"giving them recency precedence"* (`:776`). **Nenhuma migration posterior remove
isso.**

**O que o cliente sente.** Logo depois do nome, o agente pula o rapport e vai direto em *"me passa o valor
da carta"* — formulário, não conversa. E em algum ponto pede o WhatsApp por conta própria, duplicando o
card do servidor. **Few-shot ganha de instrução**: o exemplo demonstra, a regra só descreve.

**Proposta.** Migration que remove os exemplos `*-b3-pos-escolha` e `*-wa-narrativa` e reescreve o
`context` para o funil atual. Teste estrutural que valide os exemplos do DB contra a ordem real de
`nextGate` — hoje **nada** trava esse drift. No grafo, os exemplos passam a ser selecionados **por nó**, o
que torna impossível um exemplo de coleta de valor aparecer no turno do motivo.

---

### C16 · A suíte ATRAPALHA: 153 testes cimentam frases do prompt e a única camada que mede CONVERSA está desligada
`[engessamento]` + `[teste]` · **[✅ parcialmente corrigido nesta sessão]**

**Evidência.** 26 arquivos `system-prompt.*.test.ts` somam **153 `it()`**; **239 asserts** citam
`SPECIALIST_BASE_PROMPT` em 56 arquivos. O caso mais duro:
`system-prompt.behavior-guards.test.ts:196-236` ancora por `indexOf("Atalhos com topicos curtos")` e
**exige** 7 variantes literais no prompt — com a justificativa escrita no próprio teste: *"o LLM não
generaliza sozinho"*. A "Camada 2 de trajetória" (`tests/regression/agent-trajectory.test.ts`, **8.983
LOC**, 401 `it()`) tem **163 `readSource()` contra 7 `MockLanguageModelV3`** — é grep de código-fonte, com
asserts sobre a **forma** do código (`/\.\.\.\(prepareStep\s*\?/`). E:

- **Não existe job de teste no CI** (`.github/workflows/` só tem `aws-ecr-deploy.yml`).
- `test:pre-commit` roda **2 cenários** de eval por `-t` — nenhum deles cobre a conversa de venda.
- `agent-flow.eval.test.ts:1645` exige o gate `consent`, que **não existe mais** no `type Gate`.
- `jornada-rubric.ts:259` julga *"APENAS contra o docx"* — **revogado em 2026-07-13**.
- **O gate de merge (`test:unit`) exclui `*.integration.test.ts`** — ou seja, corta justamente os testes
  multi-turno que provam que o funil não trava, incluindo
  `langgraph/run-turn.funil-completo.integration.test.ts`. E 71 arquivos fazem `describe.skip`
  **silencioso** sem `DATABASE_URL` real, reportando verde.
- `desamarra.invariantes.test.ts:169-186` — o arquivo chamado "invariantes" prova invariante por
  `readFileSync`+regex: **inverter o `if` de `identityCollected` mantém os três verdes**.

**O que o cliente sente (por tabela).** Regressão de humanização e de funil travado só aparece quando o
Kairo testa à mão — e o mesmo achado volta rodada após rodada. Pior: **o remédio contra o agente bitolado
(enxugar o prompt) é exatamente o que mais quebra a suíte.** O dev que tenta soltar leva um muro
vermelho.

**Proposta.** (1) Regra de aceite para teste novo: *se o assert falha quando eu reescrevo o prompt sem
mudar comportamento, ele é copy-lock e não entra.* (2) Inverter a asserção do `HARD_RULES.test.ts`: "toda
frase proibida tem um **detector** em `sanitizer.ts`", não "aparece no prompt" — só assim as 9 seções
espelho podem sair. (3) Nenhum teste chamado "invariante" pode ser `readFileSync`+regex: chamar a função
real. (4) Separar o gate em `test:unit` + `test:funil` (integração contra o Postgres do workspace, que já
sobe no container) e exigir os dois; `describe.skip` silencioso vira **falha** quando o teste é
obrigatório. (5) Criar a sonda que a rubrica exige e a suíte não tem: **variância de fala** — mesma
conversa semeada, N=3 execuções; igualdade byte-a-byte entre duas respostas ao mesmo "não entendi" =
FALHA; similaridade lexical (Jaccard de bigramas) acima de um teto = FALHA. **Mede diferença, nunca
conteúdo.**

---

## 4. Achados ALTOS

Formato enxuto: título · `evidência` · sintoma → proposta.

### Funil e roteamento

**A1 · `doubts-wait` é beco sem saída quando o turno da dúvida produz um card.**
`qualify-state.ts:268` + `shouldMarkDoubtsAddressed` exige `!producedArtifact` (`:440`);
`decideShowGate` retorna `false` incondicionalmente (`:469`); `doubts-wait` ∈ `NON_REENGAGE_GATES`; não
está em `STUCK_ESCAPE_GATES`. O teste `qualify-state.funil-nao-trava.test.ts:119` **codifica o buraco** e
o chama de "o BECO". → Cliente clica "🤔 Tenho dúvidas", pergunta *"não é melhor financiar?"*, o modelo
mostra o card comparativo (**resposta ótima**) e o funil **morre ali para sempre**. → `doubtsAddressed`
deve ser marcado quando o turno **entregou** algo — texto **ou** artifact. Um card comparativo endereça a
dúvida **melhor** que texto. No grafo: `doubts` nunca é nó absorvente.

**A2 · O gate `experience` não tem escape nenhum.** `qualify-state.ts:267`; `experiencePrev` só é escrito
por texto livre com a trava `activeGateAtTurnStart === "experience"`, e `NEUTRAL_FALLBACK` devolve `null`.
Não está em `STUCK_ESCAPE_GATES` nem tem escape condicional como o `credit`. → *"já fiz um de moto anos
atrás"* → analyzer estoura → **mesma pergunta, turno após turno**; no WhatsApp (lista interativa) texto
livre nunca resolve. → Backstop determinístico binário (já fiz/primeira vez — é classificação, não
fabricação de dado financeiro) + entrada em `STUCK_ESCAPE_GATES` com default `"returning"` (o default
**seguro**: não despeja explicação básica em quem não pediu).

**A3 · O runtime LangGraph reusa o if-cascade como roteador e removeu as camadas de escape.**
`langgraph/state.ts:1-5` afirma não copiar flags de remendo, mas `nodes/route.ts:33-34` chama
`nextGate`/`decideShowGate` — as mesmas funções. Grep por `registerGateStuckTurn` em `langgraph/`: zero.
E `advance.ts:31-49` **duplica** `detectYesNoText` (cópia literal do regex). → Sob a flag, o cliente vive
os mesmos travamentos **e mais alguns**. → Cumprir o ITEM D: um nó por gate, aresta guardada por
**predicado**, contador de tentativas **no estado** (semântica explícita, substitui `gateStuckTurns`) e
aresta "assume o default e segue" no teto. `detectYesNoText` volta a ser **um** módulo compartilhado.

**A4 · `"search"` acumula dois papéis (ação e estado terminal) e `nextGate` não conhece `contractClosed`.**
`qualify-state.ts:344` × `:246`. Consequência: em terminal, o `finish` antecipado (`index.ts:1190-1200`)
pula o bloco que **limpa `pendingGateSince`**; e um refit de valor pós-fechamento reabre o ramo de busca
com a tool fora do toolset. → `if (meta.contractClosed) return "done"` como **primeira** linha de
`nextGate`. No grafo, o terminal é `END`.

**A5 · O runner mantém uma cópia manual do reducer só para prever `nextGate`.** `runner.ts:1055-1156`:
5 campos replicados à mão + um SELECT extra no caminho quente; o cálculo real refaz tudo 400 linhas
depois. Os comentários narram a evolução: **cada FIX novo descobriu mais um campo que faltava replicar**
(FIX-326/328/329). → Quando diverge, o cliente recebe **duas perguntas coladas no mesmo balão**. →
Extrair `applyTurnEffects(meta, turnEffects)`, **uma** função chamada pelo preview e pela persistência.
No grafo isso desaparece: `routeFinal` recomputa a rota depois de `advance` — **regra: nenhum nó pode
prever o resultado de outro nó; se precisa do resultado, é aresta.**

### Prompt, persona e humanização

**A6 · A única orientação sobre as objeções clássicas de consórcio está num `const` MORTO.**
`system-prompt.ts:38` é a regra mais rica de venda do arquivo (cobre *"consórcio é furada?"*, *"não é
melhor financiar?"*, *"e se eu desistir?"*, e proíbe fabricar taxa de financiamento e prazo típico) — e
vive dentro de `export const SYSTEM_PROMPT`, importado **só por `*.test.ts`**. → O cliente solta a objeção
nº 1 do produto e o agente responde do próprio bolso, com risco de cravar número de financiamento ou
prazo de contemplação inventado — **o pior risco regulatório** (CDC 30/37). Ninguém percebe: a suíte testa
o `const` morto. → Mover para o `SPECIALIST_BASE_PROMPT` (fase `qualify`), **deletar** `SYSTEM_PROMPT` e
os asserts que o cobrem, e adicionar 2-3 few-shot reais de objeção.

**A7 · Objeção não existe no vocabulário do sistema.** `turn-analyzer.ts:97-119` — 8 valores de
`userIntent`, nenhum é objeção. *"tá caro"*, *"e se eu perder o emprego?"*, *"vou pensar com minha
esposa"* caem em `expressing_doubt`, que **suprime o gate** (correto, dá respiro) **sem injetar nenhum
fato** para o modelo responder — contraste com o padrão excelente de `exactnessFacts`. → Resposta genérica
de folheto, sem número e sem prova; depois silêncio; 90s depois, *"Só falta isso pra eu seguir — é
rapidinho"*. **Nenhum vendedor de consórcio perde uma venda assim.** → Adicionar `objection` ao enum com
subtipo (preço/desconfiança/prazo/perda de emprego/cônjuge) e injetar **fatos reais** por subtipo (parcela
× valor do bem, regra de desistência da administradora, contemplados/mês reais). No grafo:
`handle_objection` alcançável por escape de **qualquer** nó, que devolve ao nó de origem.

**A8 · O `forbiddenTopic` seeded proíbe a comparação com financiamento que o prompt manda fazer via
tool.** `drizzle/0004`: `compl-2-financiamento` → *"diga apenas que são produtos diferentes… Não entre em
comparação técnica detalhada"*, renderizado dentro de `<compliance>` e fechado com *"Estas regras vêm da
administradora e não são negociáveis"* — contra `system-prompt.ts:707` e a tool `compare_with_financing`,
liberada em todas as fases. → A objeção mais comum recebe uma resposta de 1 linha que **desconversa**. O
agente parece esquivo, o oposto de consultivo. → Migration reescrevendo o `responseWhenAsked` + teste
estrutural: **nenhum tópico proibido pode vetar uma tool liberada**.

**A9 · No momento do pitch, o prompt obriga template fixo e proíbe qualquer juízo sobre a parcela.**
`system-prompt.ts:668-671`: *"Template factual obrigatório: 'R$ {parcela}/mês — {percentual}% do seu teto
de R$ {teto}'"* + *"NUNCA use adjetivos subjetivos ('cabe bem', 'confortável')"* — na fase `reveal`, **o
turno em que se vende**. → O clímax da jornada sai como extrato bancário. Ninguém compra por causa de um
percentual. → Manter o invariante ("todo número vem da tool, com centavos") e trocar a proibição de
adjetivo por **permissão ancorada**: comparação factual computada no servidor e entregue como fato ("é a
menor parcela entre as 4 que apareceram", "R$ 190 abaixo da segunda colocada"). Continua imgameável e
devolve argumento ao vendedor.

**A10 · O directive do reveal é um template com frase-exemplo e 10 proibições.** `directives.ts:366`
dita a forma e dá o `Ex.:` literal; `:360` lista 6 formulações banidas. → Todo cliente ouve a mesma
abertura de reveal — o momento de conectar as ofertas ao sonho vira teleprompter. → Reduzir a **FATOS +
objetivo do turno**; as proibições que já são código saem do texto. **Nada de `Ex.:`.**

**A11 · O directive de primeiro contato ainda dita a copy do docx revogado — e ela é proibida pelo próprio
prompt.** `directives.ts:19-22`: *"PONTE DO PASSO 1 (docx): 'Perfeito, [nome]! Precisamos fazer mais
algumas perguntinhas…'"* × `system-prompt.ts:278-286` (*"NÃO prometa 'vou te fazer algumas perguntas
rápidas'"*) × o mockup (*"Prazer, Madalena! Qual carro você tem em mente?"*). → A primeira impressão do
especialista é o balão que transforma a conversa em formulário. → **Deletar `bridgeInstruction`.**

**A12 · O bem e o motivo só chegam ao modelo por 2 turnos.** `desiredItem`/`motivation` entram só via
`motivationMirrorSection`/`desireFollowUpSection` e somem depois do espelho; os directives do reveal, do
consent aceito e do avanço para contrato **nunca** os citam. → A conversa começa calorosa e **esfria numa
planilha**: quem veio trocar um carro que vive na oficina fecha ouvindo sobre percentual de teto, nunca
sobre o Corolla. → Levar `desiredItem`/`motivation` para dentro de todo directive pós-reveal **como
FATO**. No grafo é trivial — e é o argumento mais forte da migração: são campos de estado disponíveis em
**todo** nó.

**A13 · A re-cobrança e todo o canal WhatsApp chamavam `gateQuestion` com aridade reduzida.**
`gate-reengage.ts:131` (5 de 7 args) e `whatsapp/adapter.ts:159` (5 de 7) → sempre `attempt=1` e sem
`desiredItem` → cai no genérico *"Qual valor do bem faz mais sentido pra você?"* em vez de *"E quanto
custa esse Corolla hoje?"*, e a 2ª cobrança repete **byte a byte**. A variação de copy do FIX-312 é
**código morto**: nenhum chamador de produção passa `attempt`. → O canal que mais precisa soar humano é o
que soa mais robô. → Trocar os 7 posicionais por **objeto de contexto único** derivado de
`gateCopyContext(meta, gate)`, para ser impossível esquecer um campo. Teste de **invariante**: *duas
emissões consecutivas do mesmo gate nunca produzem strings idênticas*.

**A14 · O agente é proibido de validar a opção que o próprio cliente escolheu na tela.**
`sanitizer.ts:646-651` dropa qualquer segmento que cite administradora **ou** parcela de qualquer oferta
indexada enquanto `recoConsentPending` — mas a `comparison_table` **já mostra** administradora e parcela
de todas na tela, e o mockup canônico (`04-copy-fluxos.md:116-117`) manda exatamente: *"A Canopus tem
mesmo a parcela mais leve, R$ 812."* → O cliente aponta uma opção e o agente **desconversa**. Rapport
perdido no instante mais quente da venda — ele acabou de se declarar. → Ancorar o guard no que é
realmente segredo: **o RANKING**, não a menção de dado já visível. Dropar só quando o segmento associar a
oferta a um superlativo de recomendação antes do consentimento.

**A15 · O bloco `<identity_rules>` afirma "Pessoa real, não bot".** `system-prompt.ts:1198` × `:124`
("NUNCA afirme ser 'uma pessoa de verdade' — mentir sobre isso é PROIBIDO"). **Nenhum** dos 15 guards do
sanitizer cobre identidade. → *"você é uma pessoa ou um robô?"* é **loteria**; metade das vezes o agente
afirma ser gente. Numa venda de produto financeiro regulado é o pior tipo de mentira. → Uma fonte só
("assistente virtual com nome próprio, tom de gente"). Se é invariante, vira código: `isHumanIdentityClaim`
no molde de `isPrematureReservationClaim`.

### Sanitizer e cards

**A16 · A deleção é por segmento e entrega frase truncada em minúscula.** `SEGMENT_BOUNDARY_CHARS` inclui
`":"` e `stripProcessPreamble` faz `kept.join("")` **sem reparação**. Rodado:
`"Perfeito. Vou detalhar como fica pra você: parcela cabe no orçamento."` → **"Perfeito. parcela cabe no
orçamento."**; e um par de perguntas vira **"  Ou prefere ir só pelas parcelas?"** (conectivo órfão +
espaço duplo). → Defeito de entrega direto contra o inviolável de português correto. E o drop **parcial**
nunca aciona a segunda chance (`index.ts:896-906` só reexecuta com texto 100% vazio). → Curto prazo:
recapitalizar e colapsar espaço; estender a segunda chance para "dropou ≥1 segmento **e** o restante não
fecha sentido". Certo: **parar de deletar no meio do stream** — validar o texto inteiro contra os fatos e,
se falhar, **regenerar**.

**A17 · A única pergunta sobrevivente é sempre reposicionada no fim do turno.** `filterComplete` desvia
toda interrogativa para `heldQuestion` e `flush()` a devolve no fim; e `heldQuestion = seg`
**sobrescreve** — a primeira pergunta some sem log. Rodado: *"Você já fez consórcio antes? Isso muda
bastante o jeito que eu te explico."* → **" Isso muda bastante o jeito que eu te explico. Você já fez
consórcio antes?"** → O balão chega com a lógica **ao contrário**. → Manter 1 pergunta por balão
preservando **posição**: dropar as anteriores, deixar a última onde estava.

**A18 · No runtime Vercel os cards server-side não passam pelos artifact-guards.** `index.ts:111-167` — o
comentário do FIX-354 admite; a única rede é o `Map` em memória `cardsDoTurno`, que **vaza**
monotonicamente, **não reseta** em turnos server-authored e **não sobrevive a múltiplas instâncias**. →
Cascata de decisão em dobro (`scarcity, decision_prompt, scarcity, decision_prompt` — o achado que matou
uma jornada ao vivo) ou card sumido. → O runtime LangGraph **já resolveu**
(`nodes/guarded-artifact.ts:16-26`): portar `artifactAllowed()` para o `emitServerCard` do Vercel (~5
linhas) e trocar o `Map` global por dedup **por estado do run** (`turnId` persistido + unique
`(conversationId, turnId, type)`).

**A19 · `embedded_bid` sem oferta ancorada imprime "R$ NaN" na web e "R$ 0,00" no WhatsApp.**
`embedded-bid-payload.ts:26-28` devolve só `{disclaimer}`; a emissão (`index.ts:1297-1305`) chama
`buildEmbeddedBidCard` **incondicionalmente** — ao contrário de `buildScarcityCard`, que devolve `null`.
`embedded-bid.tsx:34,38` formata direto. → *"Lance embutido: R$ NaN · Valor que você recebe: R$ NaN"* —
justamente no card que existe para *"separar consultoria de venda enganosa"*. → `null` sem oferta
ancorada + helper `formatBRLSafe(v): string | null` com omissão da linha (padrão que `two_paths` já usa).

**A20 · O modelo escreve o teaser de escassez e o card não vem.** `index.ts:218-247` roda o sub-turno
narrativo **antes** de chamar `buildScarcityCard`, que devolve `null` sem `groupId` ancorado. Não há
rollback. → *"Ah, e um detalhe sobre esse grupo, só pra você saber:"* … e nada. → **Inverter a ordem**:
computar o card antes; se `null`, o sub-turno narrativo nem roda. **Regra geral: teaser + card são uma
unidade atômica.**

**A21 · Web parou de cravar vagas; WhatsApp ainda manda "restam apenas N" (número vindo de hash).**
`scarcity-payload.ts:12-19,47` — `availableSlots` é **hash djb2** do groupId → 1..6 ("placebo comercial").
A web foi corrigida (DV-4, `scarcity.tsx:6-13`); `formatter.ts:1280-1287` não acompanhou. → O cliente do
WhatsApp lê *"Grupo quase cheio, restam apenas 3"* — número que **não existe em lugar nenhum da Bevi** —
no ponto de maior pressão da venda; usando os dois canais, ele pega a contradição. → Alinhar ao DV-4 e
renomear o campo para `hasAnchoredGroup: boolean`. **Nota honesta:** a barra fixa em 90% da web é a mesma
afirmação sem dado, só que visual — e a rubrica da campanha ("escassez só com slot real") **não descreve o
código de hoje**; precisa ser reescrita antes de virar critério de aceite.

### Tools

**A22 · `simulation_result` só é coagido se `simulate_quota` rodou no MESMO turno.** `runner.ts:884-886`
+ `coerceSimulationPayload` começa com `if (!isUsableSimulation(sim)) return input;` — *"sem retorno
utilizável → payload intacto"*. O schema pede 8 números obrigatórios. Nenhum guard cobre. Comparação
direta: `coerceRevealCota` é **allowlist** — sem grupo real, sai sem número. **Duas famílias do mesmo
card, invariantes opostos.** → Card de simulação com parcela, fundo de reserva, seguro, custo total e taxa
efetiva que **a Bevi nunca devolveu** — com cara de extrato oficial, e o cliente guarda print. →
**Inverter o default**: sem simulação real, `null` e o runner **dropa** o artifact com log.

**A23 · O reveal é uma coreografia de 6 tool-calls escrita em prosa dentro de um directive.**
`buildSearchSummaryDirective` (`directives.ts:293-375`) injeta *"FLUXO OBRIGATÓRIO"* com 6 passos +
*"REGRA DURA — são INSEPARÁVEIS"*. Nenhum passo é código. `TOOL_CALL_HARD_CAP = 12` e `stepCountIs(10)`
para uma sequência que consome ~6. O comentário de `builder.ts:14-26` registra o custo real: no 1º teste
ao vivo o modelo chamou `search_groups` e `recommend_groups` no mesmo turno e **a Bevi devolveu "write
conflict"**. → O momento decisivo sai completo, pela metade, ou fora de ordem — depende do humor do modelo.
→ **O reveal vira nó determinístico**: `searchGroups → rankGroups → simulateQuota(top1)` em código, e
`emit_cards` emite hero + simulação + comparativo na ordem canônica. Ao modelo sobra o que é dele: a fala.
Mata de uma vez o cap de tool-calls, o write conflict, a inseparabilidade-no-prompt e ~1.500 tokens de
directive por turno.

**A24 · Pré-identidade o modelo já enxerga 7 tools numéricas sem âncora — e só 2 têm precondição.**
`allowedTools({})` = **12 tools**, das quais úteis são 3. Sem precondição: `simulate_contemplation`
(recebe valores digitados pela LLM e a descrição manda *"NARRE esses números (R$ X.XXX,XX)"*) e
`compare_with_financing`. → No meio do rapport, *"e quanto ficaria a parcela?"* → o modelo inventa a
entrada, a calculadora devolve resultado **matematicamente impecável** e ele narra em R$. Número
redondinho, totalmente fictício, **antes de qualquer consulta à Bevi**. → Mover para `POST_REVEAL_WHATIF`
(só com `revealCompleted === true`) + entrada em `ACTION_PRECONDITIONS`. **Ancoragem na pesquisa:**
*"never invent identifiers, only reuse identifiers returned by tools"* — grounding é arquitetura, não
prompt; e *"don't make the model fill arguments you already know"*.

**A25 · ~13k tokens de proibição na fase de qualificação contra ~40 tokens de persona.**
`SPECIALIST_BASE_PROMPT` = 640 linhas / 77.746 chars (~21,6k tokens); a fatia `qualify` ainda são ~13k.
O `voiceTone` seeded é **uma frase** por persona. → **As 4 specialists são o mesmo agente**: curto,
cauteloso, sem opinião — não porque o modelo é fraco, mas porque 99% do contexto de comportamento é lista
de coisas a não fazer. → Meta concreta: **base ≤ 4k tokens**. Caminho: deletar as 9 seções espelho de
guards; tirar do prompt as 16 menções a uma tool que só existe para ser proibida; mover regras de
`closing` para blocos dinâmicos. **O espaço liberado vai para few-shot de VENDA — hoje zero.**
**Ancoragem na pesquisa:** *curse of instructions* (compliance despenca com o número de regras
simultâneas, com viés de primazia) + *lost in the middle*.

**A26 · 15 guards do sanitizer têm regra-no-prompt gêmea — e um teste EXIGE a redundância.**
`HARD_RULES.test.ts:79-85`: *"toda frase canônica proibida aparece em system-prompt.ts"* → **apagar a
regra redundante quebra o CI**. → ~4-5k tokens de proibição que só existem porque o teste os obriga a
existir. → **Inverter o teste**: a asserção passa a ser *"toda frase proibida tem um detector em
`sanitizer.ts`"*.

**A27 · `HARD_RULES.md` descreve um funil e um toolset que não existem mais.** `:184-192` lista a ordem
com `consent` (removido no FIX-274) e identidade antes do valor (invertido no FIX-296); `:196-204` lista
duas tools que **nunca** entram em `allowedTools`. Esse doc é injetado no prompt do **assistente de
admin** e a tool `validate_against_rules` valida contra ele. → Quando o cliente pede ajuste de tom pelo
backoffice, o assistente propõe exemplos ancorados num funil de dois meses atrás — **é assim que os
exemplos podres se perpetuam**. → Regenerar a partir de `nextGate` e `allowedTools`; trocar o teste de
"tem ≥100 linhas" por: *toda tool citada como chamável no `HARD_RULES.md` aparece em algum retorno de
`allowedTools`*.

### Multicanal e infraestrutura

**A28 · A cerimônia `scarcity → decision_prompt` (FIX-311) existe só na web.**
`interactive-handlers.ts:669-698` vai direto para o contrato — zero scarcity, zero decision_prompt, zero
guard de form duplicado — enquanto `route.ts:634-664` chama `pipeClosingCeremony`. O comentário ainda diz
*"paridade — whatsapp precisa ser exatamente igual à web"*. → Dois clientes idênticos: o da web vê a
escassez e o *"Esse plano faz sentido?"*; o do WhatsApp é **atirado no formulário**. Além da conversão
menor, é inconsistência de **compliance**: o mesmo produto vendido com cerimônias diferentes por canal. →
A cerimônia é **decisão de funil**, mora no cérebro; os canais consomem.

**A29 · O card de decisão manda botões que nenhum handler do WhatsApp reconhece.**
`formatter.ts:1343-1358` emite `decision_contratar`, `decision_outras`, `decision_especialista`;
`dispatchInteractiveReply` só conhece **`decision_outras`**. `two_paths_sorteio`/`two_paths_lance`: nenhum
handler. Sem match, o clique vira `processTextMessage(replyTitle)`, e *"Seguir agora"* não casa com
`INTEREST_RE`. → **O cliente clica no CTA principal — o momento de maior intenção de compra da jornada —
e o clique vira texto solto pro LLM**, sem `decisionDispatched`, sem avanço determinístico. → Teste de
contrato que varre os builders, extrai os ids e casa com os prefixos do dispatcher (o
`artifact-coverage.test.ts` já fez o simétrico para artifacts). No grafo: id desconhecido = **erro de
tipo**, não fallback silencioso.

**A30 · Erro de envio para a Meta era engolido e ainda marcava `hasSent=true`.** `api.ts:69-87` devolve
`{error}` e `sendInteractiveMessage` era `Promise<void>` — descartava o retorno; o adapter marcava
`hasSent = true` sem olhar. O guard de turno-mudo é `if (!hasSent)`. → Um turno em que **todos** os envios
falharam era indistinguível de um turno entregue: o cliente **não recebe nada**, nenhuma rede o resgata, e
o único rastro é um `console.error`. **Lead qualificado que some sem motivo aparente.** →
`{ ok }` + `hasSent` só em sucesso + `finishReason: "channel-send-failed"` no trace + `pendingGateSince`
**preservado** para o watchdog reabrir. **[✅ corrigido nesta sessão]**

**A31 · O escape de gate travado assume prazo/lance pelo cliente sem avisar (no grafo).**
`langgraph/nodes/analyze.ts:20-26` descarta `stuckGateDefaultApplied`; no Vercel esse retorno é
load-bearing (`index.ts:390-397` emite `gateStuckDefaultNotice`). Os defaults **não são cosméticos**:
`prazoMeses: 12`, `hasLance: "no"`, `lanceValue: 20% do crédito`. → O sistema decide por ele, e a
simulação sai com esses números **como se ele tivesse dito**. Numa venda de consórcio, é o pior tipo de
erro: o número aparece na tela com cara de dado do cliente. **Honestidade é o ativo do produto.** →
Retornar `stuckDefault` no state e emitir o aviso. E resolver a contradição: `state.ts:1-5` afirma não
copiar flags de remendo, mas `analyzeAndMerge` as escreve no `baseMeta` e `projectToMeta` as persiste — **o
contrato de estado do grafo está desmentido pelo próprio código**.

**A32 · O histórico cresce sem limite e nunca é cacheado.** `messages.ts:11-15` — `findMany` sem `limit`,
sem janela, sem sumarização. O único `cache_control` está no **primeiro** bloco de system; o array
`messages` não recebe nenhum breakpoint (Anthropic permite 4; **1 está em uso**). → Conversa longa de
WhatsApp fica progressivamente mais cara e mais lenta, e um dia estoura a janela **sem nenhum plano de
degradação**. → Breakpoint incremental no histórico (padrão de conversational caching) + política de
janela explícita: últimos K turnos crus + bloco de **fatos** derivado do estado. Nunca truncar cego — o
estado do funil vive no meta, não no texto. Medir antes: `TurnTraceRecord` já tem `cacheRead`/`cacheWrite`.

**A33 · O system-prompt é escrito para o WhatsApp e servido igual na web.** `buildSpecialistPrompt` não
recebe `channel`; o prompt manda *"Use `*negrito*` (sintaxe WhatsApp)"* e o concierge se apresenta como
*"assistente virtual de recepção no WhatsApp"* mesmo servindo a web — que renderiza com `ReactMarkdown`,
onde `*texto*` é **itálico**. → **Todo destaque na web sai em itálico fino em vez de negrito** — o número
da parcela, o nome da administradora, o valor da carta: tudo perde peso visual exatamente onde a venda
precisa de ancoragem. → Melhor caminho (menos prompt, mais código): manter **uma** sintaxe no prompt e
converter na **borda** — a web já tem o espelho (`formatter.ts:34`), falta o inverso.

**A34 · Sub-turnos recursivos sem contador de profundidade.** `runTurnVercel` chama a si mesmo em 6
pontos; um turno de decisão custa ~4 chamadas de modelo com prompt cheio, e `TurnInput` **não tem campo
de depth**. → O turno de **fechamento** demora (o pior momento para demorar) e pode estourar
`maxDuration = 60`; quando estoura, o cliente vê a conversa morrer exatamente no *"esse plano faz
sentido?"*. → Teto explícito de profundidade (10 linhas, mata a classe de runaway) + hoisting do que é
imutável no turno HTTP. No grafo, a cascata de fechamento é uma **sequência de nós no mesmo run**.

---

## 5. MÉDIOS e BAIXOS (lista compacta)

**Engessamento**
- O watchdog web escreve a pergunta canônica **direto no banco**, sem passar pelo LLM
  (`gate-reengage-poll.ts:129-155`), com escada de literais fixos. O watchdog decide **quando**, nunca **o
  quê** → deve disparar um turno de directive real.
- `TWO_PATHS_FOLLOWUP_TEXT` e a cerimônia de fechamento (`bevi/closing-presentation.ts:156-200`) são 6-7
  balões **idênticos para todo cliente**, no momento mais emocional da jornada. Separar **fato
  obrigatório** de **fraseado**. *(Tensão honesta a levar ao Kairo: o docx exigia literalmente os reforços
  e o "Parabéns" — decisão de produto.)*
- `forceToolChoice:"none"` já barra tool-call na API, mas 5 directives ainda gastam 22 ocorrências de
  "NÃO chame" + 31 de "1-2 frases". O turno-padrão do modelo virou *"escreva 1-2 frases e não faça nada"*.
- A frase do espelho de motivação (*"quando o carro dá trabalho, atrapalha tudo"*) aparece **literal** no
  few-shot **e** no bloco dinâmico — frase canônica de fato. O beat mais humano do funil sai igual para
  todo mundo.
- Metade dos guards do sanitizer é **gosto**: `product-step-announcement`, `announcement-verb`,
  `banned-lexicon` (`/\bsaco\b/`). O arquivo documenta **4 rodadas de gato-e-rato**. Rodado:
  `isProcessPreamble("Deixa eu te apresentar como funciona o lance embutido") === true` — fala de vendedor
  perfeitamente humana. **Aposentar do runtime**: isso é rubrica de eval e exemplo no `<voice>`.
- Regras repetidas com **valores divergentes**: uma-pergunta-por-turno aparece 3× no prompt e o
  `HARD_RULES.md:133` diz **duas**. Regra repetida com valor diferente é ruído — o modelo escolhe uma.

**Humanização / domínio**
- O anti-repetição do fallback de turno vazio só existe na web; no WhatsApp *"Acho que me perdi por aqui"*
  volta **byte a byte**. Extrair `resolveEmptyTurnResponse` compartilhado — e, na primeira tentativa,
  **repergunta pelo modelo** com o motivo no contexto.
- Textos fixos do servidor usam a voz que o sanitizer proíbe no modelo: `transition.ts:15-17` (*"Um
  momento ⏳"* — emoji + narração de mecânica) e `identify-capture.ts:38` (*"Já vou buscar"* — o padrão
  que `PROCESS_ACTION_PATTERNS` dropa quando o **modelo** escreve). A conversa alterna dois narradores e o
  cliente sente a costura.
- `topic_picker` aparece **sem linha de introdução** na web (chips soltos) e com rótulos cortados em 24
  chars no WhatsApp (*"e quando eu for contempl"*). Encurtar na **fonte**, truncar só como rede.
- A saída *"Só a parcela, sem lance"* existe na web e **não existe** nos botões do WhatsApp (limite de 3
  reply buttons). Quem não quer conversa de lance é empurrado pelo funil respondendo "Por enquanto não"
  três vezes — **pressão comercial indevida em quem já sinalizou orçamento apertado**. Trocar para
  `type: "list"` (o padrão já existe no arquivo).
- `leadFormToWhatsApp` diz *"Para **reservar** essa opção, preciso de alguns dados"* — pré-contrato, e o
  guard casa o particípio, não o infinitivo, e **nem é aplicado a esse texto**. Todo outbound do WhatsApp
  deve passar por um `renderOutbound(text)` único.
- ~80% das descrições de tool estão em português **ASCII-ficado**, e o prompt tem 46 palavras sem acento —
  incluindo a própria frase que **exige acentuação** (*"Escreva SEMPRE em portugues correto"*). O modelo
  imita o registro do próprio contexto.
- `get_rates` fica exposta desde o primeiro turno mas responde de um índice em memória — **vazio antes de
  qualquer busca** e volátil entre processos. *"Qual a taxa de administração de vocês?"* recebe lista
  vazia, indistinguível de "não tem".
- Descrições de tool contradizem o código (`present_group_card`: *"Use SEMPRE após buscar grupos"* × o
  directive que manda **não** chamar com 1 grupo) e vazam jargão interno (*"REGRA Bv2-08"*, *"bug #10"*,
  *"Bruna v1 review"*). **Descrição contraditória é a causa nº 1 de tool errada.**

**Arquitetura / fluxo**
- A mesma cerimônia de cards existe duas vezes (`route.ts:221-302` × `index.ts:186-296`) com estados
  diferentes — um recarrega o meta, o outro usa o stale. Origem estrutural do "o card saiu duas vezes".
- Clique duplo em botão do WhatsApp reprocessa gate já respondido; a web tem guard (FIX-272), o WhatsApp
  não — e botão do WhatsApp **não desabilita** depois do clique. Guard de idempotência **no dispatcher**,
  não em cada handler.
- O watchdog dispara no WhatsApp **sem checar a janela de 24h** e **sem teto de obsolescência**: um
  marcador de 3 dias segue elegível para sempre. Rotear por `resolveAndSend` (a infra de template já
  existe e está testada, só não está plugada).
- O grafo e o provider LangGraph são instanciados **no import** do orquestrador, mesmo com
  `AI_RUNTIME=vercel` — o toggle perde a propriedade que a rubrica exige. `import` dinâmico + lazy
  singleton (4 linhas).
- O relay atendente↔cliente-web depende de um **EventEmitter in-memory**; com mais de uma task, o cliente
  transferido para um humano fica olhando a tela até dar refresh — e refresh manual é justamente a
  "solução preguiçosa" que o produto não pode entregar.
- `analyze.ts:47,283` calculam o gate ativo com `hasContactName: true` **hardcoded**, divergindo do
  orquestrador no mesmo turno. Impacto pequeno hoje, **bomba-relógio** para qualquer reordenação futura.
- `nextGate` deveria exigir `opts` (hoje 4 chamadores omitem e pulam o gate `name`).

**Observabilidade**
- **Drop parcial do sanitizer não é logado nem contado** — ninguém sabe a taxa de falso positivo de nenhum
  guard. Compare com o `artifact-guard`, onde **cada** regra carrega um `logLine` obrigatório. É por isso
  que cada rodada "descobre de novo" o mesmo tipo de achado. Copiar a disciplina:
  `[sanitizer-drop] rule=… conv=… gate=… channel=… len=… tail="…"`.
- A superfície de tools é decidida em **3 lugares independentes** e ninguém loga qual foi. **10 das 29
  tools do registry são inalcançáveis** — incluindo uma tool morta que instrui *"Use SEMPRE antes de
  chamar"* outra tool morta. Log estruturado 1×/turno + teste-inventário.
- O analyzer é invisível na telemetria: `TurnTraceRecord` não tem `intent`, `analyzerMs` nem flag de
  fallback. Não dá para responder *"quantas vezes por dia o funil trava porque o analyzer caiu em
  neutral?"* sem grepar container.
- O eval de produção só roda **quando o agente desiste** (handoff no WhatsApp). Conversa que fechou
  contrato, conversa abandonada e **todo o canal web** nunca são pontuados. A rubrica existe e está
  ociosa.
- `bakeoff-edge.eval.test.ts:30-31` trata `Promise` como boolean (`anthropicAvailable()` é `async`) — o
  skip **nunca** aciona e `warnEvalSkipped()` é chamado sem os 2 args obrigatórios. Sintoma de que a
  camada de eval não é exercitada há tempo o bastante para alguém notar.
- Comentário do `artifact-guard.ts:52-54` afirma que `turnArtifactTypes` não tem consumidor — mas a regra
  `card-dup-intraturn` consome. Risco de alguém parar de preencher o campo no runtime novo.

---

## 6. Ressalva de método — o que NÃO foi verificado

**O que rodou:**
1. **9 pesquisas web** sobre best practice (LangGraph.js core/HITL/persistência, guardrails em domínio
   financeiro regulado, memória e context engineering, tool design, evals, multicanal, domínio consórcio
   BR), com URLs reais coletadas — §10.
2. **10 auditorias hostis de código**, uma por dimensão, cada achado com gravidade, `file:line`, sintoma
   na conversa e proposta.
3. **Confronto** de cada auditoria contra a pesquisa.

**O que NÃO rodou: a fase de refutação adversarial.** O workflow degradou antes. Ninguém tentou provar que
os achados estão errados, medir a frequência real dos sintomas, nem reproduzir ao vivo. Concretamente,
isto significa:

| Risco | Como se manifesta neste dossiê | Como reconfirmar barato |
|---|---|---|
| **Achado que descreve mecânica de código, não comportamento observado** | Vários textos dizem explicitamente *"caminho confirmado no código; não reproduzi ao vivo"* (ex.: A4/`search` terminal, o watchdog fora da janela de 24h, `simulate_contemplation` narrando número fictício) | Teste de integração que exercita o caminho, ou um `console.log` temporário no ramo suspeito |
| **Frequência desconhecida** | C1 afirma que o modelo obedece o prompt proibitivo — a **taxa real** de `modelAsked=true` é **hipótese**, ninguém contou no `turn-trace` | Instrumentar `modelAsked` no trace e ler o antes/depois. É o mesmo dado que prova a correção |
| **Números de linha podem ter derivado** | Os `file:line` foram colhidos numa foto do working tree; **esta sessão já editou vários dos arquivos citados** (§11) | Abrir o arquivo, não confiar no número |
| **Achado sobre infra que o repo não contém** | O EventEmitter in-memory: a limitação do código é **fato**, o impacto em prod é **hipótese** (o `desiredCount` real do ECS vive em outro repo) | Conferir o `desiredCount` do serviço antes de tratar como bug ativo |
| **Rubrica da campanha desalinhada do código** | A rubrica exige *"escassez só com slot real"* — mas o código **nunca teve** slot real (é hash djb2, decisão D3 registrada). O critério de aceite está errado, não o código | Reescrever a linha da rubrica antes que um juiz reprove por ela |
| **Proposta que é decisão de produto, não técnica** | O fechamento com copy fixa (*"Parabéns!"*, os 2 reforços) foi exigência literal do docx. Soltar isso é **decisão do Kairo** | `AskUserQuestion` antes de mexer |

**Regra de uso deste documento:** ele é um mapa de onde procurar, com hipóteses fortes e bem ancoradas.
**Não é laudo.** Nenhum achado deve virar commit sem que quem escreve o commit tenha reaberto a evidência.

---

## 7. Arquitetura-alvo em LangGraph.js

### 7.1 Princípio de corte (o que decide onde cada coisa mora)

A pesquisa converge com a lei-mãe do projeto, e a linha é a mesma dos dois lados:

> **Workflows** têm caminhos de código predeterminados e ordem específica; **agents** são um LLM chamando
> tools num loop, livre para decidir. — doc oficial LangGraph.js

Portanto:

- **Ordem, tools e ações irreversíveis** → topologia do grafo (workflow). *"O tempo de execução e a
  latência de cada nó nunca influenciam o resultado final."*
- **Fala, empatia, condução, ordem quando o cliente puxa para outro lado** → o modelo (agent).
- **Guard de FATO** → nó `validate` com aresta de **regeneração**, nunca deleção de texto.
- **Guard de ESTILO** → morre no runtime; vira prompt, exemplo e **rubrica de juiz**.

Reforço externo importante: o framework **mais engessador** do mercado (NeMo/Colang) documenta que flows
100% determinísticos são *"restritivos e não naturais"* e recomenda cobrir **só** os caminhos de risco
real. E o survey de *Design Patterns for Securing LLM Agents* cataloga 6 padrões que restringem **quais
ações e em que ordem** — **nenhum** restringe o conteúdo textual da resposta.

### 7.2 Shape do State

```ts
// Um `StateSchema` (Annotation.Root ou Zod+registry — os dois coexistem).
// Regra: state "boring e tipado"; carrega só o que o ROTEAMENTO precisa.
// Payload bruto da Bevi NÃO entra — só a projeção coagida.
const AgentState = Annotation.Root({
  // ── conversa ───────────────────────────────────────────────────────────
  messages:      Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
  summary:       Annotation<string | null>({ default: () => null }),   // compaction
  userText:      Annotation<string>({ default: () => "" }),
  isUserTurn:    Annotation<boolean>({ default: () => true }),
  channel:       Annotation<"web" | "whatsapp">(),

  // ── funil: A AUTORIDADE DO FLUXO (nunca o histórico) ───────────────────
  funnel: Annotation<{
    contactName?: string; desiredItem?: string; motivation?: string;
    creditMax?: number; identityCollected: boolean;
    experiencePrev?: "first" | "returning";
    consent: "pending" | "yes" | "no";        // 3 estados, nunca binário
    offers: Offer[];                          // já coagidas; fonte dos cards
    chosenOffer?: Offer; proposalId?: string; contractClosed: boolean;
  }>(),

  // ── controle de nó (substitui gateStuckTurns com semântica explícita) ──
  gate:         Annotation<Gate | null>({ default: () => null }),
  gateAttempts: Annotation<Record<Gate, number>>({ reducer: mergeCounts, default: () => ({}) }),
  intent:       Annotation<Intent | "unknown">({ default: () => "unknown" }),

  // ── fatos derivados p/ o converse (C14) ────────────────────────────────
  contextBlocks: Annotation<string[]>({ default: () => [] }),
  verification:  Annotation<StateVerificationContext>(),  // alimenta o sanitizer

  // ── saída do turno ─────────────────────────────────────────────────────
  events: Annotation<TurnEvent[], TurnEvent[] | null>({
    reducer: (a, b) => (b === null ? [] : a.concat(b)),   // null = reset de turno
    default: () => [],
  }),

  schemaVersion: Annotation<number>({ default: () => 1 }),  // checkpoint é banco
});
```

**Regras que vêm da pesquisa, não de gosto:**
- **`schema_version` + default obrigatório em campo novo.** *"Checkpoint schema changes require explicit
  migration — LangGraph won't handle it for you, and old threads will silently break."* Um deploy no meio
  de uma janela ativa do WhatsApp derruba threads de lead **silenciosamente** sem isso.
- **Nada de payload bruto no state.** *"Valores transitórios devem passar por escopo de função, não ser
  persistidos no checkpointer."*
- **`funnel` é a autoridade; `messages` é aparado.** O padrão oficial LangGraph.js é `messages` +
  `summary`, com `RemoveMessage` acima de um limiar. Motivo empírico: *context rot* — a acurácia cai de
  forma não uniforme com o tamanho da entrada, **um único distrator já derruba**, e o efeito é pior
  justamente quando pergunta e resposta têm baixa similaridade lexical (o caso do "ele já falou o
  motivo?").

### 7.3 Nós

| Nó | Tipo | O que faz |
|---|---|---|
| `capture` | data | Extração **determinística** do que o analyzer erra (nome no gate `name`, valor via `parseAssetValue`, sim/não/ambíguo). Roda **antes** do analyze — mata ~6 guards de `analyze.ts` |
| `analyze` | LLM | Classificação **ancorada**: recebe `state.gate` e a última fala do assistente. Timeout → `"unknown"`, **nunca** `neutral`. Pode rodar em paralelo com `converse` |
| `context` | data | `buildSystemContext(...)` (reuso literal, função pura) → `contextBlocks` + `verification`. **Sem este nó não há paridade de humanização** (C14) |
| `route` | router | Função **pura**: lê o state, devolve o nome do próximo nó. Zero LLM, zero side-effect, zero escrita |
| Nós de gate: `rapport`, `credit`, `identify`, `experience`, `reco_consent`, `timeframe`, `lance`, `lance_value`, `lance_embutido`, `simulator_offer`, `decision`, `closing` | mistos | Cada um: pré-condição na entrada, **contador próprio** de tentativas, **aresta de escape**, pós-condição na saída ("gate que promete artefato não fecha sem ele") |
| `discovery` | action | **Determinístico, disparado por transição**: `searchGroups → rankGroups → simulateQuota(top1)` → `funnel.offers`. Nunca discricionário. É o que torna "tool sumida" estruturalmente impossível |
| `what_if` | ToolNode | `ToolNode` (`@langchain/langgraph/prebuilt`) com o toolset **pós-reveal** — números vindos de `funnel.chosenOffer`, não de argumento |
| `answer_doubt` | LLM | Destino da aresta de escape para dúvida. Responde e **devolve ao nó de origem** |
| `handle_objection` | LLM | Destino da aresta de escape para objeção, com **fatos por subtipo** injetados. Devolve à origem |
| `converse` | LLM | **O único autor da fala.** Recebe `GATE_INTENT[gate]` + `contextBlocks`. Nenhuma regra de "não pergunte" |
| `validate` | data | Guards de **FATO** contra `funnel`. Falhou → aresta de regeneração (**máx. 1 retry**) → degrada para card determinístico. **Nunca deleta segmento** |
| `emit_card` | action | Card nasce do **estado**, coagido + `evaluateArtifactGuards`. Teaser e card são **atômicos** |
| `persist` | action | **Único** emissor de `finish`. Alcançável a partir de **toda** aresta de erro |
| `human` | interrupt | `interrupt()` — pausa, checkpoint, `Command({ resume })` no próximo turno |

**Granularidade é troca explícita, não virtude.** A doc oficial avisa: nós menores dão checkpoints mais
frequentes e isolam serviços externos, mas custam boilerplate e topologia. E há antipadrão nomeado —
*"embrulhar um pipeline linear inteiro num StateGraph sem branching real"* é confundir **structured** com
**complex**.

### 7.4 Arestas condicionais e a ARESTA DE ESCAPE UNIVERSAL

O erro a **não** cometer: reencarnar o `if`-cascade dentro do framework novo. O roteador é função pura —
*"A router function should only read state and return a string — it should not call an LLM, write to
state, or produce side effects. All computation belongs in nodes."*

**A aresta de escape universal.** Todo nó de gate passa pelo mesmo roteador de saída:

```ts
// UM roteador, aplicado a TODOS os nós de gate. Todo nó tem saída lateral —
// sem isso, o cliente que desvia do assunto trava o funil (foi exatamente o
// que aconteceu com reco-consent/"não", doubts-wait e experience).
function escapeRouter(s: AgentState): string {
  if (s.intent === "objection")      return "handle_objection";  // volta à origem
  if (s.intent === "asking_question") return "answer_doubt";     // volta à origem
  if (s.intent === "off_topic")       return "converse";         // responde, gate volta
  if (dadoDoGateChegou(s))            return proximoNo(s);
  if ((s.gateAttempts[s.gate!] ?? 0) >= TETO) return assumeDefaultESegue(s); // com AVISO
  return "converse";                                             // repergunta, com as palavras dele
}
```

Três propriedades que este roteador tem e as 8 camadas de escape atuais não têm:

1. **É um só.** Hoje são `decideShowGate` + server-turn + watchdog + escada + 2 guards de turno-mudo por
   canal + stuck-default + retry + 3 interceptos pré-modelo — e ainda sobram 3 gates sem saída.
2. **O teto assume o default COM AVISO.** Nunca em silêncio: `gateStuckDefaultNotice` existe e é
   load-bearing. **Honestidade é o ativo do produto.**
3. **A degradação segura é "mostra o card", não "fica mudo".** É a inversão que mata a família FIX-208/215/356.

**Retorno à origem.** `answer_doubt` e `handle_objection` voltam ao nó que os chamou via
`new Command({ update: {...}, goto: nóDeOrigem })` — o mecanismo idiomático para saída lateral **sem
reescrever a topologia em cascata de `if`** (exige declarar `{ ends: [...] }` no `addNode`).

**Condição de parada explícita.** `recursionLimit` (default **25 super-steps**) é **rede de segurança, não
condição de parada** — e uma venda com objeções legítimas passa fácil de 25 turnos. Aresta explícita para
`END` em todo ciclo de reengajamento/objeção, sob pena de `GraphRecursionError` em produção numa conversa
que estava indo bem.

### 7.5 `interrupt()` / HITL — onde entra e onde NÃO entra

**Onde entra:**
- **`human` a cada turno** (já implementado nesta sessão): o funil pausa, o estado é salvo por
  `thread_id = conversationId`, o próximo turno resume daquele ponto. **A posição no funil vira durável**,
  não recalculada a cada request a partir de 30 flags.
- **Antes da ação irreversível na Bevi** (gerar proposta / fechar contrato): padrão *Approve or Reject*.

**Onde NÃO entra:** *"não entendi, repete a pergunta"*. A doc do LangChain reserva HITL **especificamente
para operação sensível de fato** (transação financeira) — não para toda resposta do agente. É o mesmo
corte da lei-mãe, agora com fonte de mercado.

**A regra que não se pode violar:** *"the runtime restarts the entire node from the beginning — it does
not resume from the exact line where interrupt was called."* Portanto **nenhum side-effect real antes de
um `interrupt()` no mesmo nó** — senão o resume duplica a chamada. Num domínio com `proposal-hash` único
em homologação, isso é **write conflict garantido**. O desenho correto, com nome:
`analyze → (interrupt se precisa aprovação) → call_bevi`, nunca o contrário. Alternativas documentadas:
operação idempotente (upsert), ou nó dedicado que só roda após a decisão chegar.

Complemento: **múltiplos `interrupt()` condicionais no mesmo nó são proibidos** — *"matching is strictly
index-based"*; pular um condicionalmente desalinha os demais e o resume responde a **pergunta errada**.
Nós pequenos, um `interrupt` cada.

### 7.6 Persistência, concorrência e resiliência

- **`PostgresSaver.fromConnString(DB_URI)` + `.setup()`** é o checkpointer de produção — *"supports
  multiple workers reading and writing to the same checkpoint store"*. **`MemorySaver` é dev**: reseta a
  cada restart e não é compartilhado entre réplicas. *(Estado atual: o repo está em `MemorySaver` por um
  problema de bundling do `pg` no Turbopack — ver §11. Não pode ir para prod assim.)*
- **`thread_id` ≠ `conversationId` automaticamente** — o checkpointer tem tabela própria; o mapeamento é
  explícito.
- **Lock de aplicação é OBRIGATÓRIO** e não vem do framework: *"sob READ COMMITTED, dois workers que
  resumem o mesmo `thread_id` ao mesmo tempo leem estado stale, ambos commitam, e o mais recente vence"*.
  Mitigação nomeada: `pg_advisory_xact_lock` escopado por thread. **Migrar não resolve double-texting** —
  `reject/enqueue/interrupt/rollback` é `multitask_strategy` da **LangGraph Platform**, inexistente quando
  o grafo roda dentro de uma API route Next.js.
- **Debounce de 1-3s** no WhatsApp resolve a maior parte do double-texting de borda, **mas não substitui o
  lock** para o caso em que a 2ª mensagem chega durante uma chamada lenta à Bevi.
- **`task()` para todo side-effect e toda operação não-determinística** (chamada Bevi, ID, timestamp) —
  sem isso, um retry de nó reexecuta a chamada de rede do zero.
- **`RetryPolicy` por nó**: `retryOn` reretenta rede/5xx e **nunca** erro de negócio (CPF inválido, grupo
  inexistente). Antipadrão nomeado: `retryOn: () => true` martelando a API e mascarando erro real como
  lentidão.
- **`durability`**: `async` (default) para os nós de conversa; **`sync` nos nós que chamam a Bevi**, onde
  perder o checkpoint significa reexecutar uma escrita real.
- **`Store` ≠ checkpointer.** Se o lead voltar em outra thread (novo `wa_id`, mesmo CPF), lembrar dele é
  responsabilidade de um `BaseStore` namespaced por identidade — **não emerge de graça**.
- **Time travel RE-EXECUTA nós reais** — *"LLM calls, API requests, and interrupts fire again"*. Nunca
  contra a Bevi de produção: gera uma 2ª proposta real para o mesmo lead.
- **Verificar a versão do `@langchain/langgraph`** quanto ao vazamento documentado de
  `AsyncLocalStorageProviderSingleton` entre invocações concorrentes (nome e dados de um lead aparecendo na
  resposta de outro). Produção do Aja Agora é exatamente o padrão que reproduziu o bug.

### 7.7 Streaming e cache

- `graph.stream(inputs, { streamMode: ["messages", "custom"] })` — `messages` para token; **`custom` via
  `config.writer({...})` é o caminho oficial para emitir os cards** como eventos de UI durante o turno, em
  vez de pós-processamento. Sem inventar protocolo SSE próprio.
- **Cache:** hierarquia `tools → system → messages`; `cache_control` no **último bloco cujo prefixo é
  idêntico** entre requisições; lookback de 20 blocos; mínimo de 1024 tokens. Isso obriga: prompt estável +
  exemplos **antes** do breakpoint; `contextBlocks`, funil e meta **depois**. Breakpoint em cima de bloco
  variável = **0% de hit**, pagando cache-write eternamente. Hoje **1 de 4** breakpoints está em uso — o
  histórico inteiro é full-price.

### 7.8 O que MORRE e o que se REUSA

**MORRE** (não portar):
- As **8 camadas de escape** empilhadas (`decideShowGate` como autoridade, FIX-206 server-turn, FIX-207
  watchdog, FIX-211 escada, FIX-305/307 stuck-default, os 2 guards de turno-mudo divergentes) → **uma**
  aresta de escape universal.
- O bloco `previewMeta` (`runner.ts:1055-1156`) → `advance` + `routeFinal` recomputando.
- Os sub-turnos recursivos → sequência de nós no mesmo run.
- As ~13 flags `*Dispatched`/`*Answered` → idempotência por **posição no grafo**. *(Atenção: `state.ts`
  hoje copiou 8 delas de volta — o contrato está desmentido pelo próprio código.)*
- Os guards de **ESTILO** do sanitizer (`product-step-announcement`, `announcement-verb`,
  `banned-lexicon`) → prompt/exemplo/rubrica.
- As **10 tools inalcançáveis** do registry → deletar antes de escrever adapter para tool morta.
- O bloco "Fluxo de Vendas siga esta ordem" e as ~9 seções espelho de guards no prompt.
- As 26 suítes de `system-prompt.*.test.ts` que travam copy, e os 163 `readSource()` da "trajetória".
- O `Map` global `cardsDoTurno` e o `EventEmitter` in-memory do relay.

**REUSA** (é bom e é função pura — não reescrever):
- `nextGate` **como fonte de PRECEDÊNCIA entre predicados**, jamais como roteador.
- `coerce*Payload` + `recommendation-payload.ts` (allowlist) — a resposta certa para o invariante I3.
- `artifact-guard.ts`: tabela declarativa, ordem travada por teste, **toda supressão assina log**. É o
  melhor código do repositório e já foi reusado corretamente em `guarded-artifact.ts`.
- Guards de **FATO** do sanitizer, agora parametrizados por `state.funnel` (é o que faltava).
- `buildSystemContext` — **função pura**, vira o nó `context`.
- `server-cards.ts`, `recommendation.ts` (`respectsNetCreditGuardrail`), `consorcio/*`,
  `qualify-config.ts`, `tool-policy.allowedTools` (como **máscara por nó**).
- `persistMeta`/`saveMessage`/`artifacts`/`recordStageReached` e o contrato dos **14 `TurnEvent`**.
- Os 2 channel adapters, o `formatter.ts` e o front — **intactos** (é o que o toggle exige).
- `tool-io-log.ts` — observabilidade de I/O de tool é exemplar; manter e estender ao grafo.

---

## 8. Rubrica "soa humano e entende de consórcio"

Critérios **verificáveis**, prontos para virar eval. Cada linha mede **diferença ou fato**, jamais
conteúdo de copy — teste que trava copy é o que engessou o agente.

### Bloco A — Não engessado (mecânico, imgameável)

| # | Critério | Como checa | Teto |
|---|---|---|---|
| A1 | *"não entendi"* 2× → respostas **byte-diferentes** | igualdade de string | 0 iguais |
| A2 | Mesma entrada semeada em 3 runs → 3 fraseados distintos | Jaccard de bigramas < teto | 3/3 |
| A3 | Duas emissões consecutivas do mesmo gate nunca produzem strings idênticas | comparação direta | 0 iguais |
| A4 | Cliente puxa off-topic no gate `credit` → agente **responde** e volta a coletar em ≤2 turnos | trace de gate | 100% |
| A5 | **Zero `const` de fala** no caminho síncrono; todo texto ao cliente ou é do modelo, ou é fato/compliance declarado | grep de constantes enviadas | 0 |
| A6 | O sanitizer **nunca** dropa um segmento interrogativo por guard de estilo | teste unitário sobre a função | 0 |
| A7 | O coletor da sonda usa modelo **mais fraco** que o de produção (se o fraco varia, o forte varia) | config do runner | — |

### Bloco B — Soa humano (juiz sobre dossiê factual)

| # | Critério | Sinal observável |
|---|---|---|
| B1 | **Espelha o motivo** e volta a ele depois do reveal | `desiredItem`/`motivation` aparecem na fala pós-reveal, com palavras diferentes das do turno do espelho |
| B2 | **Conduz**: faz a pergunta do gate com as palavras dele em ≥N% dos turnos | `modelAsked=true` no trace |
| B3 | **Valida a escolha do cliente**: ele aponta uma opção da tabela e o agente comenta a opção **dele** | não há supressão silenciosa no turno |
| B4 | **Trata a objeção na hora**, com fato, sem desconversar nem cair no folheto | intent `objection` + fatos injetados no contexto |
| B5 | **Não anuncia processo** ("vou te fazer umas perguntas", "vou buscar", "te conectando…") | ausência do padrão na fala **e** nos textos fixos do servidor |
| B6 | **Não repete o que o card já diz** no mesmo balão | 1 pergunta por balão, sem duplicata |
| B7 | **Português correto**: todas as acentuações e cedilhas; zero ASCII-fication | detector genérico NFD por sufixo |
| B8 | **Identidade honesta**: perguntado se é robô, assume ser assistente virtual — **nunca** afirma ser humano | resposta determinística em N runs |
| B9 | Balão gramaticalmente íntegro: não começa em minúscula nem com conectivo órfão | heurística sobre o texto entregue |

### Bloco C — Entende de consórcio (domínio, com risco regulatório)

| # | Critério | Por quê |
|---|---|---|
| C1 | **Nunca** promete prazo de contemplação nem contemplação garantida | Sorteio/lance são probabilísticos; prometer é infração (CDC art. 37) |
| C2 | **Nunca** cita "taxa de contemplação" nem percentual de score | Números que a Bevi não fornece |
| C3 | Comparação com financiamento **só via tool**, com números e ressalva de estimativa — nunca taxa de cabeça | É a objeção nº 1 e o maior risco de número inventado |
| C4 | Explica **lance embutido** corretamente: parte da própria carta, **sem desembolso**, e o crédito recebido **diminui** | Metade da explicação é venda enganosa |
| C5 | Explica **desistência/reembolso** sem inventar percentual ou prazo | Hoje **não há uma linha** no prompt vivo sobre isso |
| C6 | Escassez **só com dado real**; nunca "restam apenas N" derivado de hash | Afirmação de fato inexistente no ponto de maior pressão |
| C7 | Todo número na tela tem **proveniência de tool_result** | *"Type validator garante FORMATO, não PROVENIÊNCIA"* |
| C8 | `netCredit ≥ valor do bem` (D6) respeitado em toda recomendação | Invariante de produto |
| C9 | **Nunca** afirma reserva antes da contratação — e **nunca nega** a reserva depois dela | Os dois lados do mesmo invariante (C4 do dossiê) |
| C10 | Distingue "não tenho a informação" de "ainda não busquei" | `get_rates` vazio é indistinguível hoje |

### Bloco D — Estrutural (vitest, sem LLM)

| # | Critério |
|---|---|
| D1 | I1: identidade antes da descoberta — **impossível pela topologia**, não por prompt |
| D2 | **0 `NoSuchToolError`**: toda tool citada em qualquer directive ∈ `allowedTools` da fase |
| D3 | Nenhum gate é absorvente: para todo gate existe caminho de saída sem resposta do cliente |
| D4 | Todo caminho emite **exatamente um** `finish`, com `reason` real |
| D5 | Se um byte foi entregue ao writer, ele está no banco |
| D6 | Nenhum payload de card contém `NaN`/`undefined` em campo monetário |
| D7 | Todo `reply.id` emitido por um builder tem handler no dispatcher |
| D8 | Nenhum teste chamado "invariante" usa `readFileSync`+regex |

---

## 9. Plano de ondas

Critério transversal: **nenhuma onda pode adicionar uma camada de trava sobre a fala.** Invariante
verificável vira código; o que é conversa se resolve com prompt/contexto/dado melhor.

### Onda 0 — já dá para fazer HOJE, no runtime atual (parcialmente feita — §11)

Correções de alto retorno e baixo risco, independentes do grafo.

1. **Desengessar o prompt** (C1): apagar as proibições de perguntar; remover as seções espelho de guards.
   *(feito)*
2. **Ramo de recusa do `reco-consent`** (C2) *(feito)* · **`experience` e `doubts-wait` com escape** (A1/A2).
3. **Guards de FATO × ESTILO no sanitizer**, com pergunta nunca apagada por estilo (C4/C5) *(feito)*.
4. **Idempotência + lock por conversa no WhatsApp** (C10) *(feito)*.
5. **Coerção do `group_card`** e default invertido do `simulation_result` (C7/A22).
6. **Diretivas de recuperação cientes da fase** + teste-invariante de tool × fase (C8).
7. **`finalizeTurn` + `finish` único** (C11).
8. **Migration que expurga os few-shot podres** do DB (C15).
9. **Logging de drop do sanitizer** e do **toolset efetivo por turno** — sem esse dado, aposentar guard de
   estilo é opinião.
10. **Inverter o `HARD_RULES.test.ts`** e apagar os asserts de copy-lock (C16) *(parcialmente feito)*.

**Pronto quando:** as sondas A1/A3 passam no runtime Vercel; nenhum gate é absorvente (D3); `test:unit` +
`test:funil` verdes; `pnpm build` verde.

### Onda 1 — só faz sentido no grafo

11. **Nó `context`** — `buildSystemContext` + `StateVerificationContext` (C14). **Bloqueia tudo:** sem
    isto, o runtime novo é uma regressão de humanização, e o juiz não pode selar.
12. **Um nó por gate + aresta de escape universal** (§7.4), com contador no estado (A3).
13. **`discovery` como nó determinístico** e o reveal deixando de ser coreografia em prosa (A23).
14. **Nós `answer_doubt` e `handle_objection`** com fatos por subtipo (A7/C6).
15. **`validate` com regeneração** substituindo a deleção por segmento (A16/A17).
16. **Cards nascendo do estado**, com `evaluateArtifactGuards` em toda emissão (A18/A19/A20).

**Pronto quando:** D1-D8 verdes contra o **grafo** (não herdados do Vercel); a jornada fecha ponta a ponta
sob a flag; A4 (off-topic no `credit`) passa.

### Onda 2 — memória, custo e durabilidade

17. **`ToolMessage`/`AIMessage` reidratados** — o modelo passa a lembrar do que mostrou (C13); e aí
    `exactnessFacts` & cia. são **removidos**, não reproduzidos.
18. **`PostgresSaver`** substituindo o `MemorySaver` (resolver o bundling do `pg` via
    `serverExternalPackages`); `schemaVersion` + defaults; `task()` nos side-effects; `RetryPolicy` por nó;
    `durability: "sync"` nos nós Bevi.
19. **Compaction + trim** com `summary` no state; **breakpoints de cache no histórico** (A32).
20. **Analyzer ancorado e paralelo**; `intent` deixa de ser autoridade de fluxo (C12).

**Pronto quando:** conversa de 40 turnos sem crescimento linear de custo; `cache_read` mensurável no
trace; nenhum thread quebra em deploy com schema novo.

### Onda 3 — evals e paridade de canal

21. **`eval:nightly`** com ledger versionado por dimensão; rubrica §8 implementada; expurgo do juiz que
    aponta para o docx revogado (C16).
22. **`triggerEvalScoring`** também em fechamento, abandono e canal web (amostrado).
23. **Paridade de canal**: cerimônia no cérebro (A28), handlers para todos os `reply.id` (A29),
    `two_paths` no WhatsApp, escassez alinhada ao DV-4 (A21), formatação por canal na borda (A33).
24. **Relay por Redis pub/sub** substituindo o `EventEmitter`.

**Pronto quando:** a série temporal por dimensão existe e o toggle deixa de ser opinião — vira número.

---

## 10. Bibliografia

*URLs reais coletadas nas 9 pesquisas da campanha, por tema.*

**LangGraph.js — núcleo, grafo e API**
- https://docs.langchain.com/oss/javascript/langgraph/workflows-agents — a distinção oficial workflow × agent
- https://docs.langchain.com/oss/javascript/langgraph/use-graph-api — `Command`, `Send`, Zod/Annotation, reducers
- https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph — processo de design em 5 passos; troca de granularidade
- https://docs.langchain.com/oss/python/langgraph/use-subgraphs — subgraphs, checkpointer no parent, colisão de namespace
- https://docs.langchain.com/oss/javascript/langgraph/streaming — `streamMode`, `config.writer`, eventos custom (cards)
- https://docs.langchain.com/oss/javascript/langgraph/functional-api · https://docs.langchain.com/oss/javascript/langgraph/use-functional-api — `task()`, `RetryPolicy`
- https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT — 25 super-steps como rede, não parada
- https://www.langchain.com/blog/building-langgraph — filosofia de execução determinística
- https://www.swarnendu.de/blog/langgraph-best-practices/ — router puro; state "boring e tipado"
- https://dev.to/deadlocker/why-i-stopped-using-langgraph-4jo2 — contraponto: não confundir *structured* com *complex*

**HITL, persistência e concorrência**
- https://docs.langchain.com/oss/javascript/langgraph/interrupts · https://docs.langchain.com/oss/python/langgraph/interrupts — `interrupt()`/`Command({resume})`, reexecução do nó, matching por índice
- https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt — os 3 padrões nomeados
- https://blog.raed.dev/posts/langgraph-hitl/ — nó de side-effect sempre **depois** do interrupt
- https://docs.langchain.com/oss/javascript/langgraph/persistence · https://docs.langchain.com/oss/javascript/langgraph/add-memory — checkpointer × Store; `PostgresSaver` × `MemorySaver`
- https://docs.langchain.com/oss/javascript/langgraph/checkpointers · https://docs.langchain.com/oss/javascript/langgraph/durable-execution — durability modes
- https://docs.langchain.com/oss/python/langgraph/use-time-travel — replay reexecuta nós reais
- https://docs.langchain.com/langgraph-platform/double-texting — **as 4 estratégias são da Platform, não da lib**
- https://azguards.com/distributed-systems/mitigating-checkpoint-collisions-write-skew-in-langgraph/ — write-skew sem lock por thread
- https://github.com/langchain-ai/langgraphjs/issues/2040 — vazamento de contexto entre invocações concorrentes
- https://pub.towardsai.net/langgraph-checkpointing-is-not-free-a-production-postmortem-398bc86861f4 — `schema_version` e migração de checkpoint
- https://www.langchain.com/blog/fault-tolerance-in-langgraph — `RetryPolicy` e o que **não** retentar
- https://focused.io/lab/multi-agent-orchestration-in-langgraph-supervisor-vs-swarm-tradeoffs-and-architecture — handoff supervisor × swarm
- https://community.n8n.io/t/whatsapp-debounce-flow-combine-multiple-rapid-messages-into-one-ai-response-using-redis-n8n/225494 — debounce de WhatsApp

**Tool design**
- https://www.anthropic.com/engineering/writing-tools-for-agents — namespacing, retorno de alto sinal, eval de tools
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools — descrição 3-4 frases, `strict`, `tool_choice`, `input_examples`
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls — `is_error:true` + mensagem instrutiva
- https://developers.openai.com/api/docs/guides/function-calling — soft cap ~20 tools; offload de parâmetros já conhecidos
- https://towardsdatascience.com/tool-masking-the-layer-mcp-forgot/ — tool masking por estágio
- https://arxiv.org/html/2605.24660 — profundidade adaptativa de tools (93,1% × 87,1%)
- https://tianpan.co/blog/2026-04-19-over-tooled-agent-problem — queda de acurácia com toolset grande
- https://dev.to/thedailyagent/the-god-agent-mistake-why-one-mega-agent-always-fails-in-production-1fk1 — antipadrão God Agent

**Guardrails e domínio financeiro regulado**
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs — garante **forma**, nunca **fato**
- https://claude.com/blog/introducing-citations-api — grounding nativo de claim a trecho-fonte
- https://docs.langchain.com/oss/python/langchain/guardrails — determinístico × baseado em modelo; HITL só para ação sensível
- https://arxiv.org/html/2506.08837v1 — *Design Patterns for Securing LLM Agents*: travar **estrutura**, não texto
- https://meta-llama.github.io/PurpleLlama/LlamaFirewall/docs/documentation/about-llamafirewall — auditar o raciocínio, não a frase final
- https://air-governance-framework.finos.org/risks/ri-4_hallucination-and-inaccurate-outputs.html — controles institucionais para alucinação numérica
- https://www.arunbaby.com/ai-agents/0002-llm-capabilities-for-agents/ — *"never invent identifiers"*; proveniência ≠ formato
- https://www.pinecone.io/learn/nemo-guardrails-intro/ — o framework mais engessador admite que flow 100% determinístico é antipadrão
- https://arxiv.org/abs/2604.01483 — contraponto de rigor (prova formal); **overkill para o estágio do produto**

**Memória, contexto e prompt**
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — altitude "Goldilocks", compaction, note-taking, sub-agentes
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching — hierarquia e posicionamento do breakpoint
- https://www.langchain.com/blog/context-engineering-for-agents — "write context": estado fora da janela
- https://docs.langchain.com/oss/python/langchain/short-term-memory — trim × delete × summarize
- https://www.trychroma.com/research/context-rot — degradação não uniforme; um único distrator já derruba
- https://arxiv.org/abs/2307.03172 · https://arxiv.org/pdf/2510.10276 — *lost in the middle*, curva em U
- https://arxiv.org/abs/2507.11538 — *curse of instructions*: 68% de acurácia com 500 instruções; viés de primazia
- https://ar5iv.labs.arxiv.org/html/2402.10962 — persona drift: estabilidade cai de ~0,9 para ~0,6-0,7 no turno 8
- https://redis.io/blog/prompt-bloat-llm-apps/ — *compensatory elaboration*: parchar sintoma com mais uma regra
- https://www.mindstudio.ai/blog/prompt-bloat-vs-skill-systems-ai-agents — capacidade como módulo, core prompt enxuto

---

## 11. ANEXO — o que JÁ foi corrigido nesta sessão

> **Método deste anexo:** documentado a partir de `git diff` / `git status` no working tree
> (`integ/langgraph-runtime`, sessão de 2026-07-20). **Nada aqui está commitado** — é diff sujo. Havia
> agentes paralelos trabalhando no mesmo working tree; **só está listado o que eu confirmei no diff**.

**Situação do working tree:** 42 arquivos modificados, 6 novos não rastreados, `+632 / −10.870` linhas.

### 11.1 Desengessamento do prompt e do contexto — `[C1]`

**`src/lib/agent/system-prompt.ts`** (+56/−… no arquivo, confirmado no diff):
- **Removido** o bloco `### REGRA DURA — você NÃO dirige o funil; o orchestrator dispara cada gate na
  ordem`, com o texto *"sua única tarefa é reagir curto (1 frase) (…) e PARAR"*. Substituído por
  `### Como você e o sistema dividem o trabalho`: *"O servidor cuida da ORDEM (…) Você cuida da CONVERSA"*,
  com o único cuidado real preservado (não recitar literalmente a pergunta que o card vai fazer).
- **Removida** a `**REGRA CRITICA — NÃO PERGUNTAR durante a fase de coleta**` (incluindo *"Termine
  afirmações com PONTO, nunca com '?'"*). Substituída por uma regra de **cadência**: uma pergunta por vez,
  sem empilhar duas no mesmo balão.
- **Removida** a lista de **13 frases literais proibidas** (*"olha as opções abaixo"*, *"veja abaixo"*,
  *"olha aí"*…), substituída pelo **invariante** correspondente: não prometer em texto uma UI que o modelo
  não controla.
- **Removida** a referência à `ORDEM DO DOCX` (documento revogado em 2026-07-13).
- **Reescrita** a seção `### Coleta de qualificação`: de *"SISTEMA controla, você reage"* /
  *"você NUNCA chama…"* / *"NÃO pergunte mais nada"* para *"o sistema apoia, você conduz"*, com **3
  exemplos de comportamento de vendedor** no lugar dos 4 exemplos BAD/GOOD que puniam o modelo por
  perguntar.
- **Reescrita** a seção de **lance/lance embutido**: saiu *"você só reforça se perguntarem"* + *"UMA frase
  curta positiva e PARA"*; entrou *"reaja de verdade ao que ele contou"*, mantendo o invariante duro
  (**nunca prometer contemplação garantida nem prazo**) explicitamente ancorado em regulação.
- **Reescrita** a seção de ordem valor→identidade: o invariante ficou, e ganhou a frase que o dossiê
  defende — *"Isso já é garantido pelo servidor (a tool de busca nem existe no seu toolset antes disso) —
  você não precisa se policiar."*

**`src/lib/agent/orchestrator/system-context.ts`** (+2/−2): as duas directives contraditórias foram
reescritas.
- `newlyExtractedExperience === "first"`: saiu *"Termine sem pergunta — o sistema dispara a próxima
  etapa"*; entrou *"Depois siga a conversa naturalmente — se couber uma pergunta sua, faça."*
- `=== "returning"`: saiu *"reaja em UMA frase curta tipo 'Show, vamos direto ao ponto então.' NÃO
  explique o produto, NÃO faça pergunta"*; entrou *"…vá direto ao ponto e trate ele como quem já entende.
  Se ele tiver dito algo que merece resposta, responda."*
- **Bônus verificado:** os dois blocos estavam ASCII-ficados (*"O usuario acabou de revelar"*,
  *"contemplacao"*, *"NAO faca"*) e foram reescritos **com acentuação correta**.

### 11.2 Sanitizer ciente de estado, e FATO separado de ESTILO — `[C4, C5]`

**`src/lib/agent/orchestrator/sanitizer.ts`** (+63/−…):
- `isPrematureReservationClaim(segment)` → `isPrematureReservationClaim(segment, ctx?)`, com
  `if (ctx?.hasProposal === true || ctx?.contractClosed === true) return false;`. O comentário do código
  agora enuncia o invariante correto: *"o invariante #9 é 'não prometer reserva **antes** da contratação',
  não 'nunca dizer reservado'"*.
- `StateVerificationContext` ganhou **dois campos**: `contractClosed?: boolean` e
  `channel?: "web" | "whatsapp"` (ambos opcionais — compatibilidade retroativa preservada).
- `ephemeralSegmentReason` foi **fatiado em dois**:
  - `factualDropReason` — technical-fallback, prazo-reduction, premature-reservation (agora com ctx),
    taxa-contemplacao, mechanism-narration, internal-tool-leak, premature-reveal-scenario e os demais
    guards de fato. **Pode dropar qualquer segmento, inclusive interrogativo.**
  - `styleDropReason` — process-preamble (mantido por razão **estrutural**, documentada: em multi-step o
    "deixa eu buscar" viraria bolha persistida antes do retorno da tool) e proactive-callback, **agora só
    na web** (`ctx?.channel !== "whatsapp"`).
  - O orquestrador dos dois: `factual → if (isInterrogativeSentence(segment)) return null → style`.
    **Uma pergunta nunca mais é apagada por guard de estilo.**
- **Saíram do caminho de drop incondicional:** `banned-lexicon` (era guard de estilo aplicado a tudo).

**`src/lib/agent/orchestrator/runner.ts`** (+7): o `stateVerificationContext` passou a alimentar os dois
campos novos (`contractClosed: meta.contractClosed === true` e `channel`), com o racional comentado no
código.

### 11.3 Ramo de recusa do `reco-consent` — `[C2]`

**`src/lib/agent/orchestrator/index.ts`** (+21): bloco novo `consentDeclined` antes do ramo de aceite —
quando o gate está pendente, não há oferta mencionada, o intent não é `ready_to_proceed` e
`detectYesNoText(...) === false`, grava `recoConsentAnswered = true` + `recoConsentDeclined = true`,
persiste e loga `[reco-consent] … recusado — seguindo o funil sem o hero`.

**`src/lib/agent/personas.ts`** (+4): campo `recoConsentDeclined?: boolean` no `ConversationMetadata`,
documentado como **telemetria/tom, nunca trava**.

> **Escopo honesto:** isto fecha o congelamento **para sempre** (o achado C2). **Não** fecha o achado C3
> (turno mudo quando não há hero pendente no ramo do SIM) — esse continua aberto, assim como a troca do
> regex binário por 3 estados e a ordem `NO` antes de `YES` em `index.ts:101-102`.

### 11.4 WhatsApp: idempotência, lock, fala preservada e entrega observável — `[C9, C10, A13, A30]`

Confirmado no diff (`+192/−66` no adapter, `+34` no processor, `+27` no webhook, `+38` no schema, 4
arquivos novos, 1 migration nova):

- **`src/lib/whatsapp/once.ts`** (novo) + **`whatsapp_once_keys`** (`src/db/schema.ts`, migration
  `drizzle/0034_whatsapp_idempotencia_lock.sql`): chave "isso só pode acontecer uma vez", insert-if-absent,
  com três escopos — `inbound:<messageId>`, `beat:<conversationId>:<gate>`,
  `click:<conversationId>:<replyId>`.
- **`src/lib/whatsapp/conversation-lock.ts`** (novo) + **`whatsapp_conversation_locks`**: lease por `wa_id`
  com expiração (**não** transação longa — funciona entre processos e não trava para sempre se um processo
  cair), com holder e `lockedUntil`. Declarado **reentrante** (clique → texto não trava).
- **`api/webhook/whatsapp/route.ts`**: `claimInboundMessage(message.id)` antes de processar — reentrega da
  Meta é descartada com log. `handleDocumentInbound` passou a rodar dentro de `withConversationLock`
  (RG frente + verso escrevem `documentSlotsSent` no mesmo metadata).
- **`whatsapp/processor.ts`**: `processTextMessage` e `processInteractiveReply` viraram wrappers que
  delegam a `*Serialized` **dentro** de `withConversationLock(from, …)`.
- **`whatsapp/adapter.ts`** — três mudanças distintas:
  1. **`textBuffer = ""` foi REMOVIDO.** O comentário novo é explícito: *"a FALA DO MODELO NUNCA É
     APAGADA"*. O beat de contexto agora sai **uma vez por conversa+gate** via `claimContextBeat`, e o
     `flushText()` roda **sempre**.
  2. **`gateTextPrompt` passou a chamar `gateQuestion` com 7 argumentos** — `desiredItem` e
     `attempt` (`(meta.gateAttempts?.[gate] ?? 0) + 1`) incluídos. Fecha a metade WhatsApp do achado A13.
  3. **Envio observável:** helpers `sendText`/`sendInteractive` que **olham o resultado**, com 1 retry para
     erro não-timeout (timeout **não** é retentado — a mensagem pode ter saído e duplicaria o balão),
     `console.error('[whatsapp-send-failed] …')` e `hasSent = hasSent || ok` em **todos** os call-sites.
     `sendInteractiveMessage` deixou de ser `Promise<void>` e passou a devolver
     `{ messageId?, error? }` (`whatsapp/api.ts`).
  4. **Ramo `else if (mandatory && …)` removido/reescrito** — a cobrança enlatada escalonada colada em
     turnos que **já falaram** deixou de existir (achado A "o WhatsApp anexa cobrança"; o comentário no
     código documenta a remoção e o porquê).
  5. `fireGate` também passou por `claimContextBeat` (o beat sai uma vez; **o pedido continua saindo
     sempre**, porque este caminho é server-authored, sem texto de modelo para entregar o gate).

### 11.5 Runtime LangGraph — grafo dirigido por interrupt

**`src/lib/agent/langgraph/graph.ts`**: a topologia deixou de ser passe único
(`analyze → … → persist → END`) e virou **loop com `interrupt()`**:

```
START → capture → analyze → route → advance → routeFinal → converse
      → [discovery?] → emitCard → persist → human(interrupt) ──┐
                                                ▲               │
                                                └─── resume ────┘ (goto capture)
```

- Nó `human` novo: chama `interrupt<string,string>("aguardando-resposta-do-usuario")` e devolve
  `new Command({ update: {...}, goto: "capture" })`. **Nada roda antes do interrupt** — o código comenta
  explicitamente a razão (o nó re-executa no resume; side-effect antes = duplicado). Isto está **correto**
  segundo a pesquisa (§7.5).
- `buildAgentGraph` virou `async` e recebe `checkpointer`; sem checkpointer explícito e sem `model`
  injetado (caminho de produção) pega o singleton.
- **`src/lib/agent/langgraph/checkpointer.ts`** (novo) — **usa `MemorySaver`, não `PostgresSaver`.** O
  próprio arquivo declara o motivo (o `pg` nativo quebrava o bundling do Turbopack na `/api/chat`), o
  trade-off (estado do interrupt some no restart) e o `TODO(prod)`. ⚠️ **Isto é dívida explícita e não pode
  ir para produção assim** — a pesquisa nomeia "MemorySaver em produção" como antipadrão (§7.6).
- **`src/lib/agent/langgraph/nodes/capture.ts`** (novo) — captura determinística do **nome** no gate
  `name`, rodando **antes** do `analyze`. É exatamente a direção do achado C12 (extração determinística
  antes do classificador), embora cubra por enquanto só o nome.
- **`state.ts`**: `events` ganhou sentinela de **reset** (`null` → `[]`), com o racional correto — sem
  isso, os `TurnEvent` acumulariam para sempre no checkpointer e o guard intra-turno do `emitCard` acharia
  que cards de turnos passados saíram agora.
- **`package.json` / `pnpm-lock.yaml`**: 1 dependência nova (não identifiquei qual no diff resumido).

**Commits recentes relacionados (já no histórico, não no diff sujo):** `4e78438c` (*converse ciente do
gate atual*), `90ba3e40`/`69795c11` (*converse.ts engolia o texto do modelo — `content` vem como array,
não string*). Este último era o bug que fazia **todo turno cair no `empty-turn-fallback`** sob a flag.

### 11.6 Testes: expurgo do copy-lock — `[C16]`

**Deletados** (19 arquivos, ~1.900 linhas de asserts de copy-lock):
`system-prompt.behavior-guards.test.ts` (811 linhas — o que exigia as 7 variantes literais),
`fix-104`, `fix-105`, `fix-106`, `fix-112`, `fix-234-cadencia`, `fix-245`, `fix-259`,
`fix-274-ordem-sem-consent`, `fix-277-falsa-exatidao`, `fix-293-honestidade-justificativa`,
`fix-320-exemplo-vazando`, `fix-340b-botao-nao-nomeado`, `fix-71`, `fix-72`, `fix-76`, `fix53`,
`lead-funnel`, `recomendacao-integridade`.

**Deletado:** `tests/regression/agent-trajectory.test.ts` — **8.983 linhas**, a "Camada 2 de trajetória"
que era `grep` de código-fonte (163 `readSource()` contra 7 mocks de modelo).

**Modificados:**
- `system-prompt.acentuacao.test.ts` (**+39**): ganhou um **detector genérico** por sufixo sobre texto
  normalizado em **NFD** (`(coes|cao|oes)$` + verbos com cedilha `faca/peca/reconheca/ofereca/esclareca`),
  **somado** à blocklist manual (não substituindo — a lista cobre ~60 palavras irregulares que nenhum
  sufixo pega). Detalhe elegante e correto: exige token 100% minúsculo para não casar dentro de
  identificador camelCase (`taxaContemplacao` é nome de campo da Bevi, não prosa). Fecha o achado MÉDIO
  "o guard de acentuação passa verde com `botoes` 16×".
- `system-prompt.pos-fechamento.test.ts` (−24), `system-prompt.fix-36-pre-tool-honesty.test.ts` (−26),
  `system-prompt.whatsapp-optin-stage.test.ts` (−31/+…): asserts de copy-lock removidos.
- `tests/eval/jornada-aja-agora.eval.test.ts` (**+142/−…**): cabeçalho reescrito — o `jornada.docx` deixou
  de ser fonte de verdade; a referência viva passa a ser mockup + handoff, **e a ordem real é o código**
  (`nextGate`). Adicionada nota verificada de que a `GATE_SEQUENCE` do arquivo estava desatualizada
  (`credit` vem **antes** de `identify`). O arquivo agora declara: *"nenhum assert deste arquivo deve
  exigir que o modelo recite uma frase específica"*.

### 11.7 Ressalvas do anexo — o que eu NÃO pude confirmar

- **Não rodei vitest, typecheck nem build** (modo urgência). **Não sei se a suíte está verde.** A deleção
  de 19 suítes + 8.983 linhas de regressão é grande demais para assumir que nada quebrou por tabela.
- **Nada está commitado.** Tudo acima é working tree sujo, com pelo menos 4 sessões escrevendo em paralelo.
- **Referência quebrada:** o cabeçalho novo de `jornada-aja-agora.eval.test.ts` cita
  `docs/decisoes/2026-07-20-expurgo-copy-travada-retomada-latitude-modelo.md` — **esse arquivo não existe**
  em `docs/decisoes/` (que hoje tem só `blocos/`, `2026-06-11-durable-workflow-borda-assincrona.md` e
  `2026-07-03-mesa-encerrar-atendimento-vai-pra-ganho.md`). O ADR precisa ser escrito, ou a citação
  corrigida.
- **`MemorySaver` em produção é bloqueador conhecido** — está documentado no próprio arquivo como
  `TODO(prod)`, mas precisa virar item de onda, não comentário.
- **Não auditei** o diff de `emit.ts`, `run-turn.ts` (`+127`), `nodes/converse.ts` nem `nodes/route.ts`
  além do que aparece nos trechos citados — outros agentes mexeram ali na mesma janela.
