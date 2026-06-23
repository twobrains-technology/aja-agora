---
bloco: bloco-e-sweep-multifaixa
branch: feat/sweep-multifaixa-descoberta
workspace: feat-sweep-multifaixa-descoberta
onda: 2
depends_on: []
paralelo_com: [bloco-d-resimula-faixa-reveal]
itens: [FIX-69, FIX-70]
escopo_arquivos:
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/adapters/bevi/self-contract-client.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.test.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/agent/orchestrator/discovery-count.ts
  - scripts/spike-bevi-sweep.ts
conflitos_esperados:
  - "src/lib/agent/tools/ai-sdk.ts — bloco-d NÃO toca (bloco-d é tool-policy + system-prompt). Disjunto na prática."
  - "Se for inevitável tocar system-prompt.ts ou agent-trajectory.test.ts, é nível 2 com bloco-d — mergear DEPOIS de D."
ordem_merge: "Mergear DEPOIS do Bloco D. Rebase resolve qualquer append-only de cassettes/prompt. NÃO tocar recommendation.ts (é do bloco-b parado)."
# Onda 2 é rótulo de ISOLAMENTO (ver nota no _bloco.md do bloco-d): os a/b/c (onda 1)
# são backlog parado e NÃO entram nesta leva.
---
# Bloco E — Sweep multi-faixa na descoberta (FEATURE: melhora a recomendação)

Evolução saída da investigação dos logs (2026-06-22). Hoje a descoberta busca UMA
faixa de valor só → recomendação pobre e o usuário não vê alternativas. Implementar
batch SEQUENCIAL que varre 3-5 faixas ao redor do alvo, acumulando ofertas reais no
índice já cumulativo do adapter.

- **FIX-69** — SPIKE de validação ao vivo (gate técnico): medir latência por
  `simulate` quente + sondar rate-limit da Bevi (não documentado no cookbook).
  Entrega um harness rodável + protocolo de medição. Calibra os parâmetros do sweep.
- **FIX-70** — implementar o sweep sequencial multi-faixa: HÍBRIDO (faixa-alvo
  rápido + vizinhas enriquecendo) + escopo SÓ FAIXAS DE VALOR (sem objetivo×lance).
  Tratar piso de crédito (200 com offers vazio). Defensivo a rate-limit.

Vive no adapter/discovery (`adapters/bevi/*` + orquestração em `ai-sdk.ts`). **NÃO
toca `recommendation.ts`** (reservado ao bloco-b parado) nem `tool-policy.ts` (bloco-d).
Ordem interna: FIX-69 (spike informa) → FIX-70 (impl com defaults conservadores —
o sweep é implementável mesmo se o spike não rodar ao vivo; o spike só calibra).
