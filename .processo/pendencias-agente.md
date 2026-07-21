# Pendências do agente — aberto em 2026-07-21

> **Status 2026-07-21:** itens 1-9 RESOLVIDOS (ver git diff do dia).
> Aberto: 10 (conversas órfãs no banco) — depende de decisão do Kairo, porque
> resolver envolve APAGAR conversas. O backfill já impede novas órfãs.
>
> No item 9, sete gates passaram a ser conduzidos pelo grafo no runtime
> langgraph (`experience`, `credit`, `timeframe`, `lance`, `lance-value`,
> `lance-embutido`, `simulator-offer`, `identify`). O gate `name` ficou no
> caminho antigo de propósito: ele roda ANTES de existir persona/categoria, é
> puramente "salva o nome e cumprimenta", e não tem funil a recalcular.

Fila do que ficou aberto na sessão de urgência. Ordem = impacto na venda.

## 1. Copy enlatada ensinando o conselho ERRADO do embutido

`src/lib/agent/orchestrator/gate-questions.ts:25` — `lanceEmbutidoEdu()` é texto
fixo do servidor e diz *"na sua carta de R$ 261.973, você usa uma fatia desse
valor"*. É o oposto da regra que vale hoje: o embutido sai da carta, então quem
vai usá-lo precisa de uma carta MAIOR, não de uma fatia da que já escolheu
(`converse.ts`, `blocoEmbutido`). No WhatsApp esse texto sai no lugar da fala do
modelo — o agente nem chega a falar.

Fere a lei-mãe do projeto (a conversa é do modelo) e contradiz a lógica de
negócio. Some com a função; a educação do embutido é fala, e fala é do modelo.

Visto ao vivo no WhatsApp em 2026-07-21 03:42.

## 2. Lance = bolso + embutido (a conta está pela metade)

`converse.ts`, `blocoLance` compara só o dinheiro declarado com o lance médio e
ignora o embutido disponível. Na carta de R$ 371.973 o embutido de 30% vale
~R$ 111 mil; somado aos R$ 100 mil do cliente dá ~R$ 211 mil contra um lance
médio de R$ 289 mil. O agente precisa dizer isso — inclusive quando a resposta é
"assim não fecha". Hoje ele avalia o lance pela metade e vende contemplação
rápida sem base. É o item 7 do veredito do crítico de negócio.

## 3. WhatsApp: aviso de busca duplicado e fragmentos soltos

`"Consultando as administradoras agora — só um instante."` saiu 2× no mesmo
turno (duas tentativas de descoberta), e vazaram fragmentos (`".."`, `")"`,
`"Opa, deixa eu tentar de outro jeito..."`). Precisa de idempotência por turno no
aviso e de um piso de tamanho no sanitizer pra fragmento não virar balão.

## 4. Escassez com número fabricado

`scarcity-payload.ts:14-19,47` — `availableSlots = 1 + (djb2Hash(groupId) % 6)`.
Não tem relação com a Bevi e chega a contradizer o card ao lado na MESMA tela
(recomendação dizia 8, escassez dizia 4). Usar `offer.availableSlots` real ou não
emitir o card. Também troca o `groupCode` do ObjectId cru pelo código humano.
Risco de CDC art. 37, não só feiura.

## 5. Funil com estado terminal mudo

`qualify-state.ts` — com o funil resolvido a cascata cai em `return "search"` e o
turno sai com `textChars: 0` / `durationMs: 8`. O cliente responde e não recebe
nada. Estado terminal tem que ir pra proposta/fecho, e turno nenhum pode sair
mudo.

## 6. Cards em avalanche e repetidos

`emit-card.ts` — 4 cards no mesmo turno (comparativo + recomendação + escassez +
decisão), o bloco inteiro repetido 47s depois, e `embedded_bid` duplicado com
20ms de diferença. Teto de 1 card por turno e dedupe por `(tipo, hash do
payload)` na conversa inteira, não só no turno.

## 7. O gate do "por que agora" nunca pergunta

`qualify-state.ts` + `analyze.ts` — `desireAsked`/`desireAnswered`/`motivation`
já chegam preenchidos da primeira frase ("quero um carro"), então o gate se
auto-satisfaz e a pergunta que o mockup trata como o coração da venda simplesmente
não acontece. `desireAnswered` só deveria valer com um motivo narrativo.

## 8. Ranking ignora a capacidade de lance

`recommendation.ts` — ranqueia por carta e parcela; o cliente diz que tem R$ 100
mil, o grupo recomendado pede R$ 183 mil de lance médio e ninguém confronta. O
`monthlyFit` sai 0 e o card segue rotulado como a melhor opção.

## 9. Handlers de gate fora do grafo (dívida estrutural)

`route.ts` tem handler dedicado para cada gate (`experience`, `timeframe`,
`lance`, `simulator-offer`, `identify`, `credit`…) — herança do runtime Vercel.
Eles gravam no meta e despacham cards por `pipeGatePrompt`, sem passar pelo grafo
e sem chamar o modelo (turnos de 8-11ms). O do `lance-embutido` já foi desviado
pro grafo em 2026-07-21; os outros seguem. É a fonte mais provável dos próximos
"travou e não seguiu".

## 10. Conversas órfãs no banco

Conversas criadas antes de o cookie `aja_uid` existir ficaram sem `webCookie` e
são invisíveis pro resume. O backfill já corrige daqui pra frente; as antigas
seguem órfãs até serem tocadas. Limpar exige apagar conversas — decisão do Kairo.
