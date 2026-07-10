---
id: FIX-262
titulo: "Runner não trata chunk tool-error → negação MUDA de oferta real + loop de 34 tool-calls"
status: todo
bloco: bloco-r6-contencao
arquivos: [src/lib/agent/orchestrator/runner.ts]
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
