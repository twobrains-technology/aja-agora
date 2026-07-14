---
id: FIX-333
titulo: "O agente narra o hero (administradora, parcela, 'em destaque') antes do gate reco-consent — o card nem está na tela"
status: done
bloco: bloco-b-reveal-web
arquivos:
  - src/lib/agent/orchestrator/sanitizer.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/directives.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 1 (juiz Sonnet, web 4/10)
executado_em: 2026-07-14
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

## Implementação (desvio consciente da coluna "Onde" acima — documentado)

Investigação (agente Explore + leitura direta) confirmou o root cause, mas revelou que "cortar o
dado no tool-result de `recommend_groups`" tem um vazamento residual: o modelo já vê
administradora+parcela de TODOS os grupos no tool-result de `search_groups` (legítimo — é o que
a `comparison_table` mostra). Redigir só o `recommend_groups` não impede o modelo de cruzar o
`id` do top-1 contra o `search_groups` anterior e narrar a mesma coisa. A única forma de cortar
o dado 100% na entrada exigiria adiar `recommend_groups`/`present_recommendation_card`/
`simulate_quota`/`present_simulation_result` inteiros pro turno PÓS-consentimento — o que
quebraria a garantia de emissão determinística do hero (FIX-297/308/325: o card é computado no
turno da busca e replayado via `emitServerCard`, INDEPENDENTE do modelo chamar tool de novo) e
arriscaria a garantia de ≥3 opções/expansão do `comparison_table` (Bug #09, `recommendWithFallback`).

Pedi confirmação ao Kairo via `AskUserQuestion` sobre as duas rotas (redigir tool-result vs.
adiar as tool-calls); a pergunta foi dispensada (sessão autônoma, sem operador disponível).
Decisão tomada por mim, documentada aqui: implementei um **guard determinístico no sanitizer**
(`isPrematureTopOfferClaim`, `sanitizer.ts`) — mesma família de código de `isTaxaContemplacaoClaim`/
`isPrematureReservationClaim` (Lei 4: invariante vira código, não regra-no-prompt). O guard
recebe via `StateVerificationContext` (`runner.ts`, computado a partir do `revealGroupsById` REAL
já indexado neste turno — nunca a narrativa do LLM) a administradora+parcela do grupo de maior
score, e dropa qualquer segmento de fala que os cite ENQUANTO `meta.recoConsentAnswered !== true`.
Isso corta o que o USUÁRIO recebe de forma 100% determinística (não depende do modelo obedecer),
sem tocar na arquitetura de emissão determinística do hero nem no timing das tool-calls — zero
regressão nos testes existentes (FIX-286/290/297/308/325, todos rodados e verdes). Reforcei
também o texto do `buildSearchSummaryDirective` (convite, não entrega) como defesa suplementar,
não como o mecanismo real.

Teste de regressão: `runner.fix-333-hero-narrado-antes-consent.integration.test.ts` (reproduz o
cenário exato do dossiê real — texto falho antes do fix, verde depois).
