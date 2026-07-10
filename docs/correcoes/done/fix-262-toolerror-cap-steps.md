---
id: FIX-262
titulo: "Runner não trata chunk tool-error → negação MUDA de oferta real + loop de 34 tool-calls"
status: done
bloco: bloco-r6-contencao
arquivos: [src/lib/agent/orchestrator/runner.ts, src/lib/agent/orchestrator/index.ts, src/lib/agent/orchestrator/directives.ts, src/lib/agent/orchestrator/tool-io-log.ts]
rodada: 2026-07-10 rodada 6 (Fable r5, causa-raiz P1 espiral)
---
## Gap (veredito r5 — causa-raiz NOVA mapeada)
O LLM chama `search_groups` FORA do toolset da fase → AI SDK v6 emite chunk **`tool-error`** que o
`runner.ts` NÃO trata (FIX-257 só cobre `tool-input-error`; `invalid_input`=0 hits). Resultado:
chamada MUDA → o modelo conclui "não existe" → NEGA ofertas exibidas na tabela (reproduzido 3×). Pior
forma: contestação → turno de **34 tool-calls / 593s** com 4 fallbacks repetidos.
## Correção (CÓDIGO — Lei 1/4)
- Tratar o chunk `tool-error` no consumo do `fullStream` (runner.ts): tool fora de fase / erro de tool
  vira um resultado EXPLÍCITO que força o modelo a corrigir, NUNCA silêncio que ele lê como "não existe".
  Nunca deixar o agente negar uma oferta que está na tabela (guard determinístico).
- **CAP DE STEPS**: hard cap de tool-calls por turno (ex.: já há `stopWhen: stepCountIs(10)` — garantir
  que vale e que o loop de 34/593s é impossível). Loop caro = bug de contenção.
## Regressão (TDD)
- chunk tool-error → resultado explícito tratado (não silêncio); agente não nega oferta da tabela.
- turno nunca passa do cap de tool-calls.

## Implementação (2026-07-10)
- `tool-io-log.ts`: `buildToolErrorLogLine`/`logToolError` — log BARULHENTO e diferenciado
  (`outcome: "tool_error"`), nunca mais o `output: null` mudo indistinguível de "rodou e não achou nada".
- `runner.ts`: novo `case "tool-error"` no consumo do `fullStream` (distinto do `tool-input-error` do
  FIX-257 — aqui a tool nem está no toolset, NoSuchToolError). Ao detectar, o runner PARA de relayar
  qualquer coisa pro usuário neste turno (suprime texto seguinte, `break` no consumo do stream,
  `AbortController.abort()` como melhor esforço pra cortar a geração em background) — nunca deixa a
  narração de negação do modelo passar.
- `TOOL_CALL_HARD_CAP = 12` (runner.ts, exportado): contagem de tool-calls REAIS do turno (não só
  steps do modelo — `stepCountIs(10)` do builder.ts não bastava porque um step pode carregar várias
  chamadas paralelas, e foi assim que o turno real chegou a 34/593s). Acima do cap, mesmo guard de
  tool-error assume o turno.
- `directives.ts`: `buildToolErrorRecoveryFallback` — mensagem FIXA que reafirma que as opções já
  mostradas continuam válidas (nunca nega), convida o usuário a apontar administradora/valor.
- `index.ts`: `runTurn` materializa o fallback + `finish` com `reason` distinto
  (`tool-error-recovered` / `tool-call-cap-exceeded`) pra observabilidade.
- Testes: `tool-io-log.fix-262-tool-error.test.ts` (unit + estrutural) e
  `runner.fix-262-tool-error-cap.integration.test.ts` (DB real — reproduz o cenário exato do veredito:
  comparação de 2 marcas → `tool-error` → negação suprimida; e o loop de tool-calls → cap respeitado).
  `pnpm test:unit` 337/337 arquivos, 3163/3163 testes verdes.
