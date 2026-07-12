Você é o executor do bloco **bloco-r9-compliance-copy** (rodada r9, loop de goal — jornada
de vendas de consórcio) no worktree isolado do branch `fix/r9-compliance-copy`.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-r9-compliance-copy/` inteira (`_bloco.md` + `fix-277-...md` +
   `fix-278-...md` — cada um já traz root cause provado com file:line, correção proposta e
   regressão exigida). Não precisa investigar de novo: a causa já está fechada em cada card.

2. Ambos os itens têm correção já decidida (copy/invariante fechados) — **PULE** a etapa de
   brainstorming/design (não há trade-off de arquitetura em aberto). Se, ao editar, você
   perceber uma alternativa genuinamente melhor pro texto (ex.: variações de copy pra
   evitar repetição literal em toda conversa), decida você mesmo e registre o porquê no
   resumo final — não precisa de `AskUserQuestion` pra isso.

3. Execute os itens NA ORDEM de `itens:` do `_bloco.md` (FIX-278 primeiro, depois FIX-277).
   **TDD strict**: escreva/ajuste o teste de regressão de cada item, rode e confirme que
   FALHA com o comportamento atual, só então implemente o fix, rode de novo e confirme que
   PASSA.
   - **FIX-278** exige tocar `closing-presentation.ts` **E**
     `closing-presentation.test.ts` no MESMO commit — o teste atual pina o texto errado
     ("Você está contratando um consórcio"); atualize a asserção pra a nova copy de
     "reserva de cota" ANTES de considerar o item fechado.
   - **FIX-277** tem duas partes: (a) corrigir a direção do aviso de ajuste no
     `recommendation-card.tsx` (paridade com o padrão já correto de `real-offer.tsx`); (b)
     adicionar a regra dura no `system-prompt.ts` comparando `rawCreditValue` × `creditValue`
     antes de afirmar exatidão. Cubra as duas nos testes (componente + integração/cassette
     conforme o card pedir).

4. **1 commit Conventional (PT-BR) por item** — ex. `fix: corrige terminologia de fechamento
   para reserva de cota (FIX-278)`, `fix: corrige direção do aviso de ajuste de valor da
   carta (FIX-277)`. Nunca misture os dois itens no mesmo commit.

5. Ao concluir cada item: **mova** o `fix-NN-....md` pra `docs/correcoes/done/`, atualizando
   o frontmatter (`status: done`, `commit: <hash>`, `executado_em: <data>`) — best-effort
   (o orquestrador confirma via `merge-wave.sh` se você esquecer). Quando o bloco esvaziar
   (só sobrar `_bloco.md`/`_prompt.md`), apague a pasta do bloco.

6. Ao terminar: rode `pnpm test:unit` completo e confirme verde antes de finalizar. **Push da
   branch** (`git push origin fix/r9-compliance-copy`) + gere
   `.done/{data}-bloco-r9-compliance-copy.md` (resumo do que foi feito, decisões tomadas,
   testes escritos, gaps se houver). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart,
   NÃO crie reminder.** A integração na base é do orquestrador (via `merge-wave.sh`).

7. **Atenção a overlap textual (nível 2) em `system-prompt.ts`** com o bloco irmão
   `bloco-r9-gate-funil` (roda em paralelo, branch `fix/r9-gate-funil`): este bloco edita
   perto da seção "Valores monetários — NUNCA arredonde" (linha ~585-596); o outro bloco pode
   editar a seção `whatsappOptinSection` (mais abaixo, ~890-919). São regiões diferentes do
   mesmo arquivo — não deveria colidir linha-a-linha; se o merge apontar conflito mecânico
   mesmo assim, é esperado e resolve-se mantendo as duas edições (nenhuma invalida a outra).

8. RESUMO FINAL: liste toda decisão que você tomou por conta própria (redação exata da nova
   copy, formulação da regra dura no prompt, etc.) — "decidi X em vez de Y porque Z", uma
   linha por decisão. Sem decisão nova? Diga isso.
