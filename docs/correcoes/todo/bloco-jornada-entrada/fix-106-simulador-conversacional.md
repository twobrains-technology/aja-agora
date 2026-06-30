---
id: FIX-106
titulo: "Simulador de contemplação conversacional (loop) — comportamento do agente"
status: todo
bloco: bloco-jornada-entrada
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/agents/builder.ts
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> (Q "Simulador") = **"Loop conversacional (Recomendado)"**: usuário
> escolhe/pergunta um mês-alvo e o bot recalcula parcela/lance/crédito ao vivo,
> podendo iterar quantas vezes quiser.
> (mensagem original) "temos simulador e coisas que conseguimos agora garantir
> que o funcionamento esteja perfeito".

## Cenário exato
O simulador de contemplação (passo 4) na web é a agulha arrastável
(`contemplation_dial`). No WhatsApp vira texto estático (perde a interação
central). O Kairo quer um LOOP CONVERSACIONAL: o agente pergunta "em quantos
meses você quer ser contemplado?", o usuário responde, o agente recalcula
(parcela até contemplar, parcela após, lance necessário, crédito) e mostra,
podendo iterar. A WEB mantém a agulha.

## Root cause investigado
- O cálculo puro JÁ existe e DEVE ser reusado: `computeContemplationDial()` em
  `src/lib/consorcio/contemplation-dial.ts` (inputs: creditValue, termMonths,
  targetMonth, historicalWinningBidPct, referenceMonth, monthlyPayment...).
- O comportamento de conduzir o loop é do agente: `system-prompt.ts` (instruir a
  oferecer/conduzir o simulador, 1 pergunta por turno, iterar) + uma tool que
  exponha o cálculo (em `tools/ai-sdk.ts`) pro agente chamar a cada iteração.
- A APRESENTAÇÃO no WhatsApp é do bloco-whatsapp-apresentacao (FIX-109); a web
  pode manter o `contemplation_dial`.

## Correção proposta
| O quê | Onde |
|---|---|
| Tool que devolve o cenário de contemplação p/ um mês-alvo (reusa `computeContemplationDial`) | tools/ai-sdk.ts |
| Prompt: agente oferece e conduz o loop (1 pergunta/turno, recalcula, itera) | system-prompt.ts, builder.ts |
| Manter a agulha (`contemplation_dial`) na web | sem mudança aqui |

DESIGN A DECIDIR (brainstorming + AskUserQuestion): copy do convite ao simulador;
quando ofertar (pós-reveal?); como o agente apresenta cada iteração no texto.

## Regressão exigida (3 camadas)
- Camada 1: tool de contemplação reusa `computeContemplationDial`; prompt descreve o loop.
- Camada 2: cassette — usuário pede "e em 6 meses?" → agente recalcula e responde; itera.
- Camada 3: eval — simulador conversacional completa no WhatsApp.
