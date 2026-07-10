---
id: FIX-249
titulo: "Alucinação sem recovery = beco-sem-saída; agente promete 'te retorno' na web"
status: todo
bloco: bloco-r3-serverside-cards
arquivos: [src/lib/agent/orchestrator/sanitizer.ts, src/lib/agent/system-prompt.ts]
rodada: 2026-07-10 rodada 3 (Fable r2, gap NOVO N2 P0)
---

## Gap (veredito Fable r2, N2 — NOVO P0)
Usuário escolheu "ITAÚ" (visível na comparison_table) → agente NEGOU a existência, inventou
groupIds (guard bloqueou, correto), e terminou prometendo "te retorno" (turno proativo que a web
NÃO tem — beco-sem-saída, run inteiro morto).

## Correção
- Quando o guard bloqueia uma entidade que o usuário viu em tela, o agente deve RE-APRESENTAR as
  opções reais (recovery), não negar existência nem prometer retorno.
- `sanitizer.ts`/prompt: banir "te retorno"/"entro em contato depois"/"vou verificar e volto" na web
  (não há canal proativo web) — sempre oferecer o próximo passo no chat.

## Regressão (TDD + E2E)
- escolher uma administradora visível na tela → agente segue com ela (não nega).
- sanitizer dropa promessa de retorno proativo na web.
