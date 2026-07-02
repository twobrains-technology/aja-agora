---
bloco: bloco-whatsapp-templates-admin
branch: feat/whatsapp-templates-admin
workspace: feat-whatsapp-templates-admin
onda: 2
depends_on: [bloco-whatsapp-templates-schema]
paralelo_com: [bloco-whatsapp-templates-backend]
itens: [FIX-204, FIX-205]
escopo_arquivos:
  - src/app/api/admin/whatsapp/templates/route.ts            # NOVO (GET list, POST create)
  - src/app/api/admin/whatsapp/templates/[id]/submit/route.ts # NOVO
  - src/app/api/admin/whatsapp/templates/sync/route.ts        # NOVO (chama reconcileTemplateStatuses — STUB nível 3)
  - src/app/admin/whatsapp/templates/page.tsx                 # NOVO (UI shadcn/studio Pro)
  - src/app/admin/whatsapp/templates/*                        # componentes da tela
conflitos_esperados:
  - "Nível 1 com bloco-backend: arquivos DISJUNTOS (rotas admin + UI novas). Único seam: nível 3 — a rota /sync importa `reconcileTemplateStatuses` de `src/lib/whatsapp/template-sync.ts`, criado pelo bloco-backend. Implemente contra STUB local `TODO(bloco-backend)` (função temporária que retorna {updated:0}); NÃO crie template-sync.ts aqui (evita conflito de arquivo). ORDEM DE MERGE: backend ANTES; ao integrar admin, troque o stub pelo import real."
---
# Bloco — Admin: cadastro/gestão de templates (onda 2)

Cadastro, submissão à Meta e acompanhamento de status pela UI do admin. Forka da base
já com o schema (onda 1) + `createTemplate`/`listTemplates` (`api.ts`). Roda em paralelo
com `bloco-backend` (arquivos disjuntos). **Usa blocos shadcn/studio Pro via MCP — NÃO
criar UI do zero** (regra do CLAUDE.md).

## Itens (ordem)
1. **FIX-204** — rotas admin: GET/POST `/api/admin/whatsapp/templates`, POST `.../[id]/submit` (usa `createTemplate`), POST `.../sync` (chama `reconcileTemplateStatuses` — stub nível 3).
2. **FIX-205** — tela `/admin/whatsapp/templates` (shadcn/studio Pro): lista com badge de status, form de criação (usageKey/categoria/corpo com variáveis), ações submeter/sincronizar, exibe `rejectionReason`.

Spec: `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md`.
