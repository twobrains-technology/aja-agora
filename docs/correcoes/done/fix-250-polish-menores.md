---
id: FIX-250
titulo: "Polish: copy aviso invertida, 'booking' inglês, 'primeira vez' presumido, suppressed trace"
status: done
bloco: bloco-r3-serverside-cards
arquivos:
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/telemetry/turn-trace.ts
  - src/lib/web/adapter.ts
rodada: 2026-07-10 rodada 3 (Fable r2, menores)
commit: b21a178
executado_em: "2026-07-10"
---

## Gaps (veredito Fable r2, menores)
- "é tipo um booking" — inglês solto na copy do fecho (PT-BR correto: "reserva"/"pré-reserva").
- "Como é sua primeira vez..." presumido sem o usuário ter dito (só afirmar se experiencePrev=first).
- `turn-trace.suppressed` não registra a supressão do guard de decisão (observabilidade — Lei 5).
- copy do aviso de ajuste semanticamente invertida (ver FIX-247).

## Correção
- Trocar "booking" por termo PT-BR. Condicionar "primeira vez" a experiencePrev. Registrar
  supressões no turn-trace. (a copy do aviso é resolvida no FIX-247.)

## Regressão
- grep: zero inglês solto na copy do fecho.
- turn-trace registra suppressed quando o guard suprime.
