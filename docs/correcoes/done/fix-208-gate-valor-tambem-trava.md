---
id: FIX-208
titulo: "O gate de VALOR também trava: 'Acho que me perdi por aqui' quando o usuário responde o valor do bem — a suposição 'já coberto' (FIX-115/172/189) está errada"
status: done
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/agent/qualify-state.ts
  - src/lib/chat/empty-turn-guard.ts
  - src/lib/whatsapp/adapter.ts
  - src/lib/web/adapter.ts
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/parse-asset-value.ts
  - src/lib/agent/qualify-state.*.test.ts
  - src/lib/agent/parse-asset-value.test.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-02 — print novo do Kairo (WhatsApp prod), sessão principal ("causamos algum bug nas últimas versões")
---

# FIX-208 — O gate de VALOR também trava (corrige a suposição "já coberto" deste bloco)

> **Este card CORRIGE uma premissa do próprio `_bloco.md`.** A seção "Já coberto por
> ondas anteriores" afirma que a trava no gate de valor (`credit`) está resolvida por
> FIX-115 (backstop determinístico) + FIX-172/189 (guard de turno-mudo). O **print novo
> do Kairo (2026-07-02) derruba isso**: o gate de valor AINDA fecha mudo e cai no
> `EMPTY_TURN_FALLBACK`. FIX-206/207 cobrem experiência/consent/dúvidas e a cauda por
> inatividade — mas NÃO fecham este beco do valor. É a mesma classe ("agente reage e não
> conduz"), então mora no mesmo bloco/agent.

## 1. Palavras do operador (literal)

> "causamos algum bug ai nas ultimas versoes vjea o comportamento no whatsapp
> acho que me perdi por aqui."

Print (WhatsApp, conta Kairo, prod):
- Agente explica consórcio → "Show, Kairo! **Quanto custa o carro que você tem em mente?**"
- Kairo: **"200"** → Agente: **"Acho que me perdi por aqui. Pode mandar de novo, por favor?"**
- Kairo: **"200 mil reais"** → Agente: **"Acho que me perdi por aqui. Pode mandar de novo, por favor?"**

## 2. Cenário exato

Funil no gate `credit` (o agente perguntou o valor via `gateQuestion("credit")` —
`gate-questions.ts`, texto no WhatsApp). O usuário responde o valor. O turno fecha SEM
emitir nada visível e cai no `EMPTY_TURN_FALLBACK`. Reproduz nos DOIS envios ("200" e o
inequívoco "200 mil reais") — beco determinístico do funil, não aleatoriedade da LLM.

## 3. Root cause INVESTIGADO (código; hipótese de alta confiança — ver nota)

`EMPTY_TURN_FALLBACK` = "Acho que me perdi por aqui. Pode mandar de novo, por favor?"
(`src/lib/chat/empty-turn-guard.ts:37`). Dispara no WhatsApp quando o turno do usuário
fecha mudo (`adapter.ts:297` → `guardEmptyTurn && !hasSent && !dropped`). O guard está
CORRETO — o defeito é a montante: o turno fecha mudo. Combinação (mesma raiz do FIX-206:
`decideShowGate` suprime o gate contando com o próximo turno do usuário):

1. **Captura/intent frágil no gate de valor.** `parseAssetValue("200")` = `null` por design
   (número nu pequeno é ambíguo — exige separador de milhar, `parse-asset-value.ts:77`).
   O analyzer (Haiku, `turn-analyzer.ts`) pode cair em `NEUTRAL_FALLBACK` (timeout de
   cold-start) → `userIntent="neutral"`, `creditMax=null`; ou classificar o número nu como
   `neutral`. (`parseAssetValue("200 mil reais")` = 200000 — o valor É capturado nesse caso;
   mas se o analyzer deu timeout o intent fica `neutral` mesmo com o valor salvo.)
2. **Gate pulado + LLM muda.** Com `experiencePrev` já setado, `decideShowGate` retorna
   **false** pra intent `neutral` (`hasNoQualifyData=false` → "fica conversacional",
   `qualify-state.ts:179-187`). E o system-prompt manda a LLM ser **"puramente reativa"** na
   coleta ("o sistema dispara a próxima etapa", `system-prompt.ts:412`) → sem texto. Sem gate
   + sem texto = turno mudo → fallback.

Por que FIX-115/172/189 NÃO cobrem: FIX-115 (backstop) salva o valor quando dá pra parsear,
mas NÃO conserta o intent (fica `neutral` no timeout) nem o número nu ("200"→null); e o
guard de turno-mudo (FIX-172/189) é justamente quem DISPARA o "me perdi" — ele é o sintoma,
não a cura. A cura é a mesma do FIX-206 estendida ao gate de valor em turno de USUÁRIO.

> **Nota epistêmica:** os Postgres homol/prod estão atrás de túnel (timeout) e não subo VPN
> no host sem pedido — NÃO confirmei o trace exato no banco (o log `[analyzer]` daria o
> intent/creditMax reais). É hipótese de alta confiança pelo código; a **confirmação vem no
> cassette (Camada 2)**: escreva o teste, veja FALHAR, aí corrija.

## 4. Correção proposta (o quê × onde) — defense-in-depth (Kairo, AskUserQuestion 2026-07-02)

Invariante (Lei 1, em código): **durante a coleta ativa, um gate respondido nunca fecha
mudo — ou avança, ou re-pergunta.** Cobrir WhatsApp **e** web. É o mesmo princípio do
FIX-206; aqui aplicado ao gate `credit` em turno de USUÁRIO. **As três camadas juntas**
(decisão do Kairo: defense-in-depth):

| O quê | Onde |
|---|---|
| **(guard — rede final)** turno-mudo com gate de qualify PENDENTE → re-emite a pergunta do gate pendente (`gateQuestion(gate, categoria)`), NUNCA "me perdi". Nos dois canais. | `src/lib/whatsapp/adapter.ts` (bloco `guardEmptyTurn` ~L297) + `src/lib/web/adapter.ts` (~L450) |
| **(decideShowGate)** responder direto um gate de COLETA pendente (credit/lance/lance-value/lance-embutido) dispara o gate mesmo em intent `neutral` — o heurístico "neutral → conversacional" vale pós-reveal, não na coleta ativa. Alinhar com o auto-avanço do FIX-206. | `src/lib/agent/qualify-state.ts` (`decideShowGate`) |
| **(captura — reforço)** `parseAssetValue` reconhece número nu no contexto do gate `credit` (ex.: "200" com credit pendente + categoria conhecida → 200000, clampando na faixa). Conservador: só quando o gate `credit` está pendente. | `src/lib/agent/parse-asset-value.ts` + `analyze.ts` (passa contexto do gate) |

⚠️ **Não colidir com FIX-206:** ambos tocam `decideShowGate`/`qualify-state.ts`. Faça este
item DEPOIS do FIX-206 (mesma função, edição sequencial no mesmo worktree — sem merge). O
auto-avanço do FIX-206 e o "gate de coleta dispara em turno de usuário" daqui são
complementares: 206 = server-authored/doubts; 208 = user-turn respondendo o valor.

## 5. Regressão exigida (3 camadas OBRIGATÓRIAS — bug de agent)

- **Camada 1 (structural):** (a) guard de turno-mudo com gate `credit` pendente re-emite a
  pergunta do valor, NÃO o `EMPTY_TURN_FALLBACK`; (b) `decideShowGate` dispara o gate de
  coleta ao responder direto mesmo em `neutral`; (c) `parseAssetValue` no contexto credit
  captura número nu ("200"→200000). Arquivos: `empty-turn-guard.*.test.ts`,
  `qualify-state.*.test.ts`, `parse-asset-value.test.ts`.
- **Camada 2 (cassette):** `describe` novo em `tests/regression/agent-trajectory.test.ts`
  reproduzindo o turno-mudo no gate de valor (analyzer → intent neutral / valor não
  capturado + main agent stream sem texto). Assert: ANTES vê o `EMPTY_TURN_FALLBACK` (FALHA);
  DEPOIS vê a re-pergunta do valor / o funil avançar. Append determinístico (imports +
  reconstrução, NUNCA union cego — memória do Kairo). `MockLanguageModelV2` +
  `simulateReadableStream`.
- **Camada 3 (eval):** cenário em `tests/eval/agent-flow.eval.test.ts` — persona responde o
  valor com número nu no WhatsApp; assert que NÃO aparece "me perdi" e o funil avança.

Ver os 2 (Camada 1+2) FALHAREM antes do fix; commit `test+fix:` único.
