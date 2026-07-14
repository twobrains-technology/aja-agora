---
id: FIX-343
titulo: "P0 — o fallback enlatado AINDA dispara em 5 dos 8 dossiês (loop de 3× em serviços)"
status: todo
bloco: bloco-e-fallback-residual
arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/tool-policy.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 2 (juiz Sonnet, 3/10)
---

# FIX-343 — o sintoma-mor ainda está vivo (o FIX-332 não pegou todos os caminhos)

## Cenário (juiz da rodada 2)

O texto enlatado — *"as opções que já apareceram aqui pra você continuam valendo…"* e *"deixa eu
reapresentar as opções"* — **ainda dispara em 5 dos 8 dossiês**, incluindo um **loop de 3× em
`servicos-web` que nunca resolve o pedido do usuário**.

O FIX-332 (rodada 1) liberou `search_groups` pós-reveal, mas o fallback continua sendo acionado
por OUTROS caminhos: `toolErrorThisTurn` e `toolCallCapExceededThisTurn` (`index.ts:797`).

## Root cause a investigar (PROVE antes de corrigir)

Rode a jornada e olhe o log:
```
docker logs <container> | grep -E "tool-policy-violation|tool-error-recovery|TOOL_CALL_HARD_CAP"
```
Descubra **qual tool** está sendo negada agora (na rodada 1 era `search_groups` em `reveal`) e
**por que** o modelo a chama. Não corrija no escuro.

## Correção proposta

| O quê | Onde |
|---|---|
| Nenhum tool-error pode fazer o servidor **descartar a fala do modelo e emitir texto fixo**. Erro de tool vira **contexto pro modelo se corrigir no próprio turno** (o ToolLoopAgent faz loop) — não vira resposta enlatada | `index.ts:797` + `runner.ts` |
| Toda tool que o modelo tende a chamar fora de fase e que TEM resposta determinística (os grupos já exibidos, a oferta já escolhida) deve EXISTIR na fase e devolver o dado — em vez de não existir e explodir | `tool-policy.ts` + `tools/ai-sdk.ts` |
| Se ainda assim sobrar fallback (falha REAL de infra), ele **nunca pode repetir o mesmo texto** na mesma conversa | `index.ts` (guard olha os últimos N turnos, não só o anterior) |

⚠️ **Invariante que não pode quebrar:** continua PROIBIDO re-buscar na Bevi pós-reveal.

## Regressão exigida
- Integração: pedir "simula a ITAÚ" pós-reveal NÃO produz tool-error nem texto enlatado.
- Integração: o texto de `buildToolErrorRecoveryFallback` nunca aparece 2× na mesma conversa.
