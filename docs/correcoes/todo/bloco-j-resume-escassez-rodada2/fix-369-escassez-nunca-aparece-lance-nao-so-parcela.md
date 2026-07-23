---
id: FIX-369
titulo: "Card de escassez nunca apareceu em 0/3 personas (inclusive fora do ramo so_parcela) mesmo após FIX-367"
status: inbox
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/agent/orchestrator/index.ts (dispatchDecisionCascade, buildScarcityCard)
  - src/lib/agent/orchestrator/runner.ts (linha ~1595, hardening de decisionDispatched)
  - src/lib/agent/orchestrator/server-cards.ts (buildScarcityCard)
rodada: 2026-07-22 — campanha vendedor-matador-consorcio (loop-de-goal), rodada 1, veredito do juiz
---

## Palavras do operador
> "Tem um step ai que eu não encontrei que mostra a escassez ali no grupo pra forçar ele fazer logo
> sabe?"

## Cenário exato
- **Rota/tela:** web, teatro de chat, qualquer categoria com lance NÃO `so_parcela`.
- **Passos:** completar a jornada até a decisão final (aceitar ou recusar lance embutido) — ver os
  3 dossiês da rodada 1.
- **Dados usados:** persona 1 (Helena, casa, `so_parcela` — EXCLUÍDA por design, decisão #4 do goal
  doc, não é bug); persona 2 (Diego, moto, ACEITOU lance embutido — card de 3 cenários
  Conservador/Provável/Acelerado); persona 3 (Renata, carro, RECUSOU o embutido no fim, mas
  qualificou com `hasLance` diferente de `so_parcela` — ver nota abaixo).

## Esperado × Atual
- **Esperado (critério do goal doc, ITEM 5):** no cenário 2 (moto, pressa, lance não-so_parcela), se
  a oferta Bevi trouxer `availableSlots`, o card de escassez aparece antes ou junto do card de
  decisão.
- **Atual:** **0 de 3 execuções mostraram o card de escassez** — inclusive a persona 2, que era o
  cenário desenhado especificamente pra testar isso, e a persona 3, que também não caiu em
  `so_parcela` (ela recusou o embutido só ao FINAL, depois de já ter sido apresentada a mecânica
  completa — sua qualificação de lance não é necessariamente `so_parcela`, que é a saída "só
  sorteio, nunca considerei dar lance", diferente de "considerei o lance embutido e recusei no
  fim"). O bloco I (FIX-367) já corrigiu a propagação de `availableSlots` do reveal pro snapshot
  (`resolveSnapshotAvailableSlots`) — mesmo assim, 0/3 continuou sem o card, o que sugere que o
  gap NÃO é (só) ausência do dado `availableSlots`.

## Root cause (INVESTIGADO parcialmente — pista de código, não confirmada ao vivo; falta reproduzir)

`buildScarcityCard` (`server-cards.ts:43`) só é chamado de UM lugar: dentro de
`dispatchDecisionCascade` (`orchestrator/index.ts:172-233`), condicionado a `!isSoParcela`
(`hasLance !== "so_parcela"`) — até aqui bate com a decisão #4 do goal doc. `dispatchDecisionCascade`
só roda quando `nextGateToFire === "decision"` E `!meta.decisionDispatched` (guard de idempotência,
`index.ts:180`).

**Achado de código (a confirmar por reprodução, não testei ao vivo):** existe um SEGUNDO caminho que
marca `decisionDispatched: true` **sem passar por `dispatchDecisionCascade`** —
`runner.ts:1595-1597`: `if (artifacts.some((a) => a.type === "decision_prompt") && !meta.decisionDispatched) { ...persistMeta(..., decisionDispatched: true) }`. Esse é um hardening pra quando o
PRÓPRIO MODELO chama a tool `present_decision_prompt` diretamente (bypass do directive
determinístico) — comentário `index.ts:158-171` já documenta esse caso como conhecido
("BUG-REVEAL-LOOP... o modelo... às vezes tentava avançar sozinho"). **Se esse é o caminho que a
persona 2 (fluxo de lance embutido, "o sistema seguiu direto pra confirmação... sem uma etapa de
decisão explícita entre conservador/provável/acelerado") efetivamente percorreu, o card de escassez
NUNCA é construído** — porque só existe dentro de `dispatchDecisionCascade`, que nunca roda nesse
caminho.

Isso é consistente com o relato da persona 2: "o fluxo pareceu avançar automaticamente para o
fechamento... sem uma etapa de decisão explícita" — ausência de uma etapa de decisão separada é
exatamente o sintoma esperado se o card `decision_prompt` saiu por chamada direta do modelo
(bypassando o directive) em vez do `dispatchDecisionCascade` orquestrado.

**Esse problema pode acontecer em outro lugar parecido?** Sim, estruturalmente: qualquer card
"server-side determinístico" que dependa de rodar DENTRO de `dispatchDecisionCascade` (não só
scarcity — o comentário do próprio arquivo, FIX-246/253, lista essa classe de bug como já resolvida
pra `two_paths`/`decision_prompt`/`whatsapp_optin`) fica vulnerável ao MESMO bypass sempre que o
modelo tiver a tool `present_decision_prompt` disponível no toolset e decidir chamá-la sozinho. O
guard de `runner.ts:1595` foi desenhado pra proteger a IDEMPOTÊNCIA do gate (não reabrir a
qualificação), não pra garantir que os cards satélite (scarcity) ainda sejam emitidos nesse desvio —
é uma lacuna entre dois guards com propósitos diferentes.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Reproduzir ao vivo o cenário da persona 2 (moto, lance embutido aceito) capturando se `present_decision_prompt` foi chamado pelo MODELO (tool-call) ou pelo directive determinístico — confirmar/refutar a hipótese acima antes de mexer em código | investigação, harness de conversa real |
| Se confirmado: no hardening de `runner.ts:1595` (quando `decision_prompt` aparece por tool-call direto do modelo, não pelo directive), disparar TAMBÉM a emissão de `buildScarcityCard` (com o mesmo guard `!isSoParcela` e checagem de `groupId` ancorado) antes de marcar `decisionDispatched` — ou, alternativa mais robusta: tirar a tool `present_decision_prompt` do toolset do modelo nessa fase (fail-closed, mesma receita já usada pra `two_paths`/`scarcity`, Lei 4 do projeto: invariante crítico vira código, não fica na mão do modelo chamar ou não) | `runner.ts`, `tool-policy.ts` |
| Se refutado (não é isso): investigar os outros 2 caminhos já listados no goal doc — (2) grupo não ancorado no ponto de decisão nesse fluxo específico, (3) oferta Bevi sem `availableSlots` mesmo pós-FIX-367 | `server-cards.ts`, `scarcity-payload.ts` |

## Regressão exigida
Teste de integração do orquestrador: fluxo "aceita lance embutido, não so_parcela, grupo ancorado
com `availableSlots` real" precisa provar que o artifact `scarcity` é emitido ANTES ou JUNTO do
`decision_prompt`, **inclusive quando `present_decision_prompt` é chamado por tool-call direto do
modelo** (não só pelo caminho feliz do directive) — hoje só existe cobertura pro caminho feliz
(`dispatchDecisionCascade`), não pro caminho de bypass que o hardening de `runner.ts:1595` existe
pra tratar.
