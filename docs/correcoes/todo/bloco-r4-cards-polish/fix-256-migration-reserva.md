---
id: FIX-256
titulo: "Migration 0033 (logo_url) não aplicada + copy 'reserva' borderline pré-contratação"
status: todo
bloco: bloco-r4-cards-polish
arquivos: [src/lib/agent/orchestrator/directives.ts, docs/correcoes/rodada2-fable/veredito-fable-final.md]
rodada: 2026-07-10 rodada 4 (Fable FINAL, N-F/N-I)
---
## Gaps (veredito FINAL §N-F, §N-I)
- **N-F**: migration `0033_administradoras_logo_url` NÃO aplicada no ambiente → `column
  "logo_url" does not exist` logado em todo reveal (drift schema×código). É de AMBIENTE (rodar
  `db:migrate` no develop resolve) — registrar; o fallback funciona mas a stack está com drift.
- **N-I**: "Pra confirmar sua reserva… é tipo uma pré-reserva" (`directives.ts:214`) — linguagem
  de reserva pré-contratação, borderline com "nunca 'reservado' antes da contratação". Ajustar a
  copy pra não usar "reserva" antes da contratação real (ex.: "pré-cadastro"/"garantir seu lugar na fila").
## Correção
- Ajustar a copy de `directives.ts:214` (sem "reserva" pré-contratação).
- Registrar a migration 0033 como passo de ambiente (nota no card; o orquestrador aplica db:migrate).
## Regressão
- grep: sem "reserva/reservado" pré-contratação na copy do fecho.
