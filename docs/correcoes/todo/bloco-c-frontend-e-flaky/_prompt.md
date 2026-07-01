Você é o executor do bloco **bloco-c-frontend-e-flaky** no worktree isolado deste branch (`fix/frontend-dup-e-flaky`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: PT-BR. Package manager: **pnpm** (nunca npm/yarn).

## Contexto obrigatório (leia ANTES)
`docs/correcoes/todo/bloco-c-frontend-e-flaky/` — `_bloco.md` + os 2 cards (FIX-184, FIX-185). São dois bugs pequenos, INDEPENDENTES entre si e do agente. Nenhum toca orquestrador/tools.

## Passos
1. **Design:** os cards já trazem root cause + direção. PULE brainstorming — são bugs objetivos. (FIX-184 exige investigação de reprodução; FIX-185 exige provar cleanup vs bug de contagem — mas isso é debugging, não decisão de produto.)
2. **Execute NA ORDEM: FIX-184 → FIX-185. TDD strict.**
   - **FIX-184** (saudação duplicada — bug de rendering React): reproduza local com a stack do workspace (skill `local-dev`) observando o array de mensagens do `useChat` turno a turno; ache a causa (dedup por id faltando / key de lista errada / estado otimista + stream duplicando). Escreva um teste de regressão (component/render test com happy-dom, ou o que couber) que reproduza a bolha duplicada ANTES do fix. Corrija no cliente. NÃO é bug de agente — não mexa em runner/tools/prompt.
   - **FIX-185** (teste flaky pré-existente): prove a causa (cleanup incompleto no setup/teardown vs contagem duplicada real no route). Se for isolamento → torne o teste determinístico (dados/schema efêmeros por teste, padrão do FIX-97). Se for bug de produto (route persistindo a mais) → TDD: regressão primeiro, depois fix no produto. Rode o teste várias vezes pra provar que ficou determinístico.
3. **1 commit Conventional (PT-BR) por item** (`test+fix:`).
4. Ao concluir cada item: mova o `fix-NN` pra `docs/correcoes/done/` (status: done + commit + executado_em: 2026-07-01). Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante.)
5. Ao terminar: gate verde (`pnpm test:unit` + `pnpm test:integration` + `pnpm build`). **Push da branch** (`git push origin fix/frontend-dup-e-flaky`) + gere `.done/2026-07-01-bloco-c-frontend-e-flaky.md`. **NÃO abra PR, NÃO faça merge, NÃO deploy, NÃO reminder.**
6. RESUMO FINAL: causa raiz de cada bug (provada) + o que corrigiu. Sem decisão de design? Diga isso.
