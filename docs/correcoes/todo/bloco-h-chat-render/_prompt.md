Você é o executor do **bloco-h-chat-render** no worktree isolado deste branch (`fix/chat-render-ux`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn).

1. Leia `docs/correcoes/README.md` (se existir) e `docs/correcoes/todo/bloco-h-chat-render/` — o `_bloco.md` e cada `fix-NN-*.md` (cenário, root cause investigado, correção, regressão).

2. DESIGN: ambos têm fix fechado nos cards — **PULE brainstorming**. FIX-102 tem 3 mitigações no card e a decidida é a **guarda defensiva determinística** (colapsar segmentos idênticos consecutivos) — implemente ESSA, não as outras. Se topar com trade-off real (ex.: onde colocar a guarda — `runner.ts` antes de persistir vs `groupAdjacentText` no render), decida pelo card e registre em `docs/correcoes/decisions/2026-06-28-bloco-h.md` se a escolha não for óbvia (commit `docs:`).

3. Execute **NA ORDEM**: FIX-101 → FIX-102. **TDD strict**: teste de regressão PRIMEIRO, veja falhar, corrija, veja passar.
   - FIX-101: Camada 1 estrutural (happy-dom) — `resume-prompt.test.tsx` asserta que o `DialogContent` renderiza com z-index > 90 (extrai o número e compara). Falha com z-50, passa com z-[110].
   - FIX-102: Camada 1 estrutural — a guarda colapsa segmento/parágrafo 100% idêntico consecutivo antes de persistir/renderizar. É mitigação DETERMINÍSTICA (não mexe no prompt) → cassette Camada 2 opcional; se você mexer no system-prompt/persona, aí o cassette em `tests/regression/agent-trajectory.test.ts` passa a ser obrigatório.

4. **1 commit Conventional (PT-BR) por item** (`test+fix:`).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit` + `executado_em: 2026-06-28`. Bloco esvaziou → apague a pasta.

6. Ao terminar: `pnpm test:unit` verde, **push da branch** (`git push origin fix/chat-render-ux`) + gere `.done/2026-06-28-bloco-h-chat-render.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.**

7. RESUMO FINAL: liste as decisões de design tomadas (ou diga que não houve).
