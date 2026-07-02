---
id: FIX-74
titulo: "Guarda determinística: orçamento mensal nunca vira prazo — timeframe volta a disparar na jornada AUTO"
status: todo
bloco: bloco-h-jornada-auto-fidelidade
arquivos:
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/turn-analyzer.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-02 — QA dono-de-produto AUTO web contra prod (ajaagora.com.br)
severidade: media
---

## Palavras do operador
> "Percorra os passos 1→6 validando cada critério de aceite do roteiro."

## Cenário exato
Texto puro "…R$ 70 mil, gastando perto de R$ 900 por mês" (valor + orçamento, sem prazo). O gate de prazo ("Em quanto tempo você gostaria de estar com seu bem?", jornada §2) **não disparou** — a jornada foi direto pra CPF/lance/resultados. O usuário nunca escolheu o prazo; a recomendação saiu com prazo 117m sem confirmação.

## Root cause INVESTIGADO (provado no código)
O gate **está** na sequência (`qualify-state.ts:56`: `if (q.prazoMeses === undefined) return "timeframe"`) e a guarda contra `null` existe (`analyze.ts:102-105`; prompt em `turn-analyzer.ts:121,132-133`). Ou seja, o defeito **não é de código** — é **confiabilidade do LLM analyzer**: em produção o modelo classificou "R$ 900/mês" como `prazoMeses` não-nulo (mesma classe do bug de 2026-06-21, que o prompt sozinho não elimina 100%). Com `prazoMeses` preenchido, `nextGate` pula `timeframe`.

## Correção proposta
| O quê | Onde |
|---|---|
| Guarda **determinística**: ao aplicar `analysis.prazoMeses`, rejeitar (forçar null) quando a MESMA mensagem só traz sinal de **orçamento/parcela mensal** ("X por mês", "X mensais", "R$ X/mês") e nenhuma menção temporal explícita. Não confiar só no prompt. | `analyze.ts` (antes de `q.prazoMeses = analysis.prazoMeses`) |
| Reforçar o few-shot negativo se necessário (secundário ao guard) | `turn-analyzer.ts` |

## Regressão exigida (3 camadas)
- **Camada 1 (structural):** unit do guard — entradas "R$900 por mês" (sem prazo) → prazoMeses permanece null; controle "em 2 anos" → 24 preservado.
- **Camada 2 (cassette):** `agent-trajectory.test.ts` — turno com valor+orçamento-mensal → `nextGate` emite `timeframe` (gate de prazo aparece).
- **Camada 3 (eval nightly):** cenário Rafael/AUTO onde só há orçamento mensal e o prazo é perguntado.
