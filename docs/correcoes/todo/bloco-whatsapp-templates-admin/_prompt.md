Você é o executor do **bloco-whatsapp-templates-admin** (onda 2) no worktree isolado deste branch (`feat/whatsapp-templates-admin`). Projeto: aja-agora (Next.js 16 + shadcn/ui + Tailwind + Drizzle). Idioma: PT-BR. Package manager: **pnpm** (npm/yarn PROIBIDOS).

Este branch forkou da base que JÁ TEM o schema da onda 1: tabela `whatsappTemplates`, enums, e `createTemplate`/`listTemplates` em `src/lib/whatsapp/api.ts`. Confirme (`grep whatsappTemplates src/db/schema.ts`).

⚠️ **DESIGN SYSTEM (regra inviolável do CLAUDE.md):** todo layout usa **blocos shadcn/studio Pro via MCP** — NUNCA criar componente de UI do zero se existir bloco Pro equivalente. Fluxo: `get-blocks-metadata` → `get-block-meta-content` → instalar via `pnpm dlx shadcn@latest add @ss-...`. Use `/rui` (refinar) pra Button/Card/Input/Badge/Table e inspiração de `application-shell`/`statistics-component` pra a listagem. Siga o padrão das telas admin existentes em `src/app/admin/`.

1. Leia, nesta ordem:
   - `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md` (a spec inteira).
   - `docs/correcoes/README.md` + `docs/correcoes/todo/bloco-whatsapp-templates-admin/` (`_bloco.md` + `fix-196` + `fix-197`).
   - Uma rota admin existente pra copiar o guard de role (ex: `src/app/api/admin/conversations/[id]/message/route.ts`) e uma página admin existente pra o layout/shell.
   - `src/lib/whatsapp/api.ts` (`createTemplate`, `listTemplates`).

2. DESIGN: fechado na spec — NÃO reabra. Decisão travada: vínculo uso↔template por **chave lógica `usageKey`** (o form permite setar/editar o usageKey do template). Trade-off de UI novo → decida como sênior; se houver escolha de produto real (ex: quais campos do form são obrigatórios), use `AskUserQuestion` (recomendada em 1º, rótulo "(Recomendado)") e registre em `docs/correcoes/decisions/2026-07-02-bloco-whatsapp-templates-admin.md`. Fallback anti-trava: sem resposta, siga a recomendada.

3. **SEAM NÍVEL 3 (obrigatório):** a rota `POST /api/admin/whatsapp/templates/sync` deve chamar `reconcileTemplateStatuses()` de `src/lib/whatsapp/template-sync.ts` — **arquivo criado pelo bloco-backend, NÃO existe ainda aqui.** Implemente a rota contra um STUB LOCAL claramente marcado:
   ```ts
   // TODO(bloco-backend): trocar pelo import real de "@/lib/whatsapp/template-sync"
   async function reconcileTemplateStatuses() { return { updated: 0 }; }
   ```
   **NÃO crie `src/lib/whatsapp/template-sync.ts`** (evita conflito de arquivo com o backend). O orquestrador troca o stub pelo import no merge.

4. Execute NA ORDEM, TDD strict:
   - **FIX-196** rotas admin (protegidas por role admin, mesmo guard das demais): GET (lista de `whatsappTemplates`), POST (cria draft), `[id]/submit` (chama `createTemplate` → persiste `metaTemplateId`+`PENDING`; falha da Meta → mantém `DRAFT` com erro, não `PENDING` falso), `sync` (stub acima). Teste de integração das rotas.
   - **FIX-197** tela `/admin/whatsapp/templates` (shadcn Pro): lista com badge de status por template + `rejectionReason` visível; form de criação (usageKey, metaName, category, language, corpo com variáveis); botões submeter/sincronizar. Teste de render/comportamento onde couber.

5. **1 commit Conventional (PT-BR) por item** (`feat:` / `test+feat:`).

6. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` (`status: done` + `commit` + `executado_em`). Bloco esvaziou → apague a pasta (best-effort).

7. Ao terminar: `pnpm test:unit` verde + **push da branch** (`git push origin feat/whatsapp-templates-admin`) + gere `.done/2026-07-02-bloco-whatsapp-templates-admin.md` (inclua o seam `TODO(bloco-backend)` na seção de gaps). ⚠️ **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.**

8. RESUMO FINAL: decisões de design tomadas (uma por linha) + o stub `TODO(bloco-backend)` que ficou pendente de troca no merge.
