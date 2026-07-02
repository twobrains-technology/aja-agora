Você é o executor do **bloco-streaming-chat-layer** no worktree isolado deste branch (`fix/composicao-mensagem-efemera`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn). Este é a **ONDA 2** — você forka da base que **já tem a onda 1** (`bloco-funil-turno-orquestracao`: erro de descoberta já vira diretiva; gate de proposta já exige dado fresco). NÃO reimplemente isso.

1. **Leia primeiro:**
   - `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-streaming-chat-layer/` (`_bloco.md` + `fix-188` + `fix-189` + `fix-190` — root cause e correção investigados).
   - O que a onda 1 fez: `docs/correcoes/done/fix-186-*.md` e `fix-187-*.md` (já integrados na base) — você constrói a CAMADA DE COMPOSIÇÃO por cima da lógica já corrigida. Como o erro já vira diretiva, o sanitizer do FIX-188 só cuida de preâmbulo de **sucesso**, não de narração de erro.
   - `CLAUDE.md` §"Regressão de agent — 3 camadas OBRIGATÓRIAS" + `~/.claude/reference/arquitetura-agentes-ia.md` (6 leis — a barreira real é o **sanitizer em código**, não regra-no-prompt).

2. **DESIGN:** o design está fechado nos cards. A única frente que exige INVESTIGAR antes de corrigir é a "pendura até novo input" do FIX-189 e a evidência `fim-proposta-bugado` — reproduza e crave a causa antes de mexer (use `superpowers:systematic-debugging`). Trade-off de implementação real → `superpowers:brainstorming` + `AskUserQuestion` (recomendada em 1º); **fallback anti-trava:** sem resposta, siga a recomendada. Registre em `docs/correcoes/decisions/2026-07-01-bloco-streaming-chat-layer.md` (commit `docs:`).

3. **Execute NA ORDEM: FIX-188 → FIX-189 → FIX-190.** **TDD strict**: 3 camadas de regressão PRIMEIRO (Camada 1 structural + Camada 2 cassette OBRIGATÓRIO em `tests/regression/agent-trajectory.test.ts` com `MockLanguageModelV2` de `ai/test` + Camada 3 cenário no eval). Veja falhar → implemente → veja passar. **NUNCA** fix sem cassette.

4. **Card de inbox já promovido:** o **FIX-190** JÁ é a promoção canônica do antigo card `agente-fallback-refresh` (o cru foi removido do inbox nesta anotação — histórico no git). O card `...narra-busca` do inbox segue como REFERÊNCIA (não mexa — metade dele é outro escopo, gate identify).

5. **1 commit Conventional (PT-BR) por item** — `test+fix:` (imperativo minúsculo, sem ponto final, título < 72).

6. Ao concluir cada item: **mova** o `fix-NN` pra `docs/correcoes/done/` (`status: done` + `commit` + `executado_em: 2026-07-01`). Best-effort — o orquestrador garante.

7. **Invariantes que NÃO podem ser violados** (verifique ao final):
   - Nenhum preâmbulo de processo ("deixa eu buscar/puxar", "vou usar a ferramenta", "um segundo", "preciso primeiro buscar") é persistido/enviado.
   - Nunca duas falas coladas sem separador; status e resposta final em bolhas distintas.
   - A resposta da descoberta chega sem depender de novo input do usuário.
   - Nenhuma frase de fallback técnico ("atualiza a página"/"recarregue"/"dá um refresh").
   - Sincronia OBRIGATÓRIA: mexeu em `system-prompt.ts` → atualize `HARD_RULES.md` no mesmo commit (travado por `HARD_RULES.test.ts`).
   - Copy PT-BR correta (acentos/cedilha).

8. **Evidência `fim-proposta-bugado`:** se a causa de composição for a mesma do FIX-189, trate junto; se a parte de INTENT ("bora" = avançar) for outro bug, registre no `.done/` como "triado, próxima rodada". Não invente root cause.

9. **Ao terminar:** `pnpm typecheck` + `pnpm test:unit` verdes (corrija qualquer vermelho que veja, mesmo pré-existente). **Push da branch** (`git push origin fix/composicao-mensagem-efemera`) + gere `.done/2026-07-01-bloco-streaming-chat-layer.md` (resumo + decisões + testes + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.** A tag-sentinela é injetada no fim deste prompt — só siga o footer.

10. **RESUMO FINAL:** decisões de implementação tomadas (uma por linha) + o que ficou triado pra próxima rodada.
