Você é o executor do **bloco-sonnet5** (hotfix) no worktree isolado deste branch
(`chore/upgrade-agente-sonnet5`). Projeto: **aja-agora** (Next.js 16 + Vercel AI SDK 6 +
Drizzle + Postgres). Idioma: **PT-BR**. Package manager: **pnpm** (ÚNICO — `npm`/`yarn`/`npx`
proibidos).

## 0. Contexto — leia PRIMEIRO

1. `docs/correcoes/todo/bloco-sonnet5/_bloco.md` — manifesto e decisão.
2. `docs/correcoes/todo/bloco-sonnet5/fix-209-*.md` — breaking changes provados + correção.
3. **Invoque a skill `claude-api`** (é obrigatório — a tarefa mexe em modelo Anthropic) pra a
   sintaxe EXATA do `@ai-sdk/anthropic`: como desligar thinking via `providerOptions`, o fato
   de `temperature`/`top_p`/`top_k` darem 400 no Sonnet 5, e que `budget_tokens` não existe.
4. `CLAUDE.md` do projeto — Vercel AI SDK 6 é o SDK único; regras de produto invioláveis.
5. Os arquivos-fonte: `builder.ts`, `mesa-copilot/index.ts`, `personas.ts`.

**Decisão do Kairo (não reabrir):** modelo = `claude-sonnet-5`; thinking = **OFF explícito**
(preservar o <3s do chat); escopo = agente de runtime (builder) + copiloto admin (mesa-copilot).
NÃO tocar eval/diagnose/judge.

## 1. TDD STRICT

Escreva a Camada 1 (structural) PRIMEIRO e veja FALHAR antes de mudar o builder:
- assert modelo default = `claude-sonnet-5`
- assert que a config da chamada NÃO passa `temperature` (senão 400 em runtime)
- assert thinking `disabled` explícito
Depois implemente. `test+fix:` (ou `test+chore:`) num commit.

## 2. Execução (ordem)

1. Trocar `"claude-sonnet-4-6"` → `"claude-sonnet-5"` em `builder.ts:274` e
   `mesa-copilot/index.ts:58` (mantém override por `AI_MODEL`).
2. Remover o param `temperature` das chamadas sonnet-5 (evita 400). `persona.temperature` pode
   ficar no schema (inofensivo) — só NÃO passe pro modelo. Sem migration de DB se der pra evitar.
3. Desligar thinking explicitamente (`thinking: { type: "disabled" }` via `providerOptions.anthropic`)
   nas duas chamadas. Cuidado com `providerOptions` já existentes em builder.ts (~L218/228).
4. **VERIFICAR o alias `claude-sonnet-5` no gateway LiteLLM** (query no gateway / config shared).
   Ausente → deixe **PENDENTE-KAIRO** documentado no `.done/` (registrar model/virtual-key no
   LiteLLM é infra shared, fora deste worktree). NÃO deployar às cegas.
5. Re-baseline leve do tokenizer (~30% tokens): confira que `max_tokens`/limites não estouram.

## 3. Invariantes

- **Vercel AI SDK 6** é o SDK único — `@ai-sdk/anthropic` via `createGatewayAnthropic()`
  (`gateway-anthropic.ts`). NÃO usar `@anthropic-ai/sdk` direto.
- **NÃO tocar** `diagnose.ts`/`eval/judge.ts`/`eval/jornada-judge.ts` (juízes de eval nightly —
  trocar quebra baseline).
- **PT-BR correto** em qualquer copy. **pnpm ÚNICO**.
- Bloco **disjunto** do bloco-funil-nao-trava — não edite `agent-trajectory.test.ts` (só rode).

## 4. Gate verde ANTES de pushar

- `pnpm test:unit` **verde** (gate de merge). Inclui `agent-trajectory.test.ts` (deve seguir
  verde — os cassettes mockam o modelo; se quebrarem, investigue acoplamento indevido).
- O **pre-commit hook** (Camadas 1+2) roda automático. **NUNCA `--no-verify`.** Vermelho não pusha.

## 5. Entrega (implement-and-push — você NÃO integra)

- **Conventional Commits PT-BR**, pequenos. `test+chore:` / `chore:`.
- Ao concluir: mova `fix-209` pra `docs/correcoes/done/` (`status: done` + `commit` +
  `executado_em`), apague a pasta `todo/bloco-sonnet5/`, `git push origin chore/upgrade-agente-sonnet5`
  + gere `.done/2026-07-02-sonnet5.md`.
- **NÃO abra PR, NÃO faça merge, NÃO deploye, NÃO eleve pra prod.** Integração/elevação = orquestrador.

## 6. Resumo final

- O que mudou (arquivo por arquivo), a Camada 1 (com "falhou antes"), e o estado do alias no
  gateway (registrado? ou PENDENTE-KAIRO?). Honesto — se não deu pra verificar o gateway, diga.
