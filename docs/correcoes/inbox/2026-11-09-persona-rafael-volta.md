---
slug: persona-rafael-volta
titulo: "Clique em Automóvel mostra 'Rafael entrou na conversa / Especialista em automóveis'; persona não existe mais"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/rafael-persona-print.png
mexe_em:
  - src/components/chat/artifacts/welcome-categories.tsx (onSelect manda ação kind:"category")
  - src/app/api/chat/route.ts (~686: ramo body.action.kind === "category" -> pipeTransitionTurn)
  - src/lib/web/adapter.ts (pipeTransitionTurn, data-transition), src/lib/agent/orchestrator/transition.ts, directives.ts (buildTransition*Directive)
  - src/components/chat/chat-message.tsx (TransitionDivider ~468)
---

## Palavras do operador
> "entrou esse negócio de rafael... isso não tem mais"

## Causa
Os blocos de categoria da tela de boas-vindas mandam `sendAction({kind:"category"})`. O `route.ts` trata essa ação com `pipeTransitionTurn`: emite `data-transition` (divisor "Rafael entrou na conversa" + "Especialista em automóveis") e roda o directive antigo `buildTransitionFirstContactDirective` ("Como posso te chamar?"). É o motor de personas, que morreu com o funil em 20/10. Quem conduz é o vendedor livre.

## Esperado × Atual
- **Esperado:** clicar em Automóvel é uma mensagem normal do cliente ("Automóvel"); o vendedor livre responde. Sem persona, sem divisor, sem nome de especialista.
- **Atual:** transição de persona com divisor e fala do directive antigo.
