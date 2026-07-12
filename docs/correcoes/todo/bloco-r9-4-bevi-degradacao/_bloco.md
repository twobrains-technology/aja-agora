---
bloco: bloco-r9-4-bevi-degradacao
branch: fix/r9-4-bevi-degradacao
workspace: fix-r9-4-bevi-degradacao
onda: 1
depends_on: []
paralelo_com: [bloco-r9-4-reveal-serverside, bloco-r9-4-valor-honestidade]
itens: [FIX-291]
escopo_arquivos:
  - src/lib/adapters/bevi/self-contract-client.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/web/adapter.ts
---
# Bloco r9-4 — Bevi degradação honesta (FIX-291, P0 Bevi third-party)

Item único, escopo GRANDE de produto: cap agregado de retry (client + adapter + tool empilham
timeouts independentes, pior caso teórico ~480s numa única `search_groups`) + degradação honesta
quando a busca falha/atrasa (funil hoje segue roteirizado com dados vazios até quebrar no
fechamento). **NÃO paralelizar as chamadas reais à Bevi** (decisão travada, PENDENTE-AGX à parte)
— este bloco é só teto/degradação, nunca concorrência.

## ⚠️ Overlap nível 2 (paralelo mesmo assim)

- **`src/lib/agent/tools/ai-sdk.ts`** × `bloco-r9-4-reveal-serverside` (FIX-290): ver overlap
  espelhado no `_bloco.md` daquele bloco. Este bloco mexe em `runDiscovery`/`search_groups`/
  `recommend_groups` (~1249-1360); o outro mexe nas tools de apresentação (~1148-1173). **Ordem de
  merge: `bloco-r9-4-reveal-serverside` PRIMEIRO**, este bloco resolve por cima (conflito esperado
  só de adjacência).

## Investigação em aberto pro executor (raiz (b), não travada — confirmar antes de implementar)
O `fix-291` cita como PROVÁVEL (não confirmado a fundo) que o funil determinístico avança pro
`two_paths`/fechamento sem checar `meta.revealCompleted` em `src/lib/agent/qualify-state.ts`
(`nextGate`/`decideShowGate`) e/ou `src/lib/agent/orchestrator/two-paths-payload.ts`. Confirme
com leitura direcionada ANTES de implementar o gate — se o arquivo real divergir, ajuste o
`escopo_arquivos` deste bloco (registre no ADR do bloco).

## Por que sozinho
P0 de negócio isolado (Bevi third-party, causa-raiz externa mas gap de produto real) — tema e
arquivos totalmente disjuntos de `valor-honestidade` (bevi adapter/client vs system-prompt/
directives), overlap só pontual com `reveal-serverside` (mesmo arquivo, região oposta).
