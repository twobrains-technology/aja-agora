---
id: FIX-256
titulo: "Migration 0033 (logo_url) não aplicada + copy 'reserva' borderline pré-contratação"
status: done
bloco: bloco-r4-cards-polish
arquivos:
  - src/lib/agent/orchestrator/directives.ts
rodada: 2026-07-10 rodada 4 (Fable FINAL, N-F/N-I)
executado_em: "2026-07-10"
nota: |
  N-F confirmado como PURO gap de ambiente (não código): drizzle/0033_administradoras_logo_url.sql
  já existe, versionado, testado (src/db/administradoras-logo-url.migration.test.ts). Nenhuma
  mudança de código cabe aqui — só falta `db:migrate` rodar no ambiente develop/prod. PENDENTE-KAIRO
  (fora do blast radius deste worktree — quem aplica é o pipeline de deploy/orquestrador, não este
  bloco). N-I: copy trocada em buildAdvanceToContractDirective (linha 214 original) E em
  buildChooseOfferDirective (linha 226 — MESMA copy duplicada por copy-paste, mesmo defeito, corrigida
  junto pra não deixar um caminho ainda dizendo "reserva" enquanto o outro não diz). buildSimulationInterestDirective
  (linha ~237, leva a present_lead_form — passo ANTERIOR ao fecho, sem evidência no veredito) foi
  deixada fora de propósito — escopo do achado N-I é especificamente a copy do FECHO (decision→contract).
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
