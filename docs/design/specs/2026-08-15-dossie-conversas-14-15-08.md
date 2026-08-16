# Dossiê — as 6 conversas de 14–15/08 e a resposta ao "por que AINDA"

> **Autor:** Super Especialista de IA (revisor de arquitetura e avaliação de agente).
> **Escopo:** as 6 conversas de produção de 14–15/08 (`e4152a93`, `044bb367`, `75f77efd`,
> `9b9f9aab`, `c09bd8de`, `aebac770`), a explicação ESTRUTURAL de por que os defeitos
> reaparecem depois de duas rodadas de dossiê e ~25 commits de correção, e a rastreabilidade
> da conversa `fa0533a0` que sumiu do banco.
> **Fontes:** banco de produção (túnel SSM 25432, somente leitura); CloudWatch `/ecs/tb/prod`
> prefixo `aja-agora` (janelas 2026-08-14T02:28Z, T17:56Z, T21:55Z, T23:20Z e 2026-08-15T15:07Z);
> Langfuse de produção v4 (`/api/public/v3/scores` e `/api/public/v2/prompts`, medidos
> 2026-08-15); código da `develop` em `0f3c76fd`; sondas determinísticas rodadas contra o
> código real (vitest, §7).
> **Rótulos:** **PROVADO** (log com conv id / `arquivo:linha` / estado no banco / sonda) ·
> **INFERÊNCIA** (mecanismo com as duas metades provadas) · **HIPÓTESE** (aberta, com o teste
> que a fecha).
> **Ressalva de método:** o `[analyzer]` e o `[route]` continuam sem conv id. Toda linha dessas
> citada aqui está numa janela em que a conversa citada era a única ativa, e está rotulada
> INFERÊNCIA quando a amarração é só temporal. Os scores do Langfuse v4 **não retornam
> `traceId`/`sessionId`** pelo endpoint público — por isso aparecem aqui como estatística de
> população (`environment=production`, 65 turnos na janela), nunca atribuídos a uma conversa.

---

## Veredito em uma frase

Os defeitos reaparecem porque **cada regra crítica deste produto existe em DUAS cópias e não
há invariante que force as duas a concordarem** — os consertos das rodadas anteriores foram
aplicados corretamente a UMA das cópias, e o defeito reapareceu pela outra: o funil tem uma
implementação na web (`route.ts`) e outra no WhatsApp (`interactive-handlers.ts`), e o
`FIX-386` (28/07) mudou o contrato compartilhado (`nextGate`) só do lado da web — resultado
medido: a conversa `9b9f9aab` **prometeu um pré-cadastro que nunca existiu** porque o clique
"Seguir agora" no WhatsApp não escreve `decisionAccepted`, o funil ficou preso no gate
`decision` para sempre e o `contract_form` nunca foi emitido (`qualify-state.ts:559` ×
`interactive-handlers.ts:814-818`, sonda A).

Não houve alucinação nesse turno: **o modelo traduziu com honestidade um estado de servidor
quebrado** — foi mandado fechar a venda por uma directive (`directives.ts:271`) e nunca foi
informado de que o fechamento não aconteceu.

---

## §0 · A resposta ao "POR QUE AINDA" — as sete costuras

O padrão não é "os fixes são pontuais". É mais específico e mais consertável: **toda regra que
reapareceu quebrada é uma regra escrita duas vezes.** Sete costuras, todas medidas nesta
rodada:

| # | A regra | Cópia A | Cópia B | O que quebrou em 14–15/08 |
|---|---|---|---|---|
| 1 | "o que assina a decisão do cliente" | `route.ts:485-503` (web, escreve `escolha`) | `interactive-handlers.ts:814-818` (WhatsApp, **não escreve nada**) | `9b9f9aab`: venda prometida, zero proposta |
| 2 | "quais tools o modelo tem" | `tool-policy.ts:150-152` (bind real) | `system-prompt.ts` cita `search_groups` 11× | `aebac770`: o modelo chamou tool inexistente e o pedido do cliente evaporou |
| 3 | "quem faz a pergunta ao cliente" | o modelo, no seu tom | o card de gate, `gate-questions.ts` | `044bb367`: Sheila respondeu a pergunta do modelo no campo do card |
| 4 | "o texto do prompt do analyzer" | `turn-analyzer.ts:157` (repo) | `aja-turn-analyzer` v1 no Langfuse (07/08) | dívida de deploy — **não causou** nenhum defeito desta janela (§2.A10) |
| 5 | "observabilidade de tool I/O" | `tool-io-log.ts` (escrito para o AI SDK) | runtime LangGraph | módulo com **zero chamadores**; nenhuma linha `[tool-io]` em 3 dias |
| 6 | "o que o cliente pediu" | `qualifyAnswers.prazoMeses` | o conjunto de ofertas já buscado | `75f77efd` pediu 12 meses e levou 47; `9b9f9aab` pediu 120 e levou 48 |
| 7 | "o registro da conversa" | `messages` no banco | CloudWatch + Langfuse | `/reset` apagou a prova do dossiê de 14/08 (§1) |

É exatamente o modo de falha que o MAST (arXiv 2503.13657, NeurIPS 2025) mede como o mais
caro em sistema multi-parte: **especificação (~41,8%) + desalinhamento entre as partes
(~36,9%) = 78,7% das falhas**, contra ~21,3% de verificação. Aqui as "partes" não são agentes:
são os dois canais, os dois armazéns de prompt, os dois perguntadores. Trocar de modelo, mexer
no prompt ou apertar mais um guard não toca em nenhuma delas.

**A consequência prática para a próxima rodada:** enquanto o conserto for "corrigir o defeito",
a taxa de reincidência continua. O conserto tem que ser "**apagar a segunda cópia** ou criar o
teste que prova que as duas são iguais". Cada P0 abaixo está escrito nessa forma.

---

## §1 · Rastreabilidade: a conversa `fa0533a0` não foi apagada por ninguém suspeito — foi o `/reset`

Decidi isto primeiro porque ele governa a confiança em toda a evidência dos nossos dossiês.

**PROVADO — a conversa existiu em produção.** CloudWatch `/ecs/tb/prod`, 2026-08-14T02:28:01Z:

```
[whatsapp-session] New conversation fa0533a0-6179-46ec-8abe-fea74a559afc
                   for wa_id 556292496793 (simulated=false)
```

Seguida de `[turn-trace]` com `"conversationId":"fa0533a0-…","channel":"whatsapp"`. O dossiê de
14/08 analisou **produção de verdade**.

**PROVADO — ela foi apagada por um comando do próprio cliente.** CloudWatch,
2026-08-14T23:20:53Z (20:20:53 BRT), 10 segundos antes de a conversa `9b9f9aab` nascer:

```
[whatsapp] Text: "/reset"
[whatsapp-out:text] "🔄 Conversa resetada. Manda um oi pra começar de novo!"
[whatsapp-processor] Reset conversation for 556292496793
```

O comando está em `src/lib/whatsapp/processor.ts:70-79` e faz `db.delete(conversations)` com
cascade. O gêmeo na web é `src/app/api/chat/reset/route.ts:97-100`, **sem autenticação**, com
o comentário explícito "Se o dado foi para o funil, pode deletar tbm".

**Corroboração no banco:** `messages` não tem UMA linha entre 2026-08-13T20:00Z e
2026-08-14T14:00Z (agregação por hora); zero mensagens órfãs; zero linhas de `fa0533a0`.

**Veredito.** A evidência dos dossiês é confiável — mas **destrutível por um comando de produto,
sem arquivo e sem aviso**. O trace sobrevive no CloudWatch (30 dias) e no Langfuse; o
transcript, não. Quem investigar um incidente depois de o cliente digitar `/reset` reconstrói a
conversa por log, que é o que o dossiê de 14/08 teve de fazer. Isso é dívida de auditoria, não
incidente de segurança. → **P2 [código]**: `/reset` marca `deleted_at` em vez de `DELETE`
(a purga de memória Letta e a troca de cookie continuam iguais), ou grava o transcript num
`artifacts`/S3 antes de apagar.

---

## §2 · Os achados

### A1 · (P0) O clique de aceite no WhatsApp não escreve o aceite — e a venda vira promessa falsa

**Conversa:** `9b9f9aab` (WhatsApp, 14/08 20:21–20:28). É o item 1 da sua lista, e a resposta é
mais grave do que "o guard não pegou".

**A cadeia, provada:**

| Hora | O que aconteceu | Prova |
|---|---|---|
| 20:25:32 | `decision_prompt` emitido; `decisionDispatched=true` | `[turn-trace] artifactsEmitted:["decision_prompt"]` |
| 20:25:38 | Cliente clica **"Seguir agora"** (`decision_contratar`) | `[whatsapp] Button reply: decision_contratar` |
| 20:25:38 | O handler grava **só `decisionDispatched`** — nunca `decisionAccepted`, nunca `escolha` | `interactive-handlers.ts:124` → `:797-826`, `persistMeta` na linha 817 |
| 20:25:41 | `[route] gate=decision … decision=true **form=undefined**` — e assim fica em TODOS os 6 turnos seguintes | CloudWatch, conv id |
| 20:26:09 | Cliente clica **"Tenho interesse!"** (`interest_6a7b59c325935b16a731689b`, com o groupId real) — mesmo handler, o groupId é **descartado** | `interactive-handlers.ts:126` → `handleInterest` não lê `replyId` |
| — | `contract_form` nunca é emitido: `emit-card.ts:392` exige `gateDoTurno === "contract"` | `arquivo:linha` |
| — | `bevi_proposals` para esta conversa: **0** | banco de produção |

**A raiz, em uma linha:** `qualify-state.ts:559` —
`if (!meta.escolha && !meta.decisionAccepted) return "decision";` (FIX-386, 2026-07-26,
"CONTRATAR EXIGE UM SIM"). O único escritor de `decisionAccepted` é `advance.ts:127-131`, que
exige `detectYesNoText(state.userText, intent) === true` — **texto livre**. O clique estruturado,
que é o sinal mais forte que existe, não escreve nada. E no WhatsApp o card de decisão **é** um
botão.

**Sonda A (determinística, roda contra o código real):** com a metadata literal de `9b9f9aab`,
`nextGate()` devolve `"decision"`; acrescentando `decisionAccepted: true` **ou** `escolha`,
devolve `"contract"`. **Sonda C:** `detectYesNoText` devolve `null` para `""` (turno de clique),
`"02874137138"` (o CPF que ele mandou), `"62992496793"`, `"Seguir agora"` e `"Tenho interesse!"`
— e `true` para `"sim"` e `"Ok"`.

**Por que a web não morre disso:** a Ana (`75f77efd`) escapou porque **digitou "Ok"** às
19:00:50 — `detectYesNoText("Ok") === true` → `decisionAccepted` → `[route] gate=contract` →
`contract_form` → `insert_proposal_bevi_consorcio` 201 às 19:00:59. A venda do dia dependeu de
a cliente ter digitado uma palavra em vez de clicar. Varredura no banco: web 8 conversas com
`decisionDispatched`, 6 com aceite, 6 com formulário, 5 fechadas; **WhatsApp 1 com
`decisionDispatched`, 0 com aceite, 0 com formulário, 0 propostas**.

**O comentário que já sabia disso** está em `src/lib/whatsapp/proxy.ts:327-343` (FIX-409):
*"enquanto os dois canais discordarem sobre o que assina um contrato, o que vale é o mais
permissivo… `decisionDispatched` segue marcado: o funil avança, o card de decisão pergunta, e a
resposta a ELE é o que fecha."* — a última frase é **falsa no WhatsApp**, e ninguém testou.

**Camadas:** 1 (estado/fluxo) → 2 (contexto) → 3 (fala). **Classificação:** **(2) dado que vai
para o banco/Bevi/mesa → código + teste de integração.**

---

### A2 · O guard que o CLAUDE.md cita não podia pegar — e NÃO deve ser estendido

Você perguntou por que `isPrematureReservationClaim` não pegou "você está oficialmente
pré-cadastrado no consórcio do Itaú".

**PROVADO (sonda B):** nenhuma das quatro falas reais de `9b9f9aab` casa com
`PREMATURE_RESERVATION_PATTERNS` (`sanitizer.ts:153-172`). As duas falas do incidente
**anterior** ("Sua cota está reservada", "Sua cota está confirmada") casam. Não é cobertura de
canal nem ordem de execução: **o guard cobre exatamente o que já aconteceu**, que é a definição
de blocklist (Lei 2). A âncora de estado (`ctx.hasProposal`) está correta e não é o problema —
o problema é a lista de padrões, que não converge.

**Veredito duro, e é o ponto em que este dossiê discorda do reflexo natural:** **não adicionar
"pré-cadastrado" à lista.** Seria a 6ª rodada do jogo que `649320dc` já reverteu. A frase era
**verdadeira do ponto de vista do contexto que o servidor entregou ao modelo** — a directive
`buildAdvanceToContractDirective` (`directives.ts:271`) manda escrever "1-2 frases de
fechamento… você não paga nada agora, é só um pré-cadastro" e afirma que "o sistema pede os
dados logo depois da sua fala (formulário na web, **mensagem no WhatsApp**)"
(`directives.ts:9-11`). No WhatsApp essa mensagem não veio, e nada avisou o modelo. Amordaçar a
frase deixaria o cliente sem explicação nenhuma e manteria a venda perdida.

**Classificação:** a FALA é **(1) só depois de A1 estar consertado** — com o estado certo, a
mesma frase vira verdade. O que vira código é o **estado**, não a frase.

---

### A3 · "A administradora do Itaú é quem cuida de tudo daqui pra frente"

**Conversa:** `9b9f9aab`, 20:27:40. Contradiz o modelo de negócio (quem atende é a mesa da Aja
Agora).

**PROVADO — o prompt diz o contrário e é o prompt que roda.** `system-prompt.ts:31`: *"O
pré-cadastro acontece na própria plataforma — sem corretor, sem captura de lead. Só DEPOIS do
fechamento um atendente da Aja Agora entra em contato pra fazer a ADESÃO na administradora
escolhida."* E o texto publicado no Langfuse (`aja-system-prompt` v3) é **byte a byte idêntico**
ao código (11.360 chars, diff vazio — §2.A10). Ou seja: a regra estava na janela e foi
**omitida**.

**Causa-raiz:** falha por omissão sob carga (Lei 4 — arXiv 2507.11538, decaimento linear,
omissão até 30× mais frequente que modificação), agravada por um estado que dizia ao modelo que
o fechamento tinha acontecido quando não tinha. Turno seguinte (20:28:12) o modelo chamou
`check_proposal_status` — a tool honesta — recebeu "sem proposta" e **confabulou a ponte**
("está sendo processada… pode levar umas horas"), porque o contexto de 2 minutos antes afirmava
que o pré-cadastro estava feito. Lei 3: preencheu a lacuna com o plausível.

**Rótulo:** PROVADO na primeira metade (regra presente e omitida, tool chamada);
**INFERÊNCIA** na segunda (que a confabulação decorre do contexto contraditório — as duas
metades estão provadas, a ligação é dedução).

**Camada:** 2 → 3. **Classificação:** **(1) derivado de A1** — some quando o estado for
verdadeiro. Enquanto A1 existir, isto é sintoma, não defeito autônomo. **Não vira regra nova no
prompt** (o prompt já tem a regra).

---

### A4 · (P1) "Me mostra as opções primeiro" — quem mandou ignorar foi o servidor

**Conversa:** `aebac770` (Claudinei, 15/08 12:08:53). É o item 3 da sua lista, e o achado
inverte a leitura.

**PROVADO:** o analyzer entendeu perfeitamente —
`intent=wants_more_options | "é um pedido de expansão de opções, não uma resposta ao budget de
parcela"`. O modelo **tentou obedecer**: `[turn-trace] toolsCalled:["search_groups"],
artifactCount:0`. Mas `identityCollected=false`, e `tool-policy.ts:150-152` retira
`DISCOVERY_AND_REVEAL_CARDS` do toolset até a identidade existir — corretamente, é invariante
da Bevi.

O `ToolNode` do LangGraph devolve `ToolMessage{status:"error", content:'Error: Tool
"search_groups" not found.'}` sem estourar (`handleToolErrors` default `true`). O
`reescreverToolMessagesComFalha` (`tool-falha.ts:120-137`) captura isso — **funcionou, é o
FIX de 13/08 fazendo o trabalho dele** — e injeta:

> "Siga a conversa normalmente com o que você já sabe, **conduzindo para a próxima informação
> que você ainda precisa do cliente**."

**O modelo obedeceu essa instrução ao pé da letra** e repetiu a pergunta da parcela. Do lado do
cliente: "pedi para ver as opções e ele me ignorou". O guard evitou a mentira técnica e criou o
silêncio sobre o pedido.

**Causa-raiz dupla:**
1. **`orientarSobreToolAusente` não devolve o MOTIVO ao modelo.** O cliente fez um pedido
   legítimo; existe uma explicação honesta e vendedora ("as ofertas são reais e a administradora
   exige CPF antes de liberar"); o servidor manda mudar de assunto. **`tool-falha.ts:134`**.
2. **A costura #2:** `search_groups` é citada **11 vezes** no `system-prompt.ts`
   (linhas 52, 187, 214, 250, 455, 491, 561, 647, 952, 1220) como tool do modelo, e na fase
   `qualify` ela não está no bind. O texto ensina a tool; o bind nega. O dossiê de 13/08 fechou
   a instância (a directive do reveal) e escreveu "a classe continua aberta" — **está aberta,
   e cobrou 2 dias depois**.

**Camada:** 2 (contexto). **Classificação:** **(2) código** para o item 2 (o texto sobre tool
tem que DERIVAR do bind); **(2) código** para o item 1 (a conduta é função do estado, não uma
frase fixa).

---

### A5 · (P1) Duas perguntas na mesma tela — e o "Apartamento" que ninguém disse

**Conversa:** `044bb367` (Sheila, 14/08). É o item 2 da sua lista, e são **dois** defeitos de
naturezas diferentes.

**5a — A colisão de perguntas. PROVADO.**

```
14:57:21  modelo:  "que tipo de imóvel você está procurando e em qual região?"  [gate=name]
14:57:35  Sheila:  "Pode me chamar de Casa"
14:57:35  servidor: "Pode me dizer como prefere ser chamado(a)?"   ← turn-trace durationMs=9
```

`durationMs: 9`, zero tools: é a pergunta enlatada do gate `name`, disparada pelo servidor **no
mesmo instante** em que a pergunta do modelo (sobre tipo de imóvel) estava na tela. Sheila usou o
template do card de nome ("Pode me chamar de ___") para responder a pergunta do MODELO ("Casa").
É a mesma família do "Uns R$ 1.500.000 então, é isso?" do dossiê de 14/08: **dois perguntadores,
uma tela, e o servidor atribui a resposta à pergunta errada.**

**Camada:** 1 + 4. **Classificação:** **(2) código** — o gate não pergunta o que o modelo
acabou de perguntar; o predicado `modelAsked` hoje é cego (o próprio código admite em
`adapter.ts:583-592`: *"heurística CEGA — a ÚLTIMA sentença do modelo terminou em ALGUMA
pergunta, sem checar se ela tem qualquer relação com o gate corrente"*).

**5b — "Apartamento em Osasco". PROVADO que a origem é o próprio modelo.**
Às 14:57:21 o modelo escreveu os exemplos "(Apartamento, casa, tamanho, bairro…)". Às 14:58:02
Sheila respondeu só "Já Osasco" (`[analyzer] "Menção explícita de localidade (Osasco)"`,
`sub=null`), e o modelo afirmou "Apartamento em Osasco, ótimo!" — **preencheu o slot vago com o
primeiro exemplo da própria lista**. O analyzer do turno seguinte confirma a origem:
*"casa vs apartamento **mencionado antes**"*. Confabulação de entidade (Lei 3), camada 3, sem
nenhum fato de servidor por trás — `desiredItem` só foi gravado depois, como "uma casa".

**Classificação:** **(3) Langfuse/juiz sobre volume.** Não existe fato de servidor que a fala
contradiga (a categoria era `imovel` e continuou `imovel`); qualquer guard aqui seria regex
sobre fala. O sinal certo é um score de **adesão ao dado do cliente**: "o agente atribuiu ao
cliente um atributo do bem que o cliente não disse". Nota: o commit `3fe1e571` já criou um score
de ADESÃO ao dado injetado — é o mesmo eixo e provavelmente o lugar de estender.

---

### A6 · (P1) O funil coleta o prazo DEPOIS de já ter buscado — e nada re-rankeia

**Conversas:** `75f77efd` (Ana pediu 12 meses, levou 47) e `9b9f9aab` (Kairo pediu 120 meses via
`timeframe_120` "Sem pressa, quero menor", levou 48). É o item 5 da sua lista.

**PROVADO pela ordem dos eventos (Ana):**

```
18:57:36  reveal completo, recommendedOffer = ITAÚ 47 meses  (bevi-offer-guard + comparison_table)
18:57:46  [route] gate=timeframe          ← a pergunta do prazo vem AGORA
18:57:57  Ana: "1 ano"
```

**PROVADO no código:** `qualify-state.ts:393` — `if (!meta.searchDispatched) return "search";`
está **antes** do bloco `if (meta.revealCompleted)` que contém `experience`/`timeframe`/`lance`.
É decisão de produto deliberada (FIX-233/D1, "timeframe pós-recomendação, é a ponte natural").
O problema não é a ordem: é que **o ranking tem um fator de prazo que nunca vê o prazo**.
`scoring-input.ts:20` lê `desiredTermMonths: q.prazoMeses ?? 0`, e
`recommendation.ts:92-96`: `termMatchScore(x, 0) = 0.5` — neutro. Para Ana, se o ranking
rodasse depois, `termMatchScore(47, 12) = 0`. E `revealValueTargetChanged` só reabre a busca
quando muda o **valor**, nunca o prazo — nenhum re-rank acontece.

**Seu veredito pedido sobre a Ana:** **é venda consultiva legítima com um defeito de código
embaixo.** O agente foi honesto e bom (18:58:13: *"se você quer aquele carro em um ano, só pagar
a parcela mensal te deixa mais exposta. Você pode contemplar lá pros 47 meses, e aí não bate com
seu prazo"*) — isso é o vendedor que o CLAUDE.md descreve. Mas: (a) o conjunto de ofertas nunca
foi filtrado pelo horizonte dela; (b) `qualifyAnswers.hasLance` ficou `"so_parcela"` mesmo depois
de ela dizer "Prefiro deixar em aberto um lance pequeno lá na frente" (`[analyzer] lance=maybe`
às 18:58:22) — **o estado contradiz a última fala dela**; (c) nada mede se o produto entregue
bate com o que ela pediu. O risco de cancelamento é real e hoje é **não medido**, não
"não existente".

**Camada:** 1. **Classificação:** **(2) código** para o re-rank e para o `hasLance`;
**reconciliação (§5 da doutrina Langfuse)** para o sinal — nunca juiz.

---

### A7 · (P1) O guard de coerência descarta justamente as ofertas longas e baratas

**PROVADO.** Na busca de `9b9f9aab` (20:24:02), `bevi-offer-guard` descartou **7 ofertas** de
carta ≈ R$ 230 mil; na de Ana (18:57:36), 2. Prazos descartados: 55, 70, 80, 80, 88, 96, **115**
meses. A oferta que sobreviveu e virou recomendação: **48 meses, R$ 5.777/mês**.

`ofertaEhCoerente` (`offer-mapper.ts:148-163`) tem dois testes. O primeiro
(`parcela × prazo <= carta`) é invariante de verdade e nasceu de um defeito real. O segundo
compara `parcela × prazo` com o `totalPaid` da própria Bevi e reprova acima de **15% de desvio**.
Recalculando os 7 descartes: desvios de 19,3% · 20,1% · 26,4% · 29,8% · 34% · 56,6% · 75%.

**HIPÓTESE (com o teste que a fecha):** o `installmentValue` da Bevi para planos longos não é
uma parcela constante (escalonamento, seguro, fase reduzida), e por isso `parcela × prazo`
diverge de `totalPaid` **por construção** nos prazos longos — o que faria a tolerância de 15%
descartar sistematicamente a faixa que o cliente de menor renda procura. **Teste que fecha:**
pegar 3 dos `quotaId` descartados (ex.: `6a7b59c125935b16a73162ee`, 115 meses) e conferir o
detalhe do plano contra o cookbook da Bevi — se houver escalonamento documentado, o segundo
teste está errado e precisa comparar contra o campo certo, não contra o produto.

**Por que importa agora:** Kairo clicou "Sem pressa, quero menor" e Ana disse "só a parcela, sem
lance". Os dois pediram a parcela menor; os dois receberam a mesa **já sem** as opções de parcela
menor, e ninguém — nem eles, nem nós — soube disso, porque o descarte é `console.error` sem
score. É um `[sinal sem leitor]`.

**Camada:** 1. **Classificação:** **(2) código** (é dado que vai para a mesa) + **sinal
determinístico** (`ofertas_descartadas` como score, com o `prazo` como dimensão).

---

### A8 · (P0 de observabilidade) A Lei 5 está morta: `tool-io-log.ts` tem zero chamadores

**PROVADO.** `logToolIO` (`tool-io-log.ts:90`), `logToolInputError` (`:140`) e `logToolError`
(`:189`) **não são importados em lugar nenhum de `src/`** (grep exaustivo). O cabeçalho do
módulo diz por quê: *"O primitivo NATIVO do AI SDK 6 pra isto é `onStepFinish`"* — o runtime
migrou para LangGraph e o módulo ficou órfão. **Zero linhas `[tool-io]` no CloudWatch de
produção em 3 dias** (12–15/08). `[tool-policy-violation]`: zero também.

Consequência direta e medida: em `aebac770` o `turn-trace` registra
`toolsCalled:["search_groups"]` porque `addTool` é chamado no evento `tool-call`
(`turn-trace.ts:140,228`) — **a chamada REQUISITADA, nunca o resultado**. A pergunta "a IA
inventou ou pegou de dado real?" só é respondível hoje por inferência temporal, e é exatamente
por isso que os três dossiês consecutivos gastaram metade do esforço reconstruindo timeline.

O LangGraph tem o primitivo nativo: `streamMode: "tools"` emite
`on_tool_start`/`on_tool_end`/`on_tool_error` (confirmado na doc corrente em 2026-08-13,
`@langchain/langgraph` 1.4.8). Instrumentação hand-rolled aqui é dívida evitável.

**Classificação:** **(2) código** — é infraestrutura de prova, não fala.

---

### A9 · (P2) O servidor manda mensagem vazia ao WhatsApp e o alarme de entrega vira ruído

**PROVADO.** 2026-08-14T23:21:38Z, conv `9b9f9aab`:

```
[whatsapp-out:text] to=5562…93 chars=0 text=""
[whatsapp-api] Send failed (400): {"message":"The parameter text.body is required."}
[whatsapp-send-failed] texto falhou, tentando 1× de novo
[whatsapp-out:text] to=5562…93 chars=0 text=""
[whatsapp-api] Send failed (400) …
[whatsapp-send-failed] texto NÃO entregue após retry
```

**Varredura:** **10 envios vazios** em 12–15/08 (6 no dia 14, 4 no dia 13) — num canal que teve
2 conversas reais. Cada um gera 2 erros 400 e uma linha `texto NÃO entregue após retry`, que
lida de fora parece incidente de entrega da Meta e não é.

`sendTextMessage` (`api.ts:97`) não valida string vazia; `sendText` (`adapter.ts:48`) tenta de
novo. **INFERÊNCIA** sobre a origem (as duas metades provadas): o único `sendText` sem guarda de
conteúdo no caminho daquele turno é `adapter.ts:486` (`ev.bridgeText` do evento `transition`), e
o log mostra `[langgraph] roteou pra categoria=auto persona=auto` exatamente naquele turno
(20:21:35).

Na mesma família: `[gate-undelivered]` disparou **9 vezes** nessa conversa; o score
`gate_entregue` já exclui `decision`/`contract` corretamente (`adapter.ts:637-645`), mas o
`console.error` continua gritando para os dois — e o resultado é que **o log de erro do canal é
dominado por falso positivo**.

**Classificação:** **(2) código**, P2 — mas é o P2 que devolve credibilidade ao log.

---

### A10 · O prompt publicado ≠ o prompt do código — dívida de deploy, **não** causa dos defeitos

Verifiquei de forma independente (Langfuse de produção, `/api/public/v2/prompts`, 2026-08-15):

| Prompt | Publicado (`production`) | Código (`develop` @ `0f3c76fd`) | Veredito |
|---|---|---|---|
| `aja-system-prompt` | v3, 2026-08-13T15:50:19Z, 11.360 chars | 11.360 chars | **IDÊNTICOS** — diff vazio |
| `aja-turn-analyzer` | **v1, 2026-08-07T03:02:45Z**, 6.613 chars | 7.054 chars | **DIVERGEM** |

O diff completo do analyzer são **4 linhas**, e só elas — os exemplos de parcela do commit
`3deb8207` (14/08 00:27). Todo o resto é byte a byte igual.

**PROVADO — não existe sinal nenhum dessa divergência.** `fetchManagedPrompt`
(`prompts.ts:22-42`) lê a label `production` e usa o código só como *fallback silencioso*;
`scripts/sync-prompts.ts` é comando manual e **não é referenciado em `.github/`, `infra/`,
`Dockerfile*` nem `docker-compose*`** (grep vazio). O binding repo→runtime é um passo humano.

**NÃO PROVADO, e este dossiê NÃO afirma:** que a divergência causou qualquer defeito de
14–15/08. A evidência aponta o contrário, e eu a medi:

- O ensinamento "200 é parcela, não bem de R$ 200 mil" também vive no `.describe()` do campo
  `parcelaMensal` (`turn-analyzer.ts:75`), que é **schema Zod** e vai ao modelo pelo código,
  sempre.
- Em `aebac770` (15/08 12:09), rodando o analyzer v1 de 07/08, o log de produção traz literalmente
  `"resposta é clara: parcelaMensal=2000"` e o estado gravou `alvoDeBusca:"parcela"`,
  `parcelaAlvo:2000`. **O schema bastou.**
- Ressalva honesta, para não vender a correção como completa: no mesmo turno o analyzer também
  preencheu `creditMax`, e a linha
  `[analyze] creditMax R$ 2000000 nao ancorado na fala do cliente; devolvido a vazio`
  mostra que quem impediu a busca de R$ 2 milhões foi **outro** guard (a ancoragem em texto,
  `langgraph/nodes/analyze.ts:147-156`), não a disciplina do analyzer. Os exemplos ausentes são
  exatamente o que ensina a **exclusão mútua** entre os dois campos. Portanto: **meia correção
  que hoje é salva por uma segunda rede.** Isso é margem consumida, não defeito realizado.

**Veredito:** o P0 aqui é **o sinal ausente**, não o conteúdo do prompt. Classificação **(2)
código**. (Nota: enquanto eu escrevia, a sessão principal entregou isto —
`85b5b325 feat(observabilidade): sinal que pega o prompt publicado diferente do código`,
com `scripts/prompts-check.ts` e `src/lib/observability/langfuse/prompt-drift.ts`. O P0-3 abaixo
vira, portanto, **verificação do critério**, não construção.)

---

### A11 · A mortalidade das 6 conversas — o que dá e o que não dá para afirmar

| Conversa | Canal | Morreu em | Estado final |
|---|---|---|---|
| `e4152a93` | web | **1º turno** (após "Qual é o modelo… hatch, sedan, SUV?") | `qualifyAnswers: {}` |
| `c09bd8de` | web | **1º turno** (após "Como posso te chamar?") | `qualifyAnswers: {}` |
| `044bb367` (Sheila) | web | **turno seguinte ao pedido de CPF+celular** | `identityCollected:false` |
| `aebac770` (Claudinei) | web | **turno seguinte ao pedido de CPF+celular** | `identityCollected:false` |
| `9b9f9aab` (Kairo) | WhatsApp | após a promessa falsa (A1) | `bevi_proposals: 0` |
| `75f77efd` (Ana) | web | fechou | proposta real, `documentos` |

Sua leitura do item 4 está **confirmada**. Mas a atribuição, não:

**As duas mortes no gate de identidade NÃO são explicadas pela copy.** Comparei as quatro falas
de pedido de CPF (Sheila 14:58:30, Claudinei 12:09:14, Ana 18:57:12, Kairo 20:22:04) — são
quase idênticas em estrutura (reconhece o dado + justifica pela administradora + cita LGPD +
`quick_reply`). Duas seguiram, duas morreram. **Com N=4, atribuir isso ao texto seria chute.**

O que **é** afirmável e é estrutural: nos dois abandonos, o cliente vinha de uma sequência de
turnos em que **deu informação e recebeu outra pergunta**. Claudinei é o caso extremo: pediu para
ver as opções (12:08:53) → foi perguntado da parcela → deu a parcela (12:09:14) → foi pedido o
CPF. Três turnos seguidos de "você dá, eu peço mais". Isso é medível sem juiz.

**Classificação:** **(3) Langfuse** para a qualidade da venda da fricção do CPF (juiz + volume,
e a rubrica precisa dizer que "educado e correto sem avançar" vale 0) + **sinal determinístico
de sessão** para a contagem: `pedidos_consecutivos_sem_entrega` e `abandono_no_gate` com o gate
como dimensão. **Não vira regra no prompt.**

---

## §3 · O que NÃO é a causa

Hipóteses plausíveis que descartei, com a base:

1. **"O guard de reserva prematura não roda no WhatsApp" (cobertura de canal).** Falso — sonda B:
   ele não casa com a frase em canal nenhum. O defeito é a lista, não o canal.
2. **"O prompt de produção está desatualizado e por isso o agente erra."** Falso para o
   `system-prompt` (diff vazio) e não demonstrado para o analyzer (§A10) — o único fix ausente é
   suprido pelo schema Zod, com evidência de produção em `aebac770`.
3. **"O modelo alucinou o pré-cadastro."** Falso — foi instruído a fechar pela directive
   (`directives.ts:271`) e nunca informado de que o fechamento não ocorreu. Estado quebrado,
   tradução honesta.
4. **"O modelo ignorou o cliente que pediu as opções."** Falso — ele chamou `search_groups`
   (turn-trace) e obedeceu à instrução do servidor que veio no lugar do erro
   (`tool-falha.ts:134`).
5. **"O agente inventou o prazo de 47 meses para a Ana."** Falso — 47 é o `termMonths` real da
   cota ITAÚ da Bevi, e ele explicitou a incompatibilidade com o prazo de 1 ano dela.
6. **"Alguém apagou a conversa do dossiê."** Falso — `/reset` enviado pelo próprio wa_id,
   às 20:20:53 (§1).
7. **"Falta trava no prompt."** Ao contrário: a regra do A3 já existe no prompt e foi omitida;
   `search_groups` aparece 11× no prompt e é justamente esse excesso que produziu a chamada
   inválida do A4. Estado da arte confirma a direção: shortlist adaptativa de ~7 tools em vez de
   50 sobe Claude Sonnet de 87,1% → 93,1% (arXiv 2605.24660) — **allowlist por fase é ganho de
   acurácia, não só de segurança**, e o texto que contradiz o bind é o oposto disso.
8. **"Trocar de modelo resolve."** Nenhum dos achados é falha de capacidade do modelo. Em 4 dos
   6 casos ele obedeceu com precisão a um sistema que deu ordens erradas ou incompletas.

---

## §4 · Por que os sinais não pegaram (medido, não suposto)

População real: **65 turnos** com `environment=production` na janela 14–15/08 (Langfuse v4,
`/api/public/v3/scores`, paginado por cursor — o filtro `fromTimestamp` **falha calado** e
devolve 0; agreguei client-side).

| Score | Valor | O que isso significa no turno da promessa falsa |
|---|---|---|
| `turno_mudo` | **0,000** | o agente escreveu — e escreveu bem |
| `card_sem_fala` | 0,000 | nada foi podado |
| `artefato_suprimido` | 0,000 | nenhum guard rodou |
| `finish_reason` | `ok` em 65/65 | o turno terminou normalmente, e terminou mesmo |
| `handoff` | 0,000 | ninguém pediu humano |
| `estado_incoerente` | 0,044 | mede faixa invertida e alvo×busca (o defeito de **13/08**) — não mede fala×proposta |
| `judge_avancou` | **0,923** | o juiz mais alto da casa, numa janela em que 4 de 6 conversas morreram |
| `judge_resolved` | 0,538 | — |
| `judge_tone` | 0,703 | — |
| `judge_hallucination` | 0,156 | o juiz **não** viu alucinação onde a promessa era falsa |
| `gate_entregue` | 0,312 (`gate_afundado`: credit 7, identify 2, desire 2) | o único sinal vermelho — e aponta para outro lugar |
| `tool_falhou` | n=7 (`search_groups` `ausente` ×1, `present_quick_reply` `erro` ×6) | **funcionou**: pegou o A4. Ninguém leu |
| `valor_revertido` | n=5, todos 1 | a rede de ancoragem trabalhou 5 vezes em 2 dias |
| `conversao` | **n=1** | não existe denominador de sessão |

**O diagnóstico do painel, em uma frase:** todo sinal existente mede **"a máquina falhou?"** ou
**"a prosa ficou boa?"**. Nenhum mede **"o que o agente DISSE bate com o que o sistema FEZ?"**.
O turno que prometeu um contrato inexistente é verde em 100% dos indicadores.

Isso é literatura, não opinião: falso sucesso / falha silenciosa responde por **45–48%** das
falhas em τ²-bench e **75,8%** em AppWorld, e **juiz de LLM tem AUROC ≤0,65** nessa classe
porque ancora em linguagem confiante — enquanto um detector barato ancorado em ESTADO chega a
0,83–0,95 e recupera 4–8× mais falsos sucessos com ~3300× menos latência (arXiv 2606.09863,
jun/2026). O `judge_hallucination` = 0,156 nesta janela é exatamente o comportamento previsto.

**E há um segundo padrão, no formato dos próprios sinais.** `busca-scores.ts:1` abre com *"Os
sinais da BUSCA — o que faltava para a conversa de 13/08 ter acusado algo"*;
`funil-scores.ts:96` nasceu do turno mudo de `04fda013`; `scoresDeFalhaDeTool` nasceu de
`a68b1945`. **Cada rodada adiciona o sinal que teria pego o incidente anterior.** Isso é
blocklist aplicada à observabilidade — a Lei 2 do lado do painel — e por construção o próximo
incidente cai fora. O que falta é o sinal **de classe**: reconciliação fala×estado e score de
SESSÃO.

---

## §5 · Ordem de conserto

Cada item traz o critério de aceite objetivo. Cada P0 cabe numa sessão.

### P0-1 · [código] O aceite estruturado escreve o aceite, nos dois canais

**Arquivos:** `src/lib/whatsapp/interactive-handlers.ts:797-826` · `src/app/api/chat/route.ts:860-890`
· escritor comum novo (sugestão: `src/lib/agent/aceite.ts`).

**O que fazer:** `handleInterest` passa a resolver o `replyId` (`interest_<groupId>`) contra
`listShownOffersForConversation` — mesma precondição do web (`route.ts:485-503`) — e gravar
`escolha` quando o groupId confere; `decision_contratar` (que não carrega groupId) grava
`decisionAccepted: true`. Os dois canais chamam **a mesma função**.

**Critério de aceite (TDD):**
1. Teste de integração: conversa WhatsApp com `decisionDispatched=true` + clique
   `interest_<groupId válido>` → `nextGate(meta) === "contract"` e o `contract_form` é emitido no
   turno seguinte. **Hoje falha** (sonda A).
2. Teste de integração: clique `decision_contratar` → `decisionAccepted === true`.
3. Teste negativo: `interest_<groupId que não foi exibido>` → **não** grava `escolha` e loga o
   aviso (paridade com `route.ts:503`).
4. **Teste de paridade de canal** (é este que fecha a classe, não os três acima): tabela de ações
   de aceite × canal; para cada ação, o `nextGate` resultante tem que ser **o mesmo** nos dois
   canais partindo do mesmo `meta`. Falha se um canal ganhar uma ação que o outro não tem.

### P0-2 · [eval] Reconciliação fala×estado, como score determinístico de SESSÃO

**Arquivo:** `src/lib/observability/langfuse/` (ao lado de `funil-scores.ts`), emitido pelo sink
do TurnTrace.

**O que fazer, sem juiz e sem regex:**
- `funil_travado_no_fecho` (booleano, por turno): `decisionDispatched === true` **e**
  `contractFormDispatched !== true` **e** já se passaram ≥ 2 turnos de usuário desde o dispatch.
  Dimensão categórica: `channel`.
- `venda_prometida_sem_proposta` (booleano, por **sessão**, via
  `POST /api/public/v3/scores` com `sessionId`): a conversa alcançou
  `maxStageReached='em_negociacao'` **e** `bevi_proposals = 0` no fecho da sessão.

**Critério de aceite:** rodando sobre `9b9f9aab`, os dois valem 1. Rodando sobre `75f77efd`,
valem 0. Rodando sobre as 25 conversas web do banco, a taxa de `funil_travado_no_fecho` é ≤ o
número de conversas com `decisionDispatched` sem `contractFormDispatched` (hoje 2 de 8).
Depois de P0-1, o esperado no WhatsApp é **0**.

> **Por que score de sessão e não juiz:** 20 passos a 95% dão 36% de ponta a ponta. O juiz
> julgou este turno com 0,92 de `judge_avancou`. Se dá para provar em código, não se gasta juiz.

### P0-3 · [código] Sinal de divergência prompt publicado × prompt do código

**Arquivos:** `scripts/sync-prompts.ts` (já existe) + verificação no boot/CI.

**O que fazer:** no boot da aplicação, comparar hash do texto publicado (label `production`)
com o hash da constante do código, para os dois prompts; divergiu → `console.error` **e** score
`prompt_desync` (categórico com o nome do prompt). No CI, um check que falha o PR quando
`system-prompt.ts` ou `turn-analyzer.ts` mudam sem o sync correspondente registrado.

**Estado:** **ENTREGUE** em `85b5b325` durante esta revisão. O que falta é conferir o critério.

**Critério de aceite:** rodado contra produção HOJE, tem que acusar **`aja-turn-analyzer`** e
**não** acusar `aja-system-prompt` — esse é o teste que separa um detector que funciona de um que
compara a coisa errada (os dois prompts divergem em tamanho, mas só um diverge em conteúdo).
Confirmar também que o sinal é **score**, não só `console.error`: o precedente de
`[gate-undelivered]` (8 afundamentos em 4 dias sem ninguém ver) é a razão de a doutrina exigir
score sobre log.

**Duas lacunas que revisei no que foi entregue** (a lógica de comparação está certa — compara por
CONJUNTO de linhas e reporta as duas direções, inclusive `sobramEmProducao`, que é o caso pior:
texto editado na UI sem review):
1. `compararPromptPublicado` só é chamado por `scripts/prompts-check.ts` (`pnpm prompts:check`), e
   **`prompts-check` não aparece em `.github/`** — hoje é comando manual, exatamente como o
   `sync-prompts` que ele existe para vigiar. Um vigia manual do descuido manual não fecha o laço.
   → precisa ser step de CI.
2. CI pega "o código mudou e ninguém publicou". **Não pega** "alguém editou na UI depois do último
   CI" — o cache é de 60 s e o agente muda sem deploy. Para essa direção o sinal tem que ser de
   RUNTIME: `fetchManagedPrompt` já tem o texto publicado e o fallback do código na mão; comparar
   os hashes ali e emitir o score `prompt_desync` custa uma linha e cobre as duas direções o tempo
   todo.

### P0-4 · [código] Observabilidade de tool I/O viva no runtime atual

**Arquivos:** `src/lib/agent/langgraph/` (o nó de conversa) · `src/lib/agent/orchestrator/tool-io-log.ts`.

**O que fazer:** ligar o primitivo nativo do LangGraph (`streamMode: "tools"` →
`on_tool_start`/`on_tool_end`/`on_tool_error`) ao `logToolIO`/`logToolError` já escritos e
mascarados. Não escrever instrumentação nova.

**Critério de aceite:** um turno de produção com tool-call produz ≥1 linha
`{"source":"tool-io", …}` com `conversation_id`, args e output mascarados; um turno com tool fora
de fase produz `{"source":"tool-error", …}`. Hoje: zero em 3 dias.

### P1-1 · [código] O texto sobre tool DERIVA do bind

`src/lib/agent/system-prompt.ts` (10 ocorrências de `search_groups`) + teste de invariante:
nenhum nome de tool citado no system prompt/directive pode estar fora de `allowedTools(meta)`
para a fase em que aquele bloco é injetado. **Aceite:** o teste falha hoje e passa depois da
limpeza; `tool_falha_tipo="ausente"` cai para 0 na semana seguinte.

### P1-2 · [contexto] `orientarSobreToolAusente` devolve o MOTIVO, não "mude de assunto"

`src/lib/agent/langgraph/tool-falha.ts:120-137`. O ramo `buscaJaFeita !== true` passa a informar
o fato ("a administradora exige CPF e celular antes de liberar oferta real") e a deixar a
condução com o modelo, em vez de mandar seguir para a próxima coleta. **Aceite:** cenário de eval
"cliente pede para ver as opções antes da identidade" → a resposta reconhece o pedido e explica
a razão; hoje ela repete a pergunta anterior.

### P1-3 · [código] O gate não pergunta o que o modelo acabou de perguntar

`src/lib/whatsapp/adapter.ts:583-604` e o emissor de card de gate na web. Trocar a heurística
cega `modelAsked` por uma checagem de RELAÇÃO com o gate corrente (o próprio código já
documenta o defeito). **Aceite:** teste com o turno real da Sheila — modelo pergunta tipo/região
e o card do gate `name` **não** sai no mesmo turno.

### P1-4 · [código] O prazo volta a valer depois de coletado

`qualify-state.ts` + `recommendation.ts:197`. Resposta do gate `timeframe` (e mudança de
`hasLance`) re-rankeia o conjunto **já buscado** (não precisa re-buscar na Bevi) e reancora
`recommendedOffer`. **Aceite:** com as ofertas reais de `75f77efd` e `prazoMeses=12`, o hero muda
ou o código registra explicitamente que não há oferta compatível — e `hasLance` passa a refletir
a última fala do cliente (`lance=maybe`), não a primeira.

### P1-5 · [código] O descarte de oferta vira sinal antes de virar decisão

`bevi-self-contract-adapter.ts:195-210` + score `ofertas_descartadas` (numérico) com `prazo` como
dimensão. **Aceite:** o painel mostra quantas ofertas o guard tira por busca e de que prazo.
Só depois disso mexer na tolerância de 15% (§A7 é HIPÓTESE até o teste contra o cookbook).

### P2-1 · [código] Nunca enviar corpo vazio ao WhatsApp

`api.ts:97` (guarda em `sendTextMessage`) + `adapter.ts:486` (guarda em `bridgeText`).
**Aceite:** zero `chars=0` no log; zero 400 "text.body is required".

### P2-2 · [código] `/reset` não destrói a prova

`processor.ts:70-79` e `app/api/chat/reset/route.ts:97-100`: `deleted_at` em vez de `DELETE`,
mantendo purga de memória e troca de cookie. **Aceite:** depois de um `/reset`, a conversa some
da UI e continua consultável por `id`.

---

## §6 · O que NÃO deve ser consertado em código

1. **A frase "você está oficialmente pré-cadastrado" — não entra no sanitizer.** É a 6ª rodada
   do jogo que `649320dc` reverteu, e o CLAUDE.md já registra por quê. Consertado o estado
   (P0-1), a frase vira verdade e o guard atual, ancorado em `hasProposal`, passa a fazer sentido
   sozinho. Se quiser cobertura antes disso, o caminho é o score de sessão (P0-2), não o regex.
2. **"Apartamento em Osasco" — não vira guard.** Não existe fato de servidor que a fala
   contradiga; é julgamento de aderência ao que o cliente disse → juiz/eval sobre volume,
   estendendo o score de adesão de `3fe1e571`.
3. **A copy do pedido de CPF — não mexer por causa destas duas conversas.** As quatro falas são
   praticamente iguais e duas converteram. N=4 não sustenta mudança; sustenta instrumentação.
4. **Nenhuma regra nova no `system-prompt.ts`.** A regra do A3 já está lá e foi omitida; o excesso
   de menção a tool no A4 é parte da causa. O movimento correto nesta rodada é **remover** texto
   (P1-1), não acrescentar.
5. **A ordem do funil (busca antes de prazo) — não inverter.** É decisão de produto registrada
   (FIX-233/D1) e boa: mostrar oferta cedo é o que segura o cliente. O defeito é o ranking não
   voltar depois (P1-4), não a ordem.
6. **Não trocar de modelo, não introduzir multi-agente.** Nada nesta janela é falha de capacidade
   do modelo, e a literatura corrente aponta que a maioria dos defeitos que veríamos é de
   especificação de um agente só.

---

## §7 · Sondas (reproduzíveis)

Arquivo: `/private/tmp/claude-501/-Users-kairo--superset-worktrees-ac2f26b2-a2ba-4148-96b8-47b55f0dd5ad-basalt-starburst/7133e5c3-b5a8-457c-b018-77696863ead1/scratchpad/sonda-dossie-2026-08-15.test.ts`
(copiar para `src/` e rodar `npx vitest run`). **10 asserções, 10 verdes** contra a `develop` em
`0f3c76fd`.

- **Sonda A — o funil do WhatsApp não alcança `contract`.** Com a metadata literal de
  `9b9f9aab` (copiada do banco de produção): `nextGate(meta) === "decision"`. Com
  `decisionAccepted: true` → `"contract"`. Com `escolha` → `"contract"`.
- **Sonda B — o guard não cobre a fala nova.** `isPrematureReservationClaim(..., {hasProposal:false})`
  devolve `false` para as 4 falas reais de `9b9f9aab` e `true` para as 2 falas do incidente de
  13/08.
- **Sonda C — nada que o cliente fez escreve o aceite.** `detectYesNoText` devolve `null` para
  `""`, `"02874137138"`, `"62992496793"`, `"Seguir agora"`, `"Tenho interesse!"`; e `true` para
  `"sim"` e `"Ok"` — a palavra que salvou a venda da Ana.
- **Sonda D — diff dos prompts gerenciados.** Extração das constantes do fonte × texto publicado
  no Langfuse de produção: `aja-system-prompt` diff vazio (11.360 = 11.360);
  `aja-turn-analyzer` diff de exatamente 4 linhas (6.613 → 7.054).
- **Varredura no banco (SQL, somente leitura):** funil por canal —
  web 25 conversas / 11 reveal / 8 decision / 6 aceite / 6 form / 5 fechadas / 6 com proposta;
  WhatsApp 1 / 1 / 1 / **0 / 0 / 0 / 0**.
- **Varredura no CloudWatch:** 10 `[whatsapp-out:text] chars=0` em 12–15/08; 0 linhas
  `[tool-io]`; 0 linhas `[tool-policy-violation]`; 7+2 `oferta_incoerente_descartada` nas duas
  buscas da janela.

---

## §8 · O que medir depois (e o valor esperado)

| Sinal | Hoje | Esperado após o P0 |
|---|---|---|
| `venda_prometida_sem_proposta` (sessão) | não existe; valeria 1 em `9b9f9aab` | 0 em 100% das sessões WhatsApp que clicam o aceite |
| `funil_travado_no_fecho` (turno, dim. `channel`) | não existe; valeria 1 em 6 turnos de `9b9f9aab` | 0 no WhatsApp; ≤ a taxa atual da web (2/8) |
| `prompt_desync` | não existe | acusa `aja-turn-analyzer` **hoje**; 0 após o sync |
| linhas `[tool-io]` / dia | **0** | ≥1 por turno com tool-call |
| `tool_falha_tipo="ausente"` | 1 em 2 dias | 0 após o P1-1 |
| `[whatsapp-out:text] chars=0` | 10 em 4 dias | 0 |
| `gate_entregue` | 0,312 | subir — mas medir só depois de separar o falso positivo de `decision`/`contract` do log |

E a pergunta que fecha a próxima rodada: **em quantas conversas isso acontece?** Hoje a resposta
para o WhatsApp é "1 de 1" porque `/reset` apagou a outra. Com P0-2 e P2-2, a terceira rodada
começa com contagem, não com anedota.
