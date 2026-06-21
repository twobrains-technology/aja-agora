Você é o executor do bloco **bloco-mesa-a-cadastros** no worktree isolado deste branch
(`feat/mesa-cadastros`). Implemente o backoffice de cadastros da MESA DE OPERAÇÃO.

## Contexto obrigatório (leia ANTES de codar)
1. `docs/visao/mesa-de-operacao.md` — a spec de negócio COMPLETA (entidades, modelo faseado
   Bevi→administradora direto, regras). É a régua.
2. `docs/correcoes/README.md` — regras do fluxo.
3. `docs/correcoes/todo/bloco-mesa-a-cadastros/` — os cards FIX-61/62/63.
4. `CLAUDE.md` do projeto, seção "Regressão de agent — 3 camadas" e "pnpm ÚNICO".

## O que JÁ EXISTE (fundação — NÃO recriar)
- O schema das 5 tabelas mesa JÁ ESTÁ em `src/db/schema.ts`: `administradoras`,
  `administradoraDocs`, `mesaAttendants`, `mesaHandoffs`, `mesaCopilotMessages` + os enums
  (`administradoraDocTipoEnum`, `mesaHandoffStatusEnum`, `mesaCopilotRoleEnum`) + relations.
  A migration correspondente (`drizzle/0026_*`) também já existe na base. **NÃO altere o schema**
  a menos que ache um bug real nele (se alterar, gere nova migration com `pnpm db:generate`).
- Padrão de CRUD admin a SEGUIR (copie a estrutura): `/admin/(dashboard)/attendants` +
  `/api/admin/attendants*` (atendente-com-login). Guard: `requireRole("admin")` em
  `src/lib/admin/require-role.ts`. Sidebar: `src/components/admin/app-sidebar.tsx`.
- UI: **shadcn/studio Pro via MCP** (regra do projeto — `/rui`/`/cui`). Não criar componente do
  zero se há bloco Pro. Tabela + dialog de form como nas telas admin existentes.

## Itens (ordem)
### FIX-61 — Administradora (entidade + CRUD admin)
- CRUD em `/admin/administradoras`: listar, criar (nome, slug auto do nome, codigoBevi opcional),
  editar, ativar/desativar, remover. APIs `GET/POST /api/admin/administradoras` +
  `PATCH/DELETE /api/admin/administradoras/[id]`. Guard `requireRole("admin")`.
- Zod em `src/lib/validations/mesa.ts`. Item na sidebar.
- Invariante (assert estrutural): a entidade Administradora é dossiê de operação — **não** é
  fonte de oferta/grupo/número ao cliente (Bevi fonte única). Nenhuma rota pública a consome.

### FIX-62 — Documentos da administradora (PDF: storage + extração + CRUD)
- Upload de PDF por administradora (`administradora_docs`): grava o binário no **object storage**
  (MinIO local / S3 prod — o stack já tem MinIO; crie `src/lib/storage/` com client S3-compatível
  configurado por env, ex.: `S3_ENDPOINT`/`MINIO_*` já no compose — confira `.env.local`/compose).
  `storage_key` na tabela.
- **Extração de texto** do PDF → grava em `texto_extraido` (é o que o copiloto do bloco C injeta).
  Use uma lib de extração (ex.: `unpdf` ou `pdf-parse`) — adicione via `pnpm add`.
- CRUD: ao cadastrar doc, escolhe a administradora (FK). Listar/remover/versionar (incrementa
  `versao`). APIs `/api/admin/administradora-docs*`. Form com upload na tela da administradora.

### FIX-63 — Atendente de mesa (cadastro SIMPLES)
- CRUD em `/admin/atendentes-mesa`: só **nome + whatsapp** (E.164) + ativo. SEM login, SEM convite,
  SEM email (≠ `/admin/attendants` que é o atendente-com-login). APIs
  `/api/admin/mesa-attendants*`, guard `requireRole("admin")`. Zod (whatsapp normalizado E.164;
  reuse o normalizador de telefone que o projeto já tem). Item na sidebar.

## Regressão exigida (CLAUDE.md — não-agêntico, então Camada 1 + integração)
- **Camada 1 (structural)** ao lado do código: Zod valida (whatsapp E.164, nome obrigatório,
  slug único); guard `requireRole("admin")` presente em cada rota.
- **Integration-db** (Postgres real, isolado): criar administradora → criar doc (com extração de
  texto de um PDF fixture pequeno → `texto_extraido` populado) → criar atendente de mesa →
  listar/editar/remover. Assert de VALOR (linhas no DB, `storage_key` setado, `texto_extraido`
  não-vazio). Mock só a fronteira do storage se necessário; DB real.
- NÃO precisa cassette de agente (bloco não-agêntico).

## DESIGN (passo 2 — decida sozinho, NÃO trave)
Há decisões reais (qual lib de PDF; client S3 vs SDK; onde mascarar). Use o raciocínio do
`superpowers:brainstorming` MAS **você é o decisor** — escolha a recomendada (best practice +
padrões do repo), registre em `docs/correcoes/decisions/2026-06-21-bloco-mesa-a.md` (ADR curto:
decisão · alternativas · porquê), commit `docs:`. NÃO faça perguntas, NÃO espere aprovação.

## Entrega
- TDD strict por item; 1 commit Conventional (PT-BR) por item (`feat:` / `test+feat:`).
- Ao concluir cada item, MOVA o card pra `docs/correcoes/done/` (status: done + commit + executado_em).
- `pnpm typecheck` e `pnpm test` verdes ANTES de finalizar (rode DENTRO do container do workspace —
  `local-dev`; host não tem node_modules). Migration aplica no boot do container (migrate-guard).
- RESUMO FINAL: liste as decisões de design tomadas.

## ⛔ LINHA VERMELHA (inviolável)
Implementa, commita e **faz push da branch** (`git push origin feat/mesa-cadastros`). **NÃO** abra
PR, **NÃO** faça merge, **NÃO** rode deploy/restart de prod. A integração é do orquestrador.
