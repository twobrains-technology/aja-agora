Você é o executor do bloco **bloco-toques** (`feat/toques-lista`) no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-toques/` (`_bloco.md` + cada `fix-NN`).

2. CONTEXTO: o dono perguntou na reunião de 22/09 *"já foram enviados oito — para quem que foi? E como
   que foi? Foi o primeiro toque, o segundo ou o terceiro?"* e a resposta hoje só existe agregada. Sua
   tarefa é dar PORTA a essa pergunta.

3. OVERLAP CONHECIDO: o bloco `bloco-regua` (rodando em paralelo) também edita
   `src/lib/admin/remarketing-tela.ts` e `src/app/api/admin/remarketing/route.ts`, em regiões
   diferentes. **Não tente evitar o overlap** — faça a sua parte e deixe o merge com o orquestrador.
   Só NÃO reformate o arquivo inteiro (isso transformaria overlap textual em conflito real).

4. DESIGN: sem decisão de design em aberto. No FIX-380, a ordem é **reuso primeiro**: derive a forma de
   `messages.template_name` + `whatsapp_outbound_queue`; **só peça coluna nova se o reuso comprovar que
   não cobre o caso**, e registre o porquê em `docs/decisoes/blocos/2026-09-28-bloco-toques.md` com
   commit `docs:`.

5. TDD conforme cada card (lógica → teste primeiro; texto/rótulo sem lógica → direto, sem teste).
   Rode só o que tocar: `pnpm vitest run src/lib/admin/` e
   `pnpm vitest run src/components/admin/remarketing/`. **NÃO rode a suíte inteira** e **NÃO rode
   smoke/QA de browser**.

6. 🚫 **NÃO DISPARE MENSAGEM REAL** de WhatsApp em nenhum teste ou comando.

7. 1 commit Conventional (PT-BR) por item, na ordem de `itens:`.

8. Ao concluir cada item, mova o `fix-NN` para `docs/correcoes/done/` com `status: done`, `commit:` e
   `executado_em:` (best-effort).

9. Ao terminar: **push da branch** + `.done/{data}-bloco-toques.md`. **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy.**

10. RESUMO FINAL: as decisões de design que você tomou (inclusive "não criei coluna porque o reuso
    cobriu") e os arquivos em que você espera conflito com o `bloco-regua`.
