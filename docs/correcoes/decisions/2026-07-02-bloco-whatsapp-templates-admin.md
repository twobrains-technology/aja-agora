---
bloco: bloco-whatsapp-templates-admin
data: 2026-07-02
onda: 2
itens: [FIX-204, FIX-205]
spec: docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md
---
# Decisões de design — Admin de templates WhatsApp (onda 2)

Design da spec está fechado; aqui ficam só os trade-offs de UI/execução resolvidos
durante o bloco.

## D1 — `usageKey` opcional no cadastro, editável depois (CONFIRMADO com o Kairo)

**Decisão:** o `usageKey` (chave lógica que liga o template ao ponto de disparo,
ex: `confirmacao_contratacao`) **não** é obrigatório na criação. O template nasce
como DRAFT sem vínculo e o operador liga/edita o `usageKey` a qualquer momento.

**Por quê:**
- Casa com o schema da onda 1 (`usage_key text` nullable + `uniqueIndex` → "único
  quando setado"; NULLs distintos, então vários drafts sem chave coexistem).
- Honra a decisão travada da spec: "o form permite **setar/editar** o usageKey".
- Permite preparar uma **v2** de um template (aprovar antes) e só então mover o
  `usageKey` da v1 para a v2 — sem colidir no UNIQUE.
- Meta exige apenas `metaName`, `category`, `language` e corpo (BODY) para criar
  um template; o `usageKey` é vínculo interno nosso.

**Resolve o conflito** com o card FIX-205 (que listava `usageKey` entre os
"obrigatórios"): interpretamos aquela lista como "campos presentes no form", sendo
os realmente obrigatórios os exigidos pela Meta (`metaName`, `category`, corpo).

**Campos obrigatórios no form:** `metaName` (snake_case), `category` (select,
default UTILITY — nosso caso é confirmação), corpo (BODY). Opcionais: `usageKey`,
`language` (default `pt_BR`), HEADER, FOOTER.

## D2 — Rota `[id]` PATCH para editar o vínculo/draft

Para honrar "setar/editar o usageKey" foi adicionada `PATCH /api/admin/whatsapp/templates/[id]`
(arquivo novo, disjunto do bloco-backend). Regra sênior:
- `usageKey` editável **sempre** (o vínculo pode migrar para uma nova versão aprovada).
- `metaName`/`category`/`language`/corpo editáveis **apenas enquanto `status = DRAFT`**
  (depois de submetido, o template é imutável na Meta; só o vínculo local se move).

## D3 — `submit` só a partir de DRAFT

`POST /api/admin/whatsapp/templates/[id]/submit` só age quando `status = DRAFT`
(evita re-submeter PENDING/APPROVED). Falha da Meta → mantém `DRAFT` + grava o erro
para exibição, **nunca** persiste `PENDING` falso (spec §Erros).

## D4 — `sync` = sync-all, contra STUB do bloco-backend (SEAM nível 3)

`POST /api/admin/whatsapp/templates/sync` chama `reconcileTemplateStatuses()`. O
arquivo real (`src/lib/whatsapp/template-sync.ts`) é do **bloco-backend** e não
existe aqui — implementado contra um **STUB LOCAL** marcado `TODO(bloco-backend)`
que retorna `{ updated: 0 }`. O orquestrador troca o stub pelo import real no merge
(backend entra ANTES). Sync per-`[id]` ficou fora de escopo (não listado no bloco).

## D5 — UI: componentes shadcn já instalados, padrão das telas admin existentes

Reaproveitados `Table`/`Badge`/`Card`/`Input`/`Textarea`/`Select`/`Button`/`Dialog`/
`Label` já presentes em `src/components/ui/` (base shadcn/studio Pro do projeto).
Estrutura espelha `administradoras/` (table + form-dialog + row-actions). Nenhum
componente de UI criado do zero (regra do CLAUDE.md). Página sob o route group
`(dashboard)` para herdar o shell/sidebar do admin (URL `/admin/whatsapp/templates`).
