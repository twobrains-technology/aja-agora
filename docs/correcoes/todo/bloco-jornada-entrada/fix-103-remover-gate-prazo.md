---
id: FIX-103
titulo: "Remover o gate de prazo (timeframe) da qualificação"
status: todo
bloco: bloco-jornada-entrada
arquivos:
  - src/lib/agent/qualify-config.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/agents/builder.ts
  - src/lib/agent/tools/ai-sdk.ts
rodada: 2026-06-28 — revisão da jornada de entrada (decisões Kairo)
---

## Palavras do operador
> "usuario so vai falar o valor agora, prazo nao."
(decisão na rodada da jornada de entrada, 2026-06-28)

## Cenário exato
Na qualificação, o agente pergunta o "prazo desejado de contemplação" (gate
`timeframe`: opções "o mais rápido / até 6 meses / 1 ano / 2 anos+ / sem
pressa"). É mais um menu na sequência. O Kairo decidiu que o prazo NÃO é mais
perguntado na entrada.

## Root cause investigado
O gate `timeframe` está cravado na máquina de qualificação:
- `src/lib/agent/qualify-config.ts` define o gate timeframe (opções/ordem).
- `src/lib/agent/qualify-state.ts` referencia timeframe na sequência de gates.
- `src/lib/agent/system-prompt.ts` tem regras de quando/como perguntar prazo.
- ⚠️ `recommend_groups`/score usam `desiredTermMonths` (derivado do timeframe).
  INVESTIGAR no `tools/ai-sdk.ts`: se a recomendação depende do prazo, definir
  o fallback (ex: usar o prazo da própria oferta da Bevi, não um desejo do
  usuário). Esta é a decisão de design do item (ver _prompt.md, regra 3).

## Correção proposta
| O quê | Onde |
|---|---|
| Remover o gate `timeframe` da sequência de qualificação | qualify-config.ts, qualify-state.ts |
| Remover as regras de "pergunte o prazo" do prompt | system-prompt.ts, builder.ts |
| Ajustar recommend/score pra não exigir `desiredTermMonths` do usuário | tools/ai-sdk.ts (investigar fallback) |

## Regressão exigida (3 camadas)
- Camada 1: `qualify-config` NÃO contém o gate `timeframe`; prompt não instrui pedir prazo.
- Camada 2: cassette — qualificação completa sem perguntar prazo (web e WhatsApp).
- Camada 3: eval — persona completa a entrada sem o gate de prazo.
