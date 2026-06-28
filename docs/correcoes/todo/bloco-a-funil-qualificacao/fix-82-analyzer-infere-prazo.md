---
id: FIX-82
titulo: "Analyzer infere prazoMeses a partir do orçamento mensal — endurecer prompt do classifier"
status: todo
bloco: bloco-a-funil-qualificacao
arquivos:
  - src/lib/agent/turn-analyzer.ts
  - src/lib/agent/turn-analyzer.prompt.test.ts
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
---

# Bug — analyzer infere `prazoMeses` a partir do orçamento mensal

- **Data:** 2026-06-21 · **Achado em:** QA noturno E2E browser (rodada 2026-06-21-0812) · **Superfície:** classifier de turno (`turn-analyzer`) → funil de qualificação
- **Severidade:** alta — pula o gate `timeframe` (passo 2 da jornada) e o prazo errado contamina busca/recomendação (o eixo `objetivo` da Bevi é **derivado do prazo**, `qualify-config.ts:191`).
- **Relacionado:** [[2026-06-21-funil-pula-experience-consent]] (mesmo cenário de browser; era a "observação secundária" daquele card, agora confirmada e corrigida).

## Cenário (reproduzível)
Usuário manda, em texto livre, **valor + orçamento mensal** sem citar prazo: _"Quero comprar um carro de uns 80 mil, gastando perto de 850 por mês"_.

- **Esperado:** `creditMax=80000` extraído; `prazoMeses` permanece indefinido → `nextGate` dispara `timeframe` → o usuário vê **"Em quanto tempo você gostaria de estar com seu bem?"** (jornada-canonica §2, opções: o mais rápido · até 6 meses · 1 ano · 2 anos+ · sem pressa).
- **Atual:** o analyzer **inventa** um `prazoMeses` a partir do "850 por mês" (confunde orçamento/parcela mensal com horizonte de tempo). `analyze.ts:85-89` grava o prazo + deriva `objetivo`; `nextGate` (qualify-state.ts:56) pula `timeframe`. O usuário **nunca escolhe o prazo** e a recomendação sai com premissa que ele não confirmou (contra FIX-57/58 "confirma premissas").

## Evidência (probe do analyzer real, 3 runs, nenhuma mensagem com prazo)
| Mensagem (valor + orçamento mensal) | prazoMeses (ANTES) | prazoMeses (DEPOIS) |
|---|---|---|
| "...80 mil, gastando perto de 850 **por mês**" | **36** ❌ | null ✅ |
| "...80 mil, posso pagar uns 850 **por mes**" | **120** ❌ | null ✅ |
| "...80k, uns 850 **mensais** cabem no bolso" | null ✅ | null ✅ |
| (controle) "...80 mil **em 2 anos**" | 24 ✅ | 24 ✅ |

ANTES: 2/3 inventavam prazo (36 vs 120 — valores incompatíveis entre si = alucinação, não cálculo). DEPOIS do fix: 3/3 corretos no caso negativo e o prazo explícito ("em 2 anos") continua extraindo 24.

## Causa raiz
O contrato do classifier já diz "NÃO invente sinais que não estão no texto" (turn-analyzer.ts:114), mas faltava a regra específica de que **"X por mês"/"X mensais" é ORÇAMENTO, não prazo** — o LLM via "mês" e associava a horizonte de tempo.

## decidido (§4.3.1 — reversível)
**Opção tomada:** endurecer o prompt do classifier (`BASE_SYSTEM_INSTRUCTION`): regra explícita ("prazoMeses só com menção temporal explícita; orçamento/parcela mensal NÃO é prazo") + 2 exemplos negativos few-shot ("850 por mes" → prazoMeses null). **Por quê:** ataca a causa (confusão de orçamento×prazo) sem código frágil de regex; o exemplo positivo "em 2 anos"→24 é preservado. **Reversível** em 1 commit.

## Regressão (3 camadas)
- **Camada 1 (structural, PR):** `turn-analyzer.prompt.test.ts` — asserta que o prompt contém a regra anti-confusão, exige menção temporal, tem exemplo negativo, e preserva o positivo. Travada (4 testes).
- **Camada 2 (cassette):** N/A — o bug é no classifier (`generateObject`), não no agent `streamText`; um cassette de trajetória não captura classificação. O nível certo é structural (prompt) + eval.
- **Camada 3 (eval, nightly):** cenário que roda o analyzer real e mede que orçamento mensal não vira prazo. **Pendente** — adicionar ao trilho de eval (não bloqueia PR).
