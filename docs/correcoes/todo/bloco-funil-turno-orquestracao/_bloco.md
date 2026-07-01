---
bloco: bloco-funil-turno-orquestracao
branch: fix/funil-turno-orquestracao
workspace: fix-funil-turno-orquestracao
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-113, FIX-114, FIX-115]
escopo_arquivos:
  - src/lib/chat/empty-turn-guard.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/navigation.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/qualify-state.ts
  - src/lib/agent/system-prompt.ts
  - src/components/chat/artifacts/value-picker.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
  - src/components/chat/artifact-renderer.tsx
---
# Bloco — Orquestração de funil/turno (3 bugs de PROD, 2026-06-30)

3 bugs REAIS achados pelo Kairo testando em **PROD (AWS prod)** logo após o release.
Todos na **mesma camada** (funil/gate/turno) e com **root cause já evidenciado**
(log de prod + inspeção de código) — não improvisar, seguir a evidência dos fix-NN.

## Root cause UNIFICADO (o fio que liga os 3)
**Um gate avança/é setado mas NADA visível é emitido pro usuário** → a tela congela
(FIX-113) ou o valor cai pra texto sem componente (FIX-115); e a descoberta dispara
sem identidade coletada (FIX-114). O guard do FIX-110 não pega porque checa
`gate`/`transitionedTo` (estado interno) em vez de só a emissão VISÍVEL.

## Ordem interna
1. **FIX-113** (trava em afirmação de continuidade) — corrige o guard (emissão visível)
   + garante emissão ao avançar gate. É a base.
2. **FIX-115** (componente de valor + resiliência) — mesma família do 113; **requisito
   do Kairo: componente aparece, MAS texto sempre funciona/avança se ele não aparecer
   (dinâmico, nunca trava)**.
3. **FIX-114** (search_groups antes de identidade — `IdentityNotCollectedError` no log
   de prod) — gatear a descoberta na identidade + matar meta-narrativa.

## Contexto-chave (não re-descobrir)
- Log de prod: `search_groups` → `IdentityNotCollectedError` (conv bc5fa852). NÃO é
  Duplicated Hash (já tratado).
- Trilho B (host descoberta) está NO AR — o problema do FIX-114 é ordem, não rede.
- Os 3 tocam comportamento de agente → **3 camadas de regressão obrigatórias**
  (structural + cassette em `tests/regression/agent-trajectory.test.ts`).
