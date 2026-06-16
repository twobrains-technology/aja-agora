---
bloco: bloco-a-polir-funil-retorno
branch: feat/polir-funil-retorno
workspace: feat-polir-funil-retorno
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-48, FIX-49, FIX-51, FIX-50]
escopo_arquivos:
  - src/lib/bevi/contract-input.ts
  - src/lib/bevi/fulfillment.ts
  - src/lib/bevi/proposal-repo.ts
  - src/app/api/chat/route.ts
  - src/app/api/leads/route.ts
  - src/components/chat/theater/theater-chat.tsx
  - src/components/chat/theater/resume-prompt.tsx
  - src/components/chat/message-list.tsx
  - src/components/chat/chat-message.tsx
  - src/components/chat/artifact-renderer.tsx
  - src/components/chat/artifacts/gate-renderer.tsx
  - src/lib/chat/provider.tsx
  - src/lib/chat/resume.ts
  - src/app/api/chat/resume/route.ts
  - src/components/admin/pipeline/contact-detail-panel.tsx
  - src/lib/admin/contact-detail.ts
---

# Bloco A — Polir funil + retorno (refino pós-entrega da feature funil-e-retorno)

Pacote único de UM dev. 4 refinamentos da **mesma feature** já mergeada
(`funil-e-retorno-para-sessao`, FIX-41..47), levantados na sessão de PO crítico
de 2026-06-15.

Disjunção: 3 frentes de arquivos — backend Bevi/API (FIX-48) × chat/retomada
(FIX-49, FIX-51) × admin UI (FIX-50). FIX-49 e FIX-51 tocam os **mesmos**
arquivos de retomada (`theater-chat`, `provider`, `resume`) → obrigatoriamente o
mesmo dev, em sequência (não dá pra paralelizar sem conflito). Os demais são
afins e curtos → tudo num pacote só, como o operador pediu ("bloco único").

## Ordem interna (executar nesta sequência)

1. **FIX-48** — bug do funil (proposta web sem `leadId` → raia presa). Backend,
   isolado. Maior impacto de negócio, root cause já provado no código.
2. **FIX-49** — retomada acolhe (sela artifacts/gates, ancora scroll, mata pill).
   Chat UI. Estabelece o conceito de "resumed/hidratação" que o FIX-51 usa.
3. **FIX-51** — popup "voltar à conversa ou começar nova" (gate de entrada da
   retomada). Chat UI, mesmos arquivos do FIX-49. **Tem decisão de design real**
   (ver passo 2 do `_prompt.md`).
4. **FIX-50** — proposta vigente + conversa ativa em destaque no card. Admin UI,
   isolado.

Sem dependência dura entre as frentes; a ordem é por prioridade e por afinidade
de arquivo (49 e 51 juntos).

## TDD obrigatório (regra do projeto)

Os 4 são **não-agênticos** (não tocam `streamText`/comportamento da LLM) →
**dispensam cassette (Camada 2)**. Cada um: Camada 1 (structural) + teste de
comportamento real (integration p/ FIX-48; component + E2E Playwright p/ 49/51/50).
Teste primeiro, ver falhar com a assinatura do bug, então corrigir.
