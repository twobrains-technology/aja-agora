---
id: FIX-356
titulo: "Provider ChatAnthropic → gateway LiteLLM via SRV-fetch + spike de tool-call"
status: done
bloco: bloco-fundacao-langgraph
arquivos:
  - src/lib/agent/langgraph/provider.ts
  - src/lib/llm/gateway-anthropic.ts
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 0
commit: 7ba16efa
executado_em: 2026-07-20
nota: "spike SKIPPED — gateway não alcançável no ambiente do bloco (túnel SSM reaberto com a instância/porta corretas, mas o SSM Agent falhou em alcançar o próprio hostPort local; PENDENTE-KAIRO, ver memória project_aja_llm_local_via_tunel_ssm)."
---

## Palavras do operador
"Eu quero usar LangGraph" — o runtime novo tem que falar com o MESMO gateway/modelo do atual.

## Cenário
O `ChatAnthropic` (LangChain) precisa alcançar o gateway LiteLLM shared e resolver o alias
`claude-sonnet-5`, fazendo tool-calling nativo. É o **gate de fundação**: se o passthrough Anthropic
do LiteLLM não fizer tool-call via LangChain, o provider troca pra OpenAI-compat (sem tocar o grafo).

## Root cause (investigado — fix ALTA-3 do crítico)
- `src/lib/llm/gateway-anthropic.ts` NÃO usa base URL estática: resolve o host por **SRV dinâmico**
  (`LITELLM_SRV_NAME` → `dns.resolveSrv`, `resolveGatewayHost:14-38`) via um **custom `fetch`** injetado
  em `createAnthropic({ fetch: gatewayFetch })` (`:59-66`). `LITELLM_BASE_URL` é só fallback.
- Apontar `ChatAnthropic` pra uma base URL fixa FALHA em dev/prod (host descoberto em runtime), ou cai
  na Anthropic direta (virtual key estourada até 01/08).
- `AI_MODEL ?? "claude-sonnet-5"` (`builder.ts:348`); sem temperature/thinking p/ Sonnet-5 (`:339-359`).
- Prompt cache: breakpoints `cache_control` são setados no caminho Vercel (memória `anthropic_prompt_cache`);
  LangChain exige `cache_control` manual nos blocos (fix MÉDIA-8 — replicar pra não regredir custo).

## Correção proposta
| O quê | Onde |
|---|---|
| Exportar `resolveGatewayHost()` (se ainda não exportado) pra reuso | `gateway-anthropic.ts` |
| `makeLangGraphModel()`: `new ChatAnthropic({ model: AI_MODEL ?? "claude-sonnet-5", apiKey: LITELLM_API_KEY \|\| ANTHROPIC_API_KEY, clientOptions: { fetch: <fetch que reescreve host via resolveGatewayHost, mantém /v1/messages> }, temperature: undefined })` — reusar a MESMA lógica de reescrita de host do `gatewayFetch` (extrair pra helper compartilhado se preciso) | `src/lib/agent/langgraph/provider.ts` (novo) |
| Replicar os breakpoints `cache_control` nos blocos estáveis do prompt (system/tools) | `provider.ts` |
| **Spike test** (0A): 1 chamada `.bindTools([1 tool])` + prompt que força o tool-call, resolvendo `claude-sonnet-5`; asserta que volta `tool_calls`. `describe.skipIf(!gatewayReachable)` — NÃO trava o build quando o gateway está fora (o Kairo destrava via túnel na verificação) | `provider.spike.test.ts` |

## Critério de aceitação
- `provider.ts` compila e exporta `makeLangGraphModel()`.
- Spike test existe e roda (pode ficar `skipped` sem gateway alcançável — documentar no `.done/`).
- Se o gateway estiver alcançável no ambiente do bloco: o spike PASSA (tool_call resolvido).

## Regressão exigida
O spike test É a regressão de fundação (tool-calling nativo via gateway). Skip-if-unreachable é aceitável.
