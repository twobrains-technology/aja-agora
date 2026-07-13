---
data: 2026-07-09
titulo: "Agente de vendas de consórcio — handoff do protótipo validado"
status: aceita
decisor: Kairo
contexto: onda agente-vendas-consorcio (FIX-225..235)
---

# ADR — Agente de vendas de consórcio (handoff)

Fonte: handoff do protótipo validado, versionado em
`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`. O handoff já foi
escrito sobre o mapa da arquitetura real (FSM em `orchestrator/` + gates em
`qualify-state.ts`, cards `present_*` coagidos server-side, Bevi Trilho B ativo,
motores em `consorcio/`). Ao validar o crosswalk contra o código, três pontos
divergiram e exigiram decisão do Kairo.

## D1 — Gate `timeframe`: REINTRODUZIR (reverte FIX-103)

- **Conflito:** o FIX-103 (2026-06-28) REMOVEU o gate `timeframe` do funil
  ("usuário só fala o valor agora, prazo não"). O handoff quer `timeframe` de
  volta, depois da recomendação, como ponte natural pro simulador-agulha.
- **Decisão (Kairo, 2026-07-09):** reintroduzir como o handoff pede.
- **Consequência:** `nextGate()` volta a emitir `timeframe` PÓS-recomendação (não
  na entrada). `desiredTermMonths` volta a pesar em `termMatchScore`
  (`recommendation.ts`). A jornada canônica (`docs/jornada/jornada-canonica.md`)
  deve ser atualizada — o card do bloco-jornada faz isso.

## D2 — Gate `experience`: MOVER pra pós-search

- **Decisão (Kairo, 2026-07-09):** mover `experience` do topo do funil pra depois
  de `search` (ver grupos primeiro; explicar só pra novato).
- **Consequência:** reordenar a cadeia de ifs em `nextGate()`. Atualizar a jornada.

## D3 — Card de escassez: número placebo 1–6 (decisão comercial explícita)

- **Conflito técnico:** o handoff pede "restam apenas N vagas". O dado real da Bevi
  (`monthlyAwardedQuotas`, mapeado em `offer-mapper.ts:132`) é **contemplados/mês**,
  NÃO vagas restantes. Não existe fonte honesta de "vagas restantes no grupo".
- **Alerta de compliance registrado (uma vez, não pra rebater):** escassez fabricada
  em produto fiscalizado pelo BACEN é o que o CDC art. 37 trata como publicidade
  enganosa por omissão; o próprio handoff (`docs/05-compliance-e-dados.md`) marca
  "escassez só com dado real" como linha vermelha.
- **Decisão (Kairo, 2026-07-09, literal):** *"implemente, esse número é só comercial
  placebo de venda, coloque um número de 1 a 6 aleatório"*.
- **Implementação (decisão de engenharia, sênior):** o número é **estável por grupo**
  — derivado deterministicamente do `quotaId`/`groupId` (hash → 1..6), NUNCA
  `Math.random()` a cada render (senão "restam 3" viraria "restam 5" no refresh,
  destruindo a credibilidade e piorando o risco). Barra decorativa (largura fixa),
  sem implicar total conhecido. Card só no gate `scarcity`.

## Pontos onde o handoff estava DESATUALIZADO (sem decisão — só registro)

- A cadeia de gates já evoluiu: `lance`/`lance-value`/`lance-embutido` já são
  PÓS-reveal (FIX-215) e `identify` já subiu pra antes do `credit` (FIX-53). O "Hoje"
  do handoff (`docs/01`) refletia um estado anterior.
- `referenceMonth` JÁ existe (`contemplation-dial.ts:38`, alimentado por
  `probContemplacaoMeses`). A curva nova calibra no mesmo ponto real (P5 não bloqueia).
- `averageBid` já é normalizado por oferta (`offer-mapper.ts:65,144`).
