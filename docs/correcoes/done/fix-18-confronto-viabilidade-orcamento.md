---
id: FIX-18
titulo: "Orçamento declarado não fecha com o bem → agente recomenda parcela 9,8× maior rotulada 'Compatível com seu perfil' sem confrontar"
status: done
bloco: bloco-m-ux-funil
commit: 4f9ac51
executado_em: 2026-06-11
arquivos:
  - src/lib/agent/orchestrator/directives.ts (confronto pré/pós-busca)
  - src/lib/agent/system-prompt.ts (instrução de confronto honesto)
  - src/components/chat/artifacts/recommendation-card.tsx (rótulo honesto quando monthlyFit≈0)
  - src/lib/consorcio/plan-estimate.ts (warning de inviabilidade no picker do passo 2)
  - src/components/chat/artifacts/plan-estimate-picker.tsx (exibição do warning)
rodada: 2026-06-11 (auditoria do dial — jornada BB real do Kairo)
anotado_em: 2026-06-11
---

# FIX-18 — Confronto de viabilidade quando o orçamento declarado não fecha

### O que aconteceu (jornada real do Kairo, 2026-06-11)

Perfil declarado no passo 2: **bem R$ 250 mil · parcela R$ 1.000/mês · ~27
meses · lance R$ 117 mil**. Combinação impossível: R$ 250 mil ÷ R$ 1.000/mês ≈
**24 anos** de prazo — não existe grupo de auto assim (típico ≤ 80-100 meses).

O sistema: buscou pela CARTA (250k), achou ofertas reais com parcela de **R$
9.828,92/mês** (9,8× o orçamento declarado) e recomendou rotulando
**"Compatível com seu perfil"** — com o próprio breakdown confessando
`Orçamento 0%`. O agente celebrou ("bem próximo do seu objetivo") em vez de
confrontar o trade-off.

### Root cause

- `search_groups` filtra por faixa de CRÉDITO; `monthlyBudget` declarado não
  participa da busca (a Bevi Trilho B busca por valor do bem — limitação de
  fonte).
- O scoring de recomendação TEM o `monthlyFit` (deu 0%), mas nada gateia a
  narrativa: o card rotula "Compatível com seu perfil" incondicionalmente e a
  diretiva do reveal não instrui confronto.
- No passo 2, o `plan-estimate` clampa o prazo estimado em 1.5× o típico e
  segue — não avisa que a parcela declarada é inviável pro bem pedido.

### Correção proposta (rascunho pra conversa)

| O quê | Onde |
|---|---|
| Passo 2: quando o prazo estimado clampa no teto e a parcela não fecha, warning no picker: "com R$ 1.000/mês o bem viável é ~R$ X — ou ajusta a parcela" (estimativa) | `plan-estimate.ts` + `plan-estimate-picker.tsx` |
| Reveal: diretiva instrui confronto honesto quando `monthlyFit ≈ 0`: "a menor parcela real nessa faixa é R$ Y — bem acima do seu orçamento de R$ Z. Quer ajustar o valor do bem?" ANTES de celebrar | `directives.ts` + `system-prompt.ts` |
| Card: rótulo condicional — "Compatível com seu perfil" só com monthlyFit razoável; senão "Melhor opção na faixa de crédito" (honesto) | `recommendation-card.tsx` |

**Ponto pra conversa:** confrontar ANTES da busca (no picker, mais barato) vs
DEPOIS (no reveal, com números reais na mão) vs ambos. E o tom — docx pede
agente que guia, não que empurra.

### Regressão exigida (3 camadas)

- Camada 1: warning do picker (engine pura) + rótulo condicional do card +
  diretiva contém instrução de confronto.
- Camada 2: cassette — reveal com monthlyFit=0 → texto do agente contém
  confronto, não celebração.
- Camada 3: cenário de eval com perfil impossível (250k + 1k/mês).

### Decisão (Kairo, registrada 2026-06-11)

Resposta ao "Ponto pra conversa" acima: **confronto no picker E no reveal**
(ambos) e **tom guia-não-empurra** (jornada: "Seu objetivo primeiro").

### O que foi implementado

- **Picker (passo 2)** — `plan-estimate.ts`: `computePlanEstimate` agora devolve
  `budgetFeasible` + `viableAssetForBudget` (maior bem que cabe na parcela no
  prazo máximo realista, `Math.floor` pra caber de fato). `plan-estimate-picker`
  mostra um aviso (`data-testid="plan-budget-warning"`) quando a parcela não
  fecha o bem — orienta pro bem viável e convida a ajustar, sem bloquear o submit.
- **Card (reveal)** — `score-label.ts`: `recommendationFitLabel(score, monthlyFit)`
  — `monthlyFit < 0.2` → "Melhor opção na faixa de crédito" (honesto), senão o
  rótulo qualitativo do score. `recommendation-card.tsx` passou a usar essa
  função. Guard **determinístico** (independe da LLM) — o card nunca mais mente.
- **Reveal (narrativa)** — `directives.ts`: `buildSearchSummaryDirective` injeta
  um bloco "CONFRONTO DE VIABILIDADE" quando há orçamento declarado (instrui
  confrontar a parcela real × orçamento ANTES de celebrar, oferecer ajustar o
  valor do bem, tom de guia). `system-prompt.ts`: regra dura espelhando isso.
- **Camada 3**: o eval nightly (`agent-flow.eval.test.ts`) é o lugar do cenário
  de perfil impossível (250k + 1k/mês) — não roda no PR; os guards
  determinísticos (card + engine) já blindam o caminho de runtime.

`formatter.ts` (`contractFormToWhatsApp`) **não foi tocado** (bloco K paralelo).
