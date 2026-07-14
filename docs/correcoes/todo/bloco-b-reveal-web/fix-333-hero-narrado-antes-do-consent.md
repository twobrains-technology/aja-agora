---
id: FIX-333
titulo: "O agente narra o hero (administradora, parcela, 'em destaque') antes do gate reco-consent — o card nem está na tela"
status: todo
bloco: bloco-b-reveal-web
arquivos:
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/system-prompt.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1 (juiz Sonnet, web 4/10)
---

# FIX-333 — o agente vende um card que não está na tela

## Cenário exato (4/4 dossiês web)

Pós-`search`, o servidor emite SÓ a `comparison_table` (correto: o hero é liberado depois do
gate `reco-consent`, decisão da Rodada 10 — "reveal em dois tempos"). Mas o MODELO já narra o
conteúdo do hero no mesmo turno:

> "Tá aí a ITAÚ em destaque — parcela de R$ 3.549,75 por mês durante 50 meses, e contempla
> bastante gente (6 pessoas por mês)."

O usuário lê "em destaque" e **não há destaque nenhum na tela**. O consentimento ("Posso te
mostrar a opção que eu recomendo?") vira teatro — a recomendação já foi dada.

## Root cause

O guard `hero-awaits-reco-consent` (artifact-guard) suprime o CARD, mas o modelo recebe os
dados da recomendação no contexto e fala deles à vontade. Suprimiu-se o artefato, não a
informação.

## Correção proposta

| O quê | Onde |
|---|---|
| Enquanto `reco-consent` não resolveu: o modelo **não recebe** os dados da oferta recomendada (administradora/parcela/prazo do top-1). Ele só sabe que há N opções na tabela | contexto do turno (`orchestrator/index.ts` / system-context) |
| O turno pós-search deve convidar a ver a recomendação, não entregá-la | directive do search-summary |
| ⚠️ NÃO resolver isso com "regra-no-prompt" ("não fale da recomendação antes do consent") — o modelo desobedece e a Lei 1/4 vale: se é invariante, é dado que não chega até ele | — |

## Regressão exigida
- Integração: turno pós-`search` com `reco-consent` pendente → a fala do modelo **não contém**
  nome de administradora nem valor de parcela do top-1.
