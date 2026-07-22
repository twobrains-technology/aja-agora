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
  - (a confirmar — ver achados do find-code sobre gate de lance, busca de grupos na Bevi e lance embutido)
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

## Pista de causa (A CONFIRMAR — não investigado a fundo)
Já existe bastante infraestrutura de "lance embutido" no código (`contemplation-dial.ts`, `plan-estimate.ts`, `embedded-bid.tsx`, gate em `lance-embutido-gate.test.ts`) — não é feature do zero, é **ligar/melhorar um fluxo que já existe parcialmente**. Falta confirmar: (1) se a busca de grupos na Bevi já dispara em paralelo pro lance embutido ou só sob demanda; (2) se o gate/orquestrador, ao receber "não tenho aporte", já tem ramificação pra oferecer lance embutido ou simplesmente segue o funil padrão; (3) se falta só copy/prompt (regra: conversa é do modelo, não trava-se em regex) ou se falta de fato o pré-fetch em background (isso sim é código determinístico, pela regra do projeto "invariante verificável vira código"). Busca ampla disparada via `find-code` — resultado ainda pendente no momento da captura deste card; atualizar `mexe_em:` e esta seção assim que chegar.
