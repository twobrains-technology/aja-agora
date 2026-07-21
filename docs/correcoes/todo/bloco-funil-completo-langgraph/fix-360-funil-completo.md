---
id: FIX-360
titulo: "Funil completo no grafo (rapport, experience, reco-consent, timeframe, lance, simulator)"
status: todo
bloco: bloco-funil-completo-langgraph
arquivos:
  - src/lib/agent/langgraph/graph.ts
  - src/lib/agent/langgraph/nodes/route.ts
  - src/lib/agent/langgraph/nodes/
  - src/lib/agent/langgraph/state.ts
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 1
---

## Palavras do operador
"a jornada não está inteligente… ele está se perdendo na dinâmica" — o funil INTEIRO tem que rodar.

## Cenário
A conversa percorre TODOS os estágios canônicos, não só o slice da fundação
(name→desire→credit→identify→discovery→reveal→decision). Faltam: motivo/espelho (rapport),
experience, reco-consent, timeframe, lance/lance-value/lance-embutido, simulator-offer.

## Root cause (investigado)
- Fundação cobriu só o slice mínimo; `TODO(rodada-1)` explícito.
- A ordem canônica é o `nextGate` (`qualify-state.ts:189-345`); a fundação já reusa `nextGate`/`decideShowGate`
  no nó `route`. Faltam os nós que produzem a fala/card de cada estágio restante.
- Beats de rapport (motivo em turno próprio, espelho 1x) hoje no Vercel são flags frágeis
  (`shouldAskMotive`/`shouldMirrorMotivation`, `qualify-state.ts:398-420`) — no grafo viram transições de nó explícitas (best practice; não replicar a fragilidade).

## Correção proposta
| O quê | Onde |
|---|---|
| Nós dos estágios restantes, cada um: `route` decide QUANDO (via nextGate/decideShowGate), o `converse` decide a FALA (LLM, nunca `const`), emitCard emite o card do momento quando aplicável | `nodes/`, `graph.ts` |
| `route` com **aresta de escape em TODO nó** — se o usuário puxa pra off-topic/dúvida/outra ordem, o grafo deixa o modelo responder e reabre o gate depois (reusar a supressão de `decideShowGate` em asking_question/expressing_doubt/confused/off_topic) | `route.ts` |
| Rapport (motivo+espelho) como transições de nó explícitas, não flags dispersas — uma pergunta por balão | `nodes/`, `state.ts` |
| Expandir o `funnel` do estado com os campos restantes (experience, prazoMeses, hasLance/lanceValue/lanceEmbutido, flags de dispatch) + `projectToMeta` cobrindo-os | `state.ts`, `emit.ts` |

**NÃO ENGESSAR:** nenhum nó tem fala fixa; o modelo sempre conduz a conversa. Card é do servidor, fala é do modelo.

## Critério de aceitação
- Teste de integração: a jornada percorre name→…→simulator-offer→decision sem travar; troca de faixa de valor re-dispara discovery.
- Sonda de ordem flexível: usuário que já deu bem+valor numa frase NÃO vê value-picker; usuário que desvia é respondido e o gate reabre.
- `pnpm test:unit` verde.

## Regressão exigida
Teste de integração da sequência completa de gates no grafo + o invariante de escape (desvio não trava). Modelo mockado.
