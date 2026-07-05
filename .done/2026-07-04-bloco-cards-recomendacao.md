---
titulo: "Bloco cards-recomendação — 1ª lista neutra, parcela antes/depois, logo, lance médio, reorder"
data: 2026-07-04
bloco: bloco-cards-recomendacao
branch: feat/cards-recomendacao-lance
tipo: feature (produto) — mudança visível ao usuário no reveal (Passo 5)
---

# Bloco cards-recomendação — 1ª lista neutra, parcela antes/depois, logo, lance médio, reorder

Cinco itens da Ata de alinhamento com o cliente (2026-07-04, item 4/5), todos na mesma
superfície: o display de recomendação do reveal (cards + simulador + coerção server-side dos
números). Executados na ordem pedida: FIX-220 → FIX-221 → FIX-223 → FIX-222 → FIX-224.

## TL;DR

- **FIX-220**: a 1ª lista de reveal (2+ grupos) deixou de destacar um "recomendado" — sem dado
  de lance ainda, nenhuma cota é branded como preferencial. Selo "Recomendação" + score
  breakdown + crown "Top" do seletor só voltam com `recommendationStage: "personalized"`
  (gancho pro estágio 2, coagido sempre pra `"neutral"` hoje — a LLM nunca decide sozinha).
- **FIX-221 (P0 indispensável, inversão de modelo)**: o lance TOTAL (embutido + dinheiro) agora
  **amortiza** o saldo pós-contemplação — decisão do stakeholder que **inverte** o modelo
  anterior (CONTEXT D18/C4: "embutido reduz crédito, não dívida"). Corrige também o bug real do
  inbox (2026-07-02): com lance 100% embutido, a parcela "depois" saía idêntica à de "antes" mas
  rotulada "menor" — o rótulo agora nunca mente. Card ganhou o bloco "até contemplar → após
  receber" + enunciado explícito "recebe menos crédito".
- **FIX-223**: lance médio (`avgBidValue`) propagado da oferta real até o card, coagido
  server-side — nunca fabricado pela LLM.
- **FIX-222**: logo da administradora no card. Migration drizzle (`0033_administradoras_logo_url`)
  + pipeline de matching por nome + fallback gracioso (iniciais). **Nenhum logo real cadastrado
  ainda** — ver PENDENTE (assets) abaixo.
- **FIX-224**: reordenou os 3 blocos do reveal — decisão tomada via `superpowers:brainstorming` +
  `AskUserQuestion` (Kairo escolheu a opção recomendada). Nova ordem: `recommendation_card`
  (opção completa) → `simulation_result` (aprofunda) → `comparison_table` (comparar, por
  último). ADR completo em `docs/decisoes/blocos/2026-07-04-bloco-cards-recomendacao.md`.
- **Gate**: `pnpm test:unit` verde (293 arquivos / 2779 testes) + Camada 3 (LLM real cirúrgico)
  verde em todos os 5 commits `feat:`. TDD strict em todos os itens — testes escritos primeiro,
  vistos falhar, depois corrigidos.

## Commits

| Commit | O quê |
|---|---|
| `18f1fade` | feat: neutraliza 1ª lista do reveal (sem preferencial, mesmo peso) — FIX-220 |
| `9d0c404c` | docs: move fix-220 pra done |
| `5f84473f` | feat: lance embutido amortiza a parcela pós-contemplação (modelo AMORTIZA) — FIX-221 |
| `f089629d` | docs: move fix-221 pra done |
| `e6ffb71e` | feat: lance médio (avgBidValue) no card de recomendação e no group-card — FIX-223 |
| `4c79463a` | docs: move fix-223 pra done |
| `86892398` | feat: logo da administradora no card (migration drizzle + fallback) — FIX-222 |
| `d7828ce8` | docs: move fix-222 pra done |
| `777dfc94` | docs: registra ADR do bloco-cards-recomendacao (FIX-224 ordem do reveal) |
| `066c6548` | feat: reordena os 3 blocos do reveal (card → detalhamento → comparar) — FIX-224 |
| `080de3d7` | docs: move fix-224 pra done e apaga bloco esvaziado |
| `6d7c0c0f`, `e5690110`, `d75c9921` | docs: correções de metadados dos cards done (status/commit não tinham sido persistidos na 1ª tentativa — atraso de sincronização entre Edit e git observado no ambiente; corrigido em commit separado cada vez) |

## Decisões de design

### FIX-220 — neutralidade como invariante em código, não regra-no-prompt

`recommendationStage` é sempre hardcoded `"neutral"` em `coerceRecommendationPayload` — a
diretiva parou de instruir `highlightBestIndex=0`, mas mesmo que a LLM tentasse forçar
personalização, o código descarta. O gancho pro estágio 2 (ONDA 2) existe e está testado
(`recommendationStage: "personalized"` reativa selo/score/crown), mas nada no produto hoje seta
esse valor — é infraestrutura pronta pra quando a recomendação em 2 estágios for construída.

### FIX-221 — a inversão do modelo financeiro

A Ata decidiu (ex.: 6.800 → ~800 após o lance) que o lance amortiza o saldo. Isso inverte
`CONTEXT.md` D18/C4 + o código anterior (`contemplation-dial.ts`) + a tensão T2 da jornada
canônica — a inversão e o PENDENTE-Bernardo já estavam registrados no ADR
`docs/decisoes/blocos/2026-07-04-ata-mudancas-aja.md` (criado antes desta sessão pelo
orquestrador da onda); esta sessão implementou atrás de teste e reescreveu todos os testes que
assumiam o modelo antigo (`contemplation-dial.test.ts`, `contemplation-dial.oferta-real.test.ts`
lib+componente, `tests/regression/agent-trajectory.test.ts`) — nenhum skip.

### FIX-222 — logo sem quebrar a pureza do offer-mapper

A Bevi não tem dado de logo (é informação NOSSA, interna). Em vez de dar I/O ao
`offer-mapper.ts` (que é puro por design), o matching por administradora acontece na MESMA
camada de coerção server-side que já protege `avgBidValue` (FIX-223) — `runner.ts` carrega o
índice de logos do DB sob demanda (memoizado por turno, falha de DB nunca derruba o turno) e
injeta como parâmetro puro em `coerceRecommendationPayload`/`coerceComparisonPayload`.

### FIX-224 — decisão via AskUserQuestion

Apresentadas 3 opções ao Kairo (ver `docs/decisoes/blocos/2026-07-04-bloco-cards-recomendacao.md`
pro detalhe completo); ele escolheu a recomendada: **card → detalhamento → comparar outras**.
A regra de compliance Bv2-07 (CMN 4.927/2021 — `simulate_quota`+`present_simulation_result`
sempre encadeado) e a inseparabilidade `recommendation_card`↔`comparison_table` (FIX-78) foram
preservadas intactas — só a POSIÇÃO de `comparison_table` mudou (foi pro fim).

---

## ⚠️ PENDENTE-Bernardo

O modelo **AMORTIZA** (FIX-221) foi implementado e testado, mas o **número exato ainda não foi
validado com o especialista** antes de ir pra produção. A fórmula implementada:

```
remainingBalance = monthlyPayment × remainingMonths − (ownCashValue + embeddedBidValue)
paymentAfterContemplation = max(0, remainingBalance) / remainingMonths
```

Exemplo real (oferta BB da jornada canônica, D9): parcela real R$ 9.828,92 → com lance 100%
embutido, a parcela pós-contemplação cai pra **~R$ 5.238** (antes ficava travada em R$ 9.828,92,
sem cair — o bug que gerou o card do inbox). **Este número precisa de validação financeira do
Bernardo antes de ir pra produção** — a inversão de modelo está registrada e testada, mas é uma
decisão de modelagem financeira do produto, não só uma correção de bug.

## ⚠️ PENDENTE (assets)

O pipeline do logo da administradora (FIX-222) está pronto de ponta a ponta — migration
(`administradoras.logo_url`), matching por nome, coerção server-side, componente com fallback —
mas **nenhuma administradora tem logo cadastrado ainda**. Faltam:
1. Sourcing/design dos arquivos de imagem por administradora (Itaú, BB, Rodobens, Ancora, etc.).
2. Popular a coluna `administradoras.logo_url` (via admin ou seed) com as URLs dos assets.

Até lá, todo card mostra o fallback gracioso (iniciais da administradora em círculo) — não é um
bug, é o estado esperado enquanto os assets não existem.

## Gaps honestos

- FIX-221 é uma mudança de modelo financeiro exposta ao cliente — validação humana (Bernardo)
  é pré-requisito pra prod, não um nice-to-have.
- O logo (FIX-222) depende de trabalho de design/sourcing fora do escopo de código.
- A recomendação em 2 estágios (personalização real com dado de lance) é ONDA 2 — o gancho
  (`recommendationStage: "personalized"`) existe e está testado, mas nada dispara ele ainda.
- Não medi o impacto real do reorder (FIX-224) em conversas ao vivo — a decisão foi validada
  por leitura da jornada + teste estrutural da diretiva, não por A/B ou QA de tela.
