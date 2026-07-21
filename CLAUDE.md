# Aja Agora

Agente conversacional de **vendas de consórcio**, em dois canais: web (chat com cards) e WhatsApp.
Ele conversa, qualifica, busca ofertas reais na administradora (Bevi) e fecha contrato.

## O alvo

Um **vendedor humano que entende de consórcio**: consultivo, conduz a conversa, reage ao que a
pessoa contou, trata objeção ("é demorado", "e se eu não for contemplado", "melhor financiamento"),
explica lance/contemplação/taxa como quem sabe, e fecha. Não é um formulário com balões.

## A única regra que importa

**Invariante verificável vira código. Conversa é do modelo.**

- Verificável (a Bevi exige CPF antes de simular; número vem de tool, nunca da cabeça do modelo;
  nada de "cota reservada" antes da contratação; nada de prometer contemplação garantida ou prazo)
  → **código determinístico**.
- Todo o resto — como perguntar, com que palavra, com que empatia, em que ordem quando o cliente
  puxa pro lado — → **é do modelo**. Não vira regra-no-prompt, não vira texto fixo no servidor,
  não vira teste de regex.

O agente já foi engessado uma vez e virou um robô que respondia sempre a mesma coisa. Se a conversa
sair ruim, a primeira hipótese é **prompt/contexto ruim ou trava demais** — não "falta uma trava".

## Português correto

Todo texto que o cliente vê (agente, UI, botão, erro, e-mail, template) em português com acento,
cedilha e til. Acento faltando é defeito de entrega.

## Onde as coisas estão

| O quê | Onde |
|---|---|
| Runtime em uso | `AI_RUNTIME` (`src/lib/llm/runtime.ts`) — `langgraph` ou `vercel` |
| Grafo (LangGraph) | `src/lib/agent/langgraph/` — `graph.ts` é a topologia |
| Runtime Vercel AI SDK | `src/lib/agent/orchestrator/` |
| Ordem do funil | `nextGate` em `src/lib/agent/qualify-state.ts` — **o código é a fonte** |
| Tools por fase | `src/lib/agent/orchestrator/tool-policy.ts` |
| Prompt | `src/lib/agent/system-prompt.ts` |
| Sonda de variância de fala | `pnpm sonda:variancia` |

Documentação em `docs/` é **histórico, não lei**. ADR antigo que não faz sentido hoje: ignore ou
apague. O código manda.
