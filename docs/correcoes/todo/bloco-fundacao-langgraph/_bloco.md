---
bloco: bloco-fundacao-langgraph
branch: feat/langgraph-runtime-fundacao
workspace: feat-langgraph-runtime-fundacao
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-355, FIX-356, FIX-357, FIX-358]
escopo_arquivos:
  - package.json
  - src/lib/llm/runtime.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/langgraph/
---
# Bloco fundação — runtime LangGraph (Rodada 0, walking skeleton)

Fundação SERIAL e acoplada da campanha `.processo/loop/2026-07-20-1948-langgraph-runtime.md`
(leia o goal doc inteiro antes de começar). É o contrato do qual a Rodada 1 (nós de funil,
cards, WhatsApp, testes) vai depender — então o foco é **um walking skeleton que RODA** (a troca
`AI_RUNTIME` funciona ponta-a-ponta num slice real da jornada) + o contrato de interface cravado,
NÃO paridade completa. O que não couber vira `TODO(rodada-1):`.

Ordem interna (cada item depende do anterior):
1. FIX-355 — flag `AI_RUNTIME` + dispatcher no `runTurn` + deps LangChain.
2. FIX-356 — provider `ChatAnthropic` → gateway LiteLLM (SRV-fetch) + spike de tool-call.
3. FIX-357 — contrato: estado do grafo + adapter AI-SDK-tool→LangChain + mapeamento dos 14 `TurnEvent`.
4. FIX-358 — walking skeleton: grafo mínimo end-to-end + persistência-projeção.

Bloco único e sequencial de propósito: o caminho crítico é serial (o contrato tem que existir antes
de qualquer nó paralelo). A Rodada 1 fana out DEPOIS que este bloco integrar.
