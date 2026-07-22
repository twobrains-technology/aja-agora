---
id: FIX-367
titulo: "Investigar e corrigir por que o card de escassez do grupo não apareceu no fluxo testado"
status: todo
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/scarcity-payload.ts
rodada: 2026-07-22 — campanha vendedor-matador-consorcio (goal doc .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md, ITEM 5)
---

## Palavras do operador
> "Tem um step ai que eu não encontrei que mostra a escassez ali no grupo pra forçar ele fazer logo sabe?"

## Cenário exato
- **Rota/tela:** Relato do Kairo durante o `/goal` da campanha — não fixado em print/card
  formal ainda; reproduzir com o cenário "moto, com muita pressa" (o que mais provavelmente
  precisa de urgência/escassez).
- **Passos:** cliente com pressa, avançando no funil até o ponto de decisão de lance/sorteio.
- **Dados usados:** N/A — reproduzir no ambiente de teste.

## Esperado × Atual
- **Esperado:** card de escassez do grupo aparece reforçando urgência, com número real de vagas
  (nunca inventado).
- **Atual:** não apareceu no fluxo que o Kairo testou.

## Root cause (pista forte + 1 caminho novo — NÃO totalmente confirmado, investigar ANTES de corrigir)
`src/lib/agent/orchestrator/index.ts:204-233` (`buildScarcityCard`) **só dispara se
`!isSoParcela`** (gate `hasLance !== "so_parcela"`, FIX-233 histórico) **e** se
`buildScarcityCard(refreshed)` encontrar um `groupId` já ancorado (senão retorna `null`,
comentário FIX-268). **Terceiro caminho (achado por revisão crítica):** mesmo COM grupo
ancorado, o card só renderiza se a oferta Bevi trouxer `availableSlots > 0`
(`scarcity-payload.ts:49-52`) — o número nunca é inventado de propósito (risco CDC art. 37,
comentário `:1-24`). Se a oferta de moto da Bevi não trouxer `availableSlots`, o card é
IMPOSSÍVEL de exibir sem violar essa regra.

**Decisão de produto tomada por default recomendado** (Kairo ausente, `AskUserQuestion`
dispensado 2×): manter escassez FORA do ramo `so_parcela` (comportamento atual). ⚠️
PENDENTE-KAIRO revisar quando puder.

Já existe uma cadeia de fixes anteriores sobre esse card (FIX-230/237/246/253/268) — não mexer
sem reproduzir o cenário exato, risco de reabrir bug já fechado.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Reproduzir o cenário "moto, pressa, COM lance" (não so_parcela) e logar/inspecionar qual dos 3 caminhos é o real: (a) caiu em so_parcela — não é bug, comportamento esperado; (b) sem grupo ancorado no ponto de decisão — corrigir ancoragem; (c) grupo ancorado mas oferta sem `availableSlots` — gap de dado externo, não código | `orchestrator/index.ts`, `scarcity-payload.ts` |
| Se for (b): garantir que o grupo seja ancorado antes do ponto de decisão nesse fluxo | `orchestrator/index.ts` |
| Se for (c): NÃO inventar número — documentar como gap de dado upstream no `.done/` e no LEDGER da campanha | — |

## Regressão exigida
Se a causa for (b) (ancoragem faltando): **TDD strict** — teste que prova que, no fluxo
moto+pressa+lance, o grupo está ancorado antes do card de decisão, e o card de escassez
aparece com o número real. Se a causa for (a) ou (c), não há regressão de código a escrever —
documentar a conclusão da investigação no `.done/`.
