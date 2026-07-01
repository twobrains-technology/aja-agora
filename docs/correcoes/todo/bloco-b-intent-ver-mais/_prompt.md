Você é o executor do bloco **bloco-b-intent-ver-mais** no worktree isolado deste branch (`feat/intent-ver-mais`). Projeto: aja-agora (Next.js + Vercel AI SDK 6, Anthropic). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn).

## Contexto obrigatório (leia ANTES)
1. `~/.claude/reference/arquitetura-agentes-ia.md` — as 6 leis + a regra do tripé de pesquisa.
2. `docs/correcoes/todo/bloco-b-intent-ver-mais/_bloco.md` + `fix-183-*.md` (a análise-âncora COMPLETA da doença está aqui — root cause provado no banco/CloudWatch de prod).
3. Como o `userIntent` flui hoje: `turn-analyzer.ts` (schema + prompt do analyzer, modelo Haiku) → `example-selector.ts` (filtra few-shot por `whenIntent`) → `qualify-state.ts` (`decideShowGate`). NÃO toque `runner.ts` (é do bloco-a).

## Passos
1. **DESIGN (há decisão de produto real):** o comportamento de "ver mais" depende do FIX-96 (hero+5+expansível), SEGURADO aguardando o Bernardo. Então **FAÇA a pergunta via `AskUserQuestion`** (recomendada em 1º, rótulo "(Recomendado)"): *"o que 'quero ver mais' faz HOJE, sem a tela de ver-todos do FIX-96 pronta?"* — opções tipo: (a) re-apresenta o comparativo dizendo que são todas as opções da faixa atual [Recomendado], (b) resposta textual honesta listando as administradoras já mostradas, (c) outro. O agente respondedor do Kairo responde; sem resposta em tempo razoável → siga a recomendada (a) e registre em `docs/correcoes/decisions/2026-07-01-bloco-b-intent-ver-mais.md` (commit `docs:`). A UX final (FIX-96) fica PENDENTE-KAIRO/Bernardo — NÃO implemente a tela hero+5.
2. **Implemente FIX-183 (TDD strict + 3 camadas de regressão de agent):**
   - Nova categoria em `userIntent` (ex.: `wants_more_options`) no schema `turn-analyzer.ts`, com descrição/exemplos claros que separem de `ready_to_proceed`. Camada 1: teste structural do schema/descrição.
   - Roteamento: `wants_more_options` NÃO deve empurrar pra decisão. Ajuste `decideShowGate`/exemplos pro comportamento default decidido no passo 1.
   - **Camada 2 (cassette OBRIGATÓRIO)** em `tests/regression/agent-trajectory.test.ts`: reproduza "quero ver todos" da Mirella e prove que o agente re-apresenta opções (comportamento default) em vez de decidir sobre grupo não-escolhido. Teste falha ANTES do fix.
3. **1 commit Conventional (PT-BR) por item** (`test+fix:`).
4. Ao concluir: mova `fix-183` pra `docs/correcoes/done/` (status: done + commit + executado_em: 2026-07-01). Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante.)
5. Ao terminar: gate verde (`pnpm test:unit` + `pnpm test:integration` + `pnpm build`). **Push da branch** (`git push origin feat/intent-ver-mais`) + gere `.done/2026-07-01-bloco-b-intent-ver-mais.md`. **NÃO abra PR, NÃO faça merge, NÃO deploy, NÃO reminder.**
6. RESUMO FINAL: decisões de design (1/linha) + o que ficou PENDENTE-KAIRO (a UX ver-todos do FIX-96 / Bernardo).
