---
id: FIX-269
titulo: "finishReason 'ok' em turno CONTIDO (nit de observabilidade)"
status: todo
bloco: bloco-r7-voz-polish
arquivos: [src/lib/telemetry/turn-trace.ts, src/lib/agent/orchestrator/runner.ts]
rodada: 2026-07-10 rodada 7 (Fable r6, nit)
---
## Gap (veredito r6)
Turno que foi CONTIDO (tool-error/recuperação) loga `finishReason:"ok"` no turn-trace — mascara a
contenção. Observabilidade (Lei 5).
## Correção
- turn-trace registra o finishReason real do turno contido (ex.: "tool-error-recovery"/"contained").
## Regressão (TDD)
- turno contido → finishReason ≠ "ok".
