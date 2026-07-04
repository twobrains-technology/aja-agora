Você é o executor do **bloco-cards-recomendacao** no worktree isolado deste branch (`feat/cards-recomendacao-lance`). Projeto: aja-agora (Next.js + Vercel AI SDK 6). Idioma: **PT-BR correto (com acentos — texto de usuário sem acento é defeito)**. Package manager: **pnpm** (nunca npm/yarn).

1. **Leia primeiro:** `docs/jornada/jornada-canonica.md` — seção **"Refino Ata 2026-07-04"** (item 5 cards, item 7 modelo do embutido) e o Passo 5. Depois `docs/correcoes/todo/bloco-cards-recomendacao/` (`_bloco.md` + os cards FIX-220/221/222/223/224 — cada um com root cause `file:line`, correção e regressão). Consulte também os cards do inbox citados (ex.: `docs/correcoes/inbox/2026-07-02-dial-parcela-apos-lance-identica-rotulada-menor.md`).

2. **DESIGN:**
   - FIX-220/222/223 vêm fechados — implemente direto.
   - **FIX-221** carrega uma **inversão de modelo financeiro** (T2): a Ata decide que o lance **amortiza** (parcela pós cai), contra o código/`CONTEXT.md` D18/C4 + `system-prompt.ts:222` atuais. Implemente o modelo amortização atrás de teste, **atualize** os testes/prompt que assumiam o modelo antigo (TDD, nunca skip), e **registre a inversão + o PENDENTE-Bernardo** no ADR.
   - **FIX-224** tem decisão de UX real (ordem/consolidação dos 3 blocos): use `superpowers:brainstorming` + **`AskUserQuestion`** (recomendada em 1º, rótulo "(Recomendado)"; fallback anti-trava: siga a recomendada). Registre em `docs/decisoes/blocos/2026-07-04-bloco-cards-recomendacao.md` (contexto · opções · escolhida + porquê). Commit `docs:` do ADR.

3. **Execute NA ORDEM:** FIX-220 → **FIX-221** → FIX-223 → FIX-222 → FIX-224 (224 depois de 221). **TDD strict** pra cada: teste que reproduz o cenário primeiro, vê falhar, corrige, vê passar.
   - ⚠️ FIX-221: com lance embutido, `paymentAfterContemplation < monthlyPayment`; rótulo nunca mente; enunciado "recebe menos" presente. **PENDENTE-Bernardo** o número exato.
   - ⚠️ FIX-222: **migration via drizzle** (arquivo versionado), NUNCA `ALTER` manual contra o banco. Assets de logo reais são PENDENTE — implemente pipeline + fallback.
   - ⚠️ Números do card são **coagidos server-side** (`recommendation-payload.ts`) — nunca deixe a LLM fabricar (regra de números reais da jornada).
   - A recomendação **2 estágios completa é ONDA 2** — aqui só a 1ª lista neutra + o gancho.

4. **1 commit Conventional (PT-BR) por item.**

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` (`status: done` + `commit` + `executado_em: 2026-07-04`). Bloco esvaziou → apague a pasta.

6. Ao terminar: `pnpm test:unit` verde + **push da branch** (`git push origin feat/cards-recomendacao-lance`) + gere `.done/2026-07-04-bloco-cards-recomendacao.md` com uma seção **PENDENTE-Bernardo** (número do modelo amortização) e **PENDENTE (assets)** (logos das administradoras). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart.** (Migration: só gere o arquivo drizzle; NÃO aplique contra banco remoto.)

7. **RESUMO FINAL:** decisões de design (em especial a ordem dos 3 blocos de FIX-224 e a inversão do modelo do embutido) + o que ficou PENDENTE-Bernardo/assets.
