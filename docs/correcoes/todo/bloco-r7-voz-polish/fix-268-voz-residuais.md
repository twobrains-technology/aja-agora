---
id: FIX-268
titulo: "Residuais de voz: 'reserva' no gate lance, educação embutido 2× no turno, texto picotado no decision"
status: todo
bloco: bloco-r7-voz-polish
arquivos: [src/lib/agent/orchestrator/directives.ts, src/lib/agent/orchestrator/sanitizer.ts, src/lib/web/adapter.ts, src/app/api/chat/route.ts]
rodada: 2026-07-10 rodada 7 (Fable r6, residuais r5)
---
## Gaps (veredito r6, residuais r5)
- "reserva" ainda vivo no gate de lance (linguagem de reserva pré-contratação — inviolável).
- educação do embutido sai 2× no mesmo turno (dedup incompleto do r5/FIX-254).
- texto picotado no turno de decisão (balões quebrados).
## Correção
- Trocar "reserva" por termo neutro no gate lance. Dedup real da educação de embutido (1× por turno).
- Corrigir o picotamento do texto no decision (1 balão = 1 ideia).
## Regressão (TDD)
- grep: sem "reserva" pré-contratação no gate lance. educação 1× por turno.
