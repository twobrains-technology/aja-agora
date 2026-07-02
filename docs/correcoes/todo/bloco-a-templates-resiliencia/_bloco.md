---
bloco: bloco-a-templates-resiliencia
branch: fix/whatsapp-templates-resiliencia
workspace: fix-whatsapp-templates-resiliencia
onda: 1
depends_on: []
paralelo_com: []
itens: [FIX-206, FIX-207, FIX-208]
escopo_arquivos:
  - src/app/api/admin/whatsapp/templates/sync/route.ts
  - src/lib/whatsapp/api.ts
  - src/components/admin/whatsapp-templates/template-row-actions.tsx
---
# Bloco A — Resiliência dos templates de WhatsApp (Meta)

Três correções pequenas de resiliência achadas no QA de PROD (2026-07-02) da feature de
Message Templates. Todas do MESMO tema (erros da integração com a Meta ficam mudos/genéricos
em vez de acionáveis), mas em **arquivos disjuntos** (nível 1 — sem conflito):

- FIX-206 → `sync/route.ts` (backend): 500 mudo → try/catch com 502 JSON.
- FIX-207 → `lib/whatsapp/api.ts` (backend): fetch à Meta sem timeout → `AbortSignal.timeout`.
- FIX-208 → `template-row-actions.tsx` (frontend): toast "HTTP 502" genérico → cópia amigável.

Empacotados numa sessão só (itens pequenos, mesmo tema) — não fragmentar em 3 workspaces.
Ordem interna = ordem de `itens:`. Sem dependência entre eles; nenhum toca o mesmo arquivo.

**Contexto (não faz parte deste bloco):** o BLOQUEADOR real do fluxo é config de prod
(`WHATSAPP_WABA_ID`/token/escopo + migration 0032), PENDENTE-KAIRO — fora do escopo de código.
Estes 3 fixes são resiliência/UX; não ativam o fluxo sozinhos.

Gate do projeto: `pnpm test:unit` (não typecheck — dívida na develop).
