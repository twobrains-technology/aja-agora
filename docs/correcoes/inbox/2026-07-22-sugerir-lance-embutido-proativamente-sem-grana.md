---
slug: sugerir-lance-embutido-proativamente-sem-grana
titulo: "Quando o cliente diz que não tem aporte/lance agora, o agente deve sugerir proativamente o lance embutido (com os grupos já pré-buscados em background) e explicar a dinâmica de parcela alta→baixa"
status: inbox
severidade: media
projeto: aja-agora
rodada: 2026-07-22 — Kairo revisando o fluxo de lance após simulação de cenários
evidencia:
  - _evidencia/2026-07-22-sugerir-lance-embutido-proativamente-sem-grana.png
mexe_em:
  - src/lib/agent/orchestrator/gate-questions.ts:156 (pergunta sobre aporte/lance pra antecipar contemplação)
  - src/lib/agent/orchestrator/gate-questions.ts:160-165 (LANCE_EMBUTIDO_ASK — hoje só é oferecido se perguntado nesse ponto específico)
  - src/lib/agent/orchestrator/gate-questions.ts:239-240 (resposta quando cliente recusa lance embutido — hoje fecha a porta: "vou seguir sem considerar... se quiser, a gente volta depois", não é reaberta proativamente no gate de "não tenho aporte")
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts:311-349 (offersForValue — busca COM e SEM embutido, mas SEQUENCIAL com sleep entre elas, não em paralelo/background)
  - src/lib/agent/orchestrator/embedded-bid-payload.ts:14-15,49 (texto de explicação do lance embutido já existe, mas é sobre "o crédito diminui" — falta o ângulo comercial pedido: parcela alta até contemplar, depois cai)
---

## Palavras do operador
> "Nesse caso aqui eu preciso: se eu falo que não tenho grana agora, lembra que a gente comentou que sugeriria o lance embutido? Para ajudar ele no lance, tem que ter aquela dinâmica que a gente tinha combinado de falar: 'Cara, tem uma opção aqui, você já ouviu falar de lance embutido? É uma opção interessante...' E aí já traz isso pra ele. [...] Eu preciso que você, em background, assim que buscar os grupos do valor que ele pediu — já era bom, na sequência, em background, sem afetar a performance — buscasse também os grupos do lance embutido, entendeu? Deixasse na memória o lance embutido ali, só que sem ele falar nada ainda, beleza? Aí, quando chegar no step onde ele fala que tem a grana ou não tem a grana, com a inteligência do agente ele vai falar: 'Cara, eu vou te sugerir... funciona assim, é mais vantajoso, aí você consegue contemplar antes e já está com as opções do lance embutido na mão.' E mostrar pra ele umas opções com o lance embutido. Em seguida tem que explicar pra ele que você começa pagando — até ser contemplado, sua parcela fica em um valor alto, mas logo que você é contemplado, como você amortiza, a parcela fica baixa — então você consegue pegar parte da carta e mesmo assim tem vantagem, entendeu? Tem que agir como vendedor mesmo, inteligente. Por isso eu estou te pedindo pra melhorar esse fluxo ali, tá ruim, sabe."

## Cenário
- **Rota/tela:** Chat web/WhatsApp, consórcio Itaú, R$ 81.973,00 — fluxo pós-simulação de 3 cenários (conservador/provável/acelerado).
- **Passos:** 1) Agente monta os 3 cenários e pergunta se o cliente teria como dar um lance (aporte extra) 2) Cliente responde "Por enquanto não" 3) Agente responde só "Tranquilo, Kairo! A gente trabalha com o que você tem" e segue com os 3 cenários — **sem** oferecer o lance embutido como alternativa.
- **Dados usados:** N/A — comportamento de fluxo, vale pra qualquer cliente que negue ter aporte.

## Esperado × Atual
- **Esperado:**
  1. **Performance:** assim que os grupos/cenários do valor pedido são buscados na Bevi, buscar **em paralelo, em background** (sem atrasar a resposta principal) os grupos de **lance embutido** também, guardando na memória da conversa — antes mesmo do cliente mencionar isso.
  2. **Comportamento comercial:** quando o cliente disser que não tem aporte/lance disponível, o agente deve **sugerir proativamente** o lance embutido como alternativa vantajosa ("Cara, tem uma opção aqui... você já ouviu falar de lance embutido?"), já mostrando as opções (que já estavam pré-buscadas).
  3. **Explicação didática:** o agente deve explicar a mecânica — parcela mais alta até a contemplação, depois cai porque parte da carta foi usada pra amortizar — "agir como vendedor inteligente", não só recusar/aceitar o "não" do cliente e seguir em frente.
- **Atual:** O agente aceita o "não tenho aporte" e segue direto pros 3 cenários padrão (só sorteio / lance menor / lance + recursos próprios), sem citar lance embutido como saída pra quem não tem dinheiro agora. Fluxo tratado como "ruim" pelo próprio Kairo.

## Pista de causa (CONFIRMADO por leitura de código — ainda não é root cause fechado, mas já dá pra apontar os dois defeitos exatos)
Confirmado por busca ampla (find-code): existem **dois problemas distintos**, ambos exatamente onde o Kairo apontou:

1. **Performance/pré-fetch (código determinístico, pela regra do projeto):** `bevi-self-contract-adapter.ts:311-349` (`offersForValue`) busca os grupos **COM e SEM lance embutido**, mas de forma **sequencial** (baseline sem embutido na linha 327, depois com embutido na linha 332, com um `sleep` entre as duas chamadas) — não em paralelo/background como o Kairo pediu ("buscasse também os grupos do lance embutido... em background, sem afetar a performance"). Isso é mudança de código puro (paralelizar as duas chamadas), sem tocar em conversa/prompt.
2. **Comportamento comercial (é do modelo/orquestrador, não regra-no-prompt):** em `gate-questions.ts`, o lance embutido só é oferecido se o cliente for perguntado especificamente sobre ele (`LANCE_EMBUTIDO_ASK`, linha 160-165) — e se ele disser "não" ali, a resposta do sistema (linha 239-240) **fecha o assunto** ("vou seguir sem considerar... se quiser, a gente volta depois") em vez de reabrir a sugestão de forma proativa quando o cliente, num momento diferente do funil, disser que **não tem aporte pro lance normal**. Hoje os dois gates (lance normal vs. lance embutido) não parecem conversar entre si — recusar um não aciona automaticamente a oferta do outro como alternativa vendedora.
3. **Explicação didática:** `embedded-bid-payload.ts:14-15,49` já tem texto explicando o lance embutido, mas focado em "o crédito recebido diminui" — falta o ângulo que o Kairo quer explicitamente batido: "parcela alta até contemplar, depois cai porque você amortiza com parte da carta, e ainda assim vale a pena".

**O que falta pra fechar (trabalho de execução, não desta captura):** (a) paralelizar as duas chamadas em `offersForValue` e cachear o resultado do embutido na memória da conversa mesmo sem o cliente ter pedido; (b) no orquestrador, quando o cliente nega aporte pro lance normal, verificar se já há oferta de lance embutido pré-buscada e sugerir proativamente (ajuste de fluxo/prompt, é "do modelo" pela regra do projeto — não travar em regex fixo); (c) enriquecer a explicação do lance embutido com o ângulo comercial de parcela alta→baixa.
