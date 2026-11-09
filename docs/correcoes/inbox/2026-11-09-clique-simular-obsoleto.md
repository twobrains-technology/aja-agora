---
slug: clique-simular-obsoleto
titulo: "Clicar na carta envia 'Simular CANOPUS — R$ 240.000' e o agente responde 'essa é a simulação'; o passo de simulação não existe mais"
status: inbox
severidade: alta
projeto: aja-agora
rodada: 2026-11-09
evidencia:
  - _evidencia/clique-simular-obsoleto-print.png
mexe_em:
  - src/components/chat/artifacts/group-card.tsx:58 e :208 (rótulo do clique e botão "Simular esse")
  - src/components/chat/artifacts/comparison-table.tsx:52 e :90 (mesmo rótulo e aria-label)
  - src/lib/agent/orchestrator/directives.ts:315 (buildGroupSelectedDirective: roteiriza "essa é a simulação") e :324 (buildSimulateDirective)
  - src/app/api/chat/route.ts:710 (handler da action select-group)
  - src/lib/whatsapp/formatter.ts:297 (botão "Simular valores" no WhatsApp) e interactive-handlers.ts (equivalente)
---

## Palavras do operador
> "quando ele clica no card, vem esse action de simular... mas isso não existe mais, temos que trocar por 'me interessei na Canopus de 240 mil prazo x...' e o agente já direciona ele para frente"

## Cenário
- **Rota/tela:** chat web, depois da comparação de cartas (3 cards: Canopus 240.000 116m, Canopus 240.000 96m, Itaú 240.452 47m).
- **Passos:** 1) clicar numa carta 2) aparece a fala do lead "Simular CANOPUS — R$ 240.000" 3) o agente responde "Beleza, essa é a simulação da CANOPUS com R$ 240 mil. Veja como fica:" (print `_evidencia/clique-simular-obsoleto-print.png`).

## Esperado × Atual
- **Esperado:** o clique vira a fala natural do lead, "Me interessei na CANOPUS de R$ 240 mil, prazo de 116 meses" (com o valor e o prazo da carta clicada), e o agente DIRECIONA para frente (próximo passo da venda), sem falar de simulação.
- **Atual:** o rótulo é "Simular …" e a diretiva do servidor (`buildGroupSelectedDirective`) manda o agente escrever uma introdução de simulação ("essa é a simulação…"). Esse passo não existe mais no produto.

## Pista de causa (A CONFIRMAR)
Três pontos amarrados à palavra "simular": (1) o texto do botão e o `label` do clique em `group-card.tsx` e `comparison-table.tsx`; (2) a diretiva em `directives.ts:315` (e a `buildSimulateDirective`); (3) no WhatsApp, o botão "Simular valores" (`formatter.ts:297`, id `simulate_*`). A ancoragem da escolha (`aplicarAceiteEstruturado`, handler `select-group` na route.ts:710) é verdade do servidor e DEVE continuar: só muda o texto do clique e a orientação ao agente. Ver também o teste de paridade web/WhatsApp citado no comentário da route.
