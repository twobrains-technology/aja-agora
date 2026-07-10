---
id: FIX-238
titulo: "Gate desire engolido na web — pergunta 'qual carro / por que agora' nunca sai"
status: todo
bloco: bloco-r2-funil-cards
arquivos: [src/lib/web/adapter.ts, src/lib/agent/orchestrator/directives.ts]
rodada: 2026-07-10 rodada 2 (Fable r1, gap P1 #5)
---

## Gap (veredito Fable §D3.3, gap #5)
`gatePartData("desire") = null` (`web/adapter.ts:54-57`) e o emissor só manda a pergunta
`if (data)` (`:246-258`) → `gateQuestion("desire")` ("Qual carro você tem em mente?") NUNCA
sai. O directive do nome (`buildNameCapturedDirective`, `directives.ts:38`) PROÍBE o agente de
perguntar ("NÃO faça pergunta... PARE após a saudação"). Ao vivo: resposta ao nome = só "Prazer,
Madalena!" (turno morto); a jornada só andou porque o script voluntariou o desejo. A pergunta de
motivação também nunca é feita. Comentário do directive ainda diz "gate de experience em seguida" — stale.

## Correção
- `web/adapter.ts`: emitir a pergunta do gate `desire` (desiredItem) mesmo sem card — ou o
  directive do nome deve encadear a pergunta "qual carro você tem em mente?" (e depois "o que fez
  você decidir agora?" → motivation). Ver copy em `docs/design/specs/2026-07-09-handoff.../docs/04-copy-fluxos.md`.
- Corrigir `buildNameCapturedDirective`: deixar o agente FAZER a pergunta do desejo (não "PARE após
  saudação"); atualizar o comentário stale.

## Regressão (TDD + E2E)
- E2E: após o nome, o agente PERGUNTA "qual carro?" (não turno morto); depois "por que agora?".
- `desiredItem` e `motivation` capturados; motivation espelhada 1× (já ok no prompt).
