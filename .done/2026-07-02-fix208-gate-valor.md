# FIX-208 — o funil não trava no gate de VALOR (número nu / analyzer neutral)

**Data:** 2026-07-02 · **Branch:** `fix/funil-gate-valor` (fork de `fix/funil-nao-trava`, com FIX-206/207)

## O problema (o print do Kairo, WhatsApp PROD)

O agente pergunta "Quanto custa o carro?" e o usuário responde do jeito mais natural
do mundo:

- **"200"** → o agente: **"Acho que me perdi por aqui. Pode mandar de novo, por favor?"**
- **"200 mil reais"** → **o mesmo "me perdi" de novo.**

É o pior momento possível pra travar: o cliente acabou de dizer quanto quer gastar —
o dado central da recomendação — e o produto responde que "se perdeu". Confiança
quebrada bem no ponto de qualificação.

É a **mesma classe** do FIX-206 ("o funil suprime o gate contando com o próximo turno
do usuário e fecha mudo"), mas num ponto que o 206 não cobriu: o gate de **VALOR**
(`credit`), em turno de **usuário**.

## A causa (investigada e confirmada em cassette)

Três elos se somam:

1. **Captura frágil.** `parseAssetValue("200")` é `null` **por design** — número nu
   pequeno é ambíguo demais fora de contexto. E o analyzer (Haiku) cai em
   `NEUTRAL_FALLBACK` no timeout de cold-start: valor não capturado, intent `neutral`.
2. **Gate pulado.** Com a qualificação já em curso, `decideShowGate(credit, neutral)`
   retornava **false** — o heurístico "neutral → fica conversacional" (que vale
   pós-reveal) suprimia o gate de coleta.
3. **LLM muda.** O system-prompt manda ser reativa na coleta → sem gate e sem texto,
   o turno fecha **mudo** → dispara o `EMPTY_TURN_FALLBACK` ("me perdi").

## A cura — defense-in-depth (as 3 camadas juntas, decisão do Kairo)

Invariante (Lei 4, em CÓDIGO, não regra-no-prompt): **durante a coleta ativa, um gate
de coleta respondido NUNCA fecha mudo — ou avança, ou re-pergunta.** Cobre WhatsApp
**e** web.

| Camada | O quê | Onde |
|---|---|---|
| **Captura** | `parseAssetValue` reconhece número nu no contexto do gate `credit` ("200"→200 mil, escala p/ milhares quando abaixo do piso da faixa e clampa na categoria). Conservador: só quando o gate `credit` está pendente e a mensagem é essencialmente o número (não crava valor de "e a taxa de 2%?"). | `parse-asset-value.ts` + `orchestrator/analyze.ts` (passa o contexto) |
| **decideShowGate** | Responder direto um gate de COLETA (`credit`/`lance`/`lance-value`/`lance-embutido`) dispara o gate mesmo em `neutral`. Perguntas/dúvidas/off-topic seguem deixando conversar. Estende o auto-avanço do FIX-206 (não sobrescreve). | `qualify-state.ts` (`COLLECTION_GATES`) |
| **Guard (rede final)** | Turno-mudo com gate de coleta pendente re-emite a **pergunta do gate** (`reengageQuestionForGate`), nunca "me perdi". Nos 2 canais. Restrito à mesma classe do decideShowGate — preserva o fallback honesto do FIX-172 nos demais gates. | `whatsapp/adapter.ts` + `app/api/chat/route.ts` (helper puro em `gate-reengage.ts`) |

## A prova (TDD strict — vistas FALHAR antes)

- **Camada 1 (estrutural):** `parse-asset-value.test.ts` (número nu no contexto credit),
  `qualify-state.funil-gate-valor.test.ts` (gate de coleta dispara em neutral),
  `gate-reengage.test.ts` (`reengageQuestionForGate`).
- **Camada 2 (cassette):** `agent-trajectory.test.ts` → describe **FIX-208** — analyzer
  em neutral + "200"/"200 mil reais": o valor É capturado, o funil avança pra `lance`,
  o gate dispara. Revertendo a produção, o assert `decideShowGate(credit, neutral)=true`
  virava `false` (o bug reproduzido).
- **Camada 3 (eval, nightly):** `agent-flow.eval.test.ts` — persona responde o valor
  por número nu; assert que **não** aparece "me perdi" e o funil avança.

**FIX-206/207 seguem verdes.** Gate `pnpm test:unit` **100% verde** (267 arquivos,
2651 testes) validado em container transitório (node:22-alpine + Postgres migrado).

## Nota de higiene (fora do escopo, mas corrigido — regra "erro que vê, corrige")

7 testes do **FIX-INTEGRIDADE** (PR #46, já na base) estavam vermelhos por terem ficado
**órfãos** após um refactor de assinatura (`buildSearchSummaryDirective` virou objeto;
o guardrail de teto migrou pro `SPECIALIST_BASE_PROMPT`). A **feature de produto está
intacta** — só os testes apontavam pro lugar errado. Corrigidos num commit `test:`
separado, sem tocar produção.
