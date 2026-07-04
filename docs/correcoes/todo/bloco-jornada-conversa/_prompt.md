Você é o executor do **bloco-jornada-conversa** no worktree isolado deste branch (`feat/jornada-conversa-reserva`). Projeto: aja-agora (Next.js + Vercel AI SDK 6, um agente / dois canais Web+WhatsApp). Idioma: **PT-BR correto (com acentos — texto de usuário sem acento é defeito)**. Package manager: **pnpm** (nunca npm/yarn).

1. **Leia primeiro:** `docs/jornada/jornada-canonica.md` — em especial a seção **"Refino Ata 2026-07-04"** (é a REGRA nova: lance sai da entrada; terminologia "reserva de cota"). Depois `docs/correcoes/todo/bloco-jornada-conversa/` (`_bloco.md` + os cards FIX-215/216/217 — cada um tem root cause com `file:line`, correção e regressão exigida).

2. **DESIGN (só onde há decisão de UX real):**
   - FIX-216 e FIX-217 já vêm fechados nos cards — implemente direto, sem reabrir.
   - FIX-215 tem UMA decisão de UX aberta: **onde exatamente a conversa de lance re-entra no pós-reveal** (logo após mostrar as opções? só quando o usuário demonstra interesse numa cota? via botão "quero acelerar minha contemplação"?). Use `superpowers:brainstorming` e **FAÇA a pergunta via `AskUserQuestion`** (opção recomendada em 1º, rótulo terminando em "(Recomendado)"). **Fallback anti-trava:** sem resposta em tempo razoável, siga a recomendada — não trave. Registre a decisão em `docs/decisoes/blocos/2026-07-04-bloco-jornada-conversa.md` (contexto · opções · escolhida + porquê). Commit `docs:` desse ADR.

3. **Execute NA ORDEM:** FIX-216 (copy) → FIX-217 (gate identify WhatsApp determinístico) → FIX-215 (remover lance do início + reorder). **TDD strict** pra cada: escreva/atualize o teste que reproduz o cenário, veja falhar, corrija, veja passar.
   - ⚠️ FIX-215 vai **quebrar** testes que hoje asseguram lance/educação-embutido ANTES da busca (cassetes de `qualify-state`, resíduos de FIX-92/118/212). **Reescreva-os** pro novo esperado (lance é pós-reveal) — NUNCA `skip`/`.only`/`--no-verify`/`@ts-ignore`.
   - ⚠️ FIX-216: **só** troque texto de usuário; identificadores de código (`intent:"contratar"`, `contractState`, `present_contract_form`) permanecem.
   - Paridade Web×WhatsApp é regra-mãe: todo passo vale nos dois canais.

4. **1 commit Conventional (PT-BR) por item** (`feat:`/`fix:`/`test+fix:`, imperativo minúsculo, sem ponto final).

5. Ao concluir cada item: MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit: <hash>` + `executado_em: 2026-07-04`. Bloco esvaziou → apague a pasta. (Best-effort — o orquestrador garante via merge/reconcile.)

6. Ao terminar: `pnpm test:unit` verde + **push da branch** (`git push origin feat/jornada-conversa-reserva`) + gere `.done/2026-07-04-bloco-jornada-conversa.md` (resumo + decisões de design + testes + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart/migration, NÃO crie reminder.** A integração na base é do orquestrador; a tag-sentinela de conclusão é injetada automaticamente no fim deste prompt.

7. **RESUMO FINAL:** liste as decisões de design que tomou ("decidi X em vez de Y porque Z") — em especial onde a conversa de lance re-entra no pós-reveal. Sem decisão? Diga isso.
