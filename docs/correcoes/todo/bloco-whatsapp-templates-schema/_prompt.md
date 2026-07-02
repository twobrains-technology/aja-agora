Você é o executor do **bloco-whatsapp-templates-schema** (onda 1) no worktree isolado deste branch (`feat/whatsapp-templates-schema`). Projeto: aja-agora (Next.js 16 + Vercel AI SDK 6 + Drizzle + Postgres). Idioma: PT-BR. Package manager: **pnpm** (npm/yarn PROIBIDOS).

Este bloco é a FUNDAÇÃO da feature de Message Templates da Meta — os outros blocos dependem do que você criar. Capriche no shape; mudança aqui depois custa caro.

1. Leia, nesta ordem:
   - `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md` (a spec — leia inteira, é a fonte de verdade do design).
   - `docs/correcoes/README.md` (fluxo) e `docs/correcoes/todo/bloco-whatsapp-templates-schema/` (`_bloco.md` + `fix-191` + `fix-192`).
   - `src/lib/whatsapp/api.ts` (o cliente Meta atual — v21.0, `sendTemplate` já existe em ~:256; você vai ADICIONAR `createTemplate`/`listTemplates` na mesma região, sem quebrar as funções existentes).
   - `src/db/schema.ts` (siga EXATAMENTE o padrão das tabelas existentes: `pgTable`, enums via `pgEnum`, timestamps, índices).

2. DESIGN: já está fechado na spec — NÃO reabra. Trade-off de implementação novo (ex: shape do jsonb `components`) → decida como sênior e registre 1 linha no resumo final. Sem `AskUserQuestion` a menos que apareça ambiguidade arquitetural real.

3. Execute NA ORDEM, TDD strict (teste falha antes do código):
   - **FIX-191**: tabelas `whatsappTemplates` + `whatsappOutboundQueue` + enums (`whatsappTemplateStatusEnum`, `whatsappTemplateCategoryEnum`, `whatsappOutboundStatusEnum`). Gere a migration com `pnpm drizzle-kit generate` (NÃO rode `push`/`migrate` contra banco na mão — regra inviolável; a migration versionada basta). Teste estrutural (Camada 1): a tabela/enum existe no schema, `usageKey` é único quando setado.
   - **FIX-192**: `createTemplate({name,language,category,components})` → `POST /{WHATSAPP_WABA_ID}/message_templates`; `listTemplates()` → `GET /{WHATSAPP_WABA_ID}/message_templates?fields=...`. Nova env `WHATSAPP_WABA_ID` (erro claro se ausente, mesmo padrão de `WHATSAPP_ACCESS_TOKEN`). Respeite o guard `isSimulatedWaId` só onde fizer sentido (criar template não é por-waId; não precisa). Documente TODAS as vars `WHATSAPP_*` em `.env.example` (hoje faltam lá). Teste: mock do `fetch` e assert do endpoint/payload/headers (Bearer). NÃO bata na Graph real.

4. **1 commit Conventional (PT-BR) por item** (`feat:` / `test+feat:`).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta (best-effort; o orquestrador garante no merge).

6. Ao terminar: `pnpm test:unit` verde + **push da branch** (`git push origin feat/whatsapp-templates-schema`) + gere `.done/2026-07-02-bloco-whatsapp-templates-schema.md` (resumo + decisões + testes + gaps). ⚠️ **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration contra banco, NÃO crie reminder.** A integração é do orquestrador.

7. RESUMO FINAL: liste as decisões de design que tomou ("decidi X em vez de Y porque Z" por linha). Sem decisão? Diga isso.
