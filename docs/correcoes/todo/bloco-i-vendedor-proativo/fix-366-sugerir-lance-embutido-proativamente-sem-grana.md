---
id: FIX-366
titulo: "Investigar paralelização segura da busca de grupos com/sem lance embutido; sugerir lance embutido proativamente quando o cliente não tem aporte"
status: todo
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/orchestrator/embedded-bid-payload.ts
rodada: 2026-07-22 — campanha vendedor-matador-consorcio (goal doc .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md, ITEM 4)
---

## Palavras do operador
> "Nesse caso aqui eu preciso: se eu falo que não tenho grana agora, lembra que a gente comentou que sugeriria o lance embutido? Para ajudar ele no lance, tem que ter aquela dinâmica que a gente tinha combinado de falar: 'Cara, tem uma opção aqui, você já ouviu falar de lance embutido? É uma opção interessante...' E aí já traz isso pra ele. [...] Eu preciso que você, em background, assim que buscar os grupos do valor que ele pediu — já era bom, na sequência, em background, sem afetar a performance — buscasse também os grupos do lance embutido, entendeu? Deixasse na memória o lance embutido ali, só que sem ele falar nada ainda, beleza? Aí, quando chegar no step onde ele fala que tem a grana ou não tem a grana, com a inteligência do agente ele vai falar: 'Cara, eu vou te sugerir... funciona assim, é mais vantajoso, aí você consegue contemplar antes e já está com as opções do lance embutido na mão.' E mostrar pra ele umas opções com o lance embutido. Em seguida tem que explicar pra ele que você começa pagando — até ser contemplado, sua parcela fica em um valor alto, mas logo que você é contemplado, como você amortiza, a parcela fica baixa — então você consegue pegar parte da carta e mesmo assim tem vantagem, entendeu? Tem que agir como vendedor mesmo, inteligente. Por isso eu estou te pedindo pra melhorar esse fluxo ali, tá ruim, sabe."

## Cenário exato
- **Rota/tela:** Chat web/WhatsApp, consórcio Itaú, R$ 81.973,00 — pós-simulação de 3 cenários
  (evidência em `docs/correcoes/inbox/_evidencia/2026-07-22-sugerir-lance-embutido-proativamente-sem-grana.png`).
- **Passos:** 1) Agente monta 3 cenários e pergunta se o cliente teria como dar um lance 2)
  Cliente responde "Por enquanto não" 3) Agente segue com os 3 cenários padrão sem citar lance
  embutido.
- **Dados usados:** N/A.

## Esperado × Atual
- **Esperado:** (1) busca dos grupos com/sem lance embutido acontece cedo, sem atrasar a
  resposta principal; (2) quando o cliente diz que não tem aporte, o agente sugere
  proativamente o lance embutido com a vantagem certa; (3) explica a mecânica parcela
  alta→baixa.
- **Atual:** agente aceita o "não tenho aporte" e segue reto pros 3 cenários padrão, sem citar
  lance embutido.

## Root cause (INVESTIGADO — com ressalva importante sobre viabilidade da parte 1)
`src/lib/adapters/bevi/bevi-self-contract-adapter.ts:311-349` (`offersForValue`) busca grupos
COM e SEM lance embutido **sequencialmente** (baseline sem embutido `:327`, `sleep` `:330`, com
embutido `:332`). **⚠️ Isso pode NÃO ser descuido paralelizável:** `ensureOffers` (`:261-296`)
muta estado compartilhado da MESMA proposta ativa na Bevi (`this.proposalReady`, `setSegment`
`:282-284`, `offerCache`, `offerIndex`), e comentários `:351-369` documentam que a Bevi opera
com **"1 proposta ativa, re-PATCH sequencial" (cookbook §3)**. Paralelizar 2 chamadas que fazem
`setSegment` na mesma proposta pode corromper o resultado. **Investigar antes de paralelizar
— não crave sem evidência.**

Separadamente: a lógica de ramificação não está em `gate-questions.ts` (só tem strings de
copy) — está em `qualify-state.ts` (`nextGate:237-398`). A linha `:398` mostra que
`hasLance:"no"` **já roteia pro gate `lance-embutido`** — a infra pra perguntar já existe; falta
o agente oferecer com o ângulo comercial certo. `embedded-bid-payload.ts:14-15,49` já explica o
lance embutido focado em "o crédito diminui" — falta o ângulo "parcela alta até contemplar, cai
depois da amortização".

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Investigar se a Bevi tolera 2 chamadas concorrentes na mesma proposta ativa (checar doc/cookbook da API, ou testar contra sandbox); SE tolerar, paralelizar `offersForValue`; SE NÃO tolerar, buscar o embutido em background sem usar a mesma proposta ativa (ex.: 2ª sessão/proposta), documentando a decisão no `.done/` | `bevi-self-contract-adapter.ts` |
| Reforçar via prompt/directive (não regex) a sugestão proativa de lance embutido quando `hasLance:"no"` e já há oferta pré-buscada | diretivas do orquestrador (perto de `gate-questions.ts`/`qualify-state.ts`) |
| Reforçar o texto de explicação com o ângulo "parcela alta até contemplar, cai depois da amortização, ainda vale a pena" | `embedded-bid-payload.ts` |

## Regressão exigida
**TDD strict** só na parte (1) — mecânica/invariante: teste que prova que a busca do lance
embutido não corrompe/atrasa perceptivelmente o resultado do baseline (comparar tempo e
integridade da oferta antes/depois da mudança). A parte comercial (sugestão proativa/copy) **não
tem TDD** — é comportamento do modelo, validado pelo juiz na fase de verificação da campanha
(dossiê de conversa dos 3 cenários E2E), não por asserção de texto exato.
