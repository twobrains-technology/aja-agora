Você é o executor do bloco **bloco-a-governanca-agente** no worktree isolado deste branch (`feat/governanca-agente`). Projeto: aja-agora (Next.js + Vercel AI SDK 6, Anthropic). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn).

## Contexto obrigatório (leia ANTES de qualquer coisa)
1. `~/.claude/reference/arquitetura-agentes-ia.md` — as **6 leis de arquitetura de IA** + a **regra do tripé de pesquisa** (context7 + web + doc oficial, sempre o melhor padrão, preferindo o primitivo nativo do SDK). Este bloco É a aplicação dessas leis.
2. `docs/correcoes/README.md` (se existir) e `docs/correcoes/todo/bloco-a-governanca-agente/` — o `_bloco.md` + os 3 cards (FIX-181, FIX-180, FIX-182) com root cause investigado e correção proposta.
3. O card-âncora da doença (análise completa do incidente da Mirella, conv 69a38af1): `docs/correcoes/todo/bloco-b-intent-ver-mais/fix-183-*.md`.

## Regra INVIOLÁVEL deste bloco — pesquise antes de cravar (tripé)
FIX-180 é DESIGN real. **NÃO desenhe de memória.** Antes de codar a allowlist:
- **context7 / doc oficial do AI SDK**: confirme a assinatura ATUAL de `prepareStep({ stepNumber, steps, messages }) → { activeTools, toolChoice }`, `onStepFinish({ toolCalls, toolResults })`, `experimental_repairToolCall`, e se eles funcionam com `streamText` (o projeto usa `streamText` direto em `runner.ts`, não a classe Agent). Use o MCP context7 (`resolve-library-id` → `query-docs`).
- Cruze com o que já existe: `tool-policy.ts` (`allowedTools`/`phaseFromMeta`), `qualify-state.ts` (`nextGate`), `artifact-guard.ts` (a blocklist a aposentar), `shown-groups.ts` (FIX-179 — o primeiro tijolo da precondição).

## Passos
1. **DESIGN (FIX-180)** — use `superpowers:brainstorming`. Escreva a spec/ADR da allowlist `estado → ação → precondição` em `docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md` (o que decidir · opções · primitivo AI SDK escolhido + porquê · como FIX-179 e artifact-guard migram pra tabela). Quando houver trade-off real (ex.: migrar `allowedTools` inteiro pra `prepareStep` AGORA vs incremental; quanto do `artifact-guard` vira precondição vs fica pós-fato; granularidade nova da fase `reveal`), **FAÇA a pergunta via `AskUserQuestion`** (recomendada em 1º, rótulo "(Recomendado)") — o agente respondedor do Kairo responde. Sem resposta em tempo razoável → siga a recomendada e registre no ADR (NÃO trave). Commit `docs:` do ADR.
2. **Execute NA ORDEM:** FIX-181 → FIX-180 → FIX-182.
   - **TDD strict** e as **3 camadas de regressão de agent** do projeto (CLAUDE.md): Camada 1 structural + Camada 2 cassette em `tests/regression/agent-trajectory.test.ts` (reproduza o turno "quero ver todos" da Mirella e prove que o agente NÃO consegue decidir sobre grupo não-exibido). Teste falha ANTES do fix.
   - **NÃO regrida o FIX-179** — os testes de `shown-groups*` continuam verdes; FIX-179 é o primeiro tijolo da precondição, não algo a remover.
   - PII no log do FIX-181: mascare CPF/celular/documentos.
3. **1 commit Conventional (PT-BR) por item** (`test+fix:` pra bug com regressão; `feat:`/`refactor:` pro que for estrutural).
4. Ao concluir cada item: mova o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit` + `executado_em: 2026-07-01`. Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante via merge-wave.)
5. Ao terminar: rode o gate do projeto (`pnpm test:unit` + `pnpm test:integration` no ambiente do worktree; `pnpm build` pra pegar typecheck completo) e veja VERDE. **Push da branch** (`git push origin feat/governanca-agente`) + gere `.done/2026-07-01-bloco-a-governanca-agente.md` (resumo + decisões + testes + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração é do ORQUESTRADOR.
6. RESUMO FINAL: liste as decisões de design ("decidi X em vez de Y porque Z" por linha) + os primitivos AI SDK que você confirmou na doc + PENDENTE-KAIRO se houver.
