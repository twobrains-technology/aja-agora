Você é o executor do bloco **bloco-telefone-ab** (`feat/telefone-ab`) no worktree isolado deste branch.
Este bloco tem PRAZO: **quinta-feira 01/10**. É o compromisso que o Kairo assumiu com a cliente
(Aja Agora / Bruna Perrotta).

1. Leia `docs/correcoes/README.md`, `docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md`,
   `docs/decisoes/2026-09-29-copia-do-desbloqueio-do-telefone.md` e
   `docs/correcoes/todo/bloco-telefone-ab/` (o `_bloco.md` tem o contexto da call de 29/09 com as
   palavras de cada um).

2. O QUE ESTE BLOCO ENTREGA: duas maneiras de pedir o telefone no ponto em que a pessoa vê a oferta —
   **B** (telefone antes de liberar a comparação) e **C** (a melhor opção aparece visível e borrada, e
   o telefone desbloqueia) — atribuídas **por visita**, com o resultado separado por variante.

3. A CÓPIA JÁ ESTÁ ESCRITA. Use a do documento, literalmente. **NÃO reescreva, NÃO melhore, NÃO
   traduza.** Ela foi escrita na régua que a Bruna orientou (`Remarketing_WhatsApp_V3.pdf`): uma
   pergunta só, curta, sem prometer contemplação, sem citar administradora por nome, LGPD explícita.
   Se você achar que a cópia não cabe no componente, PARE e registre a dúvida — não invente texto.

4. Antes de codar, CONFIRME no repo onde cada coisa vive (não presuma pelos nomes nos cards): onde o
   card de comparação é renderizado, onde o telefone é capturado hoje
   (`src/components/chat/artifacts/gate-identity-form.tsx` é o candidato), e qual identificador de
   visita já existe. Registre no ADR o que encontrou — inclusive se a premissa de algum card estiver
   errada.

5. TDD STRICT nos cinco itens. Rode só o que tocar: `pnpm vitest run src/lib/chat/`,
   `pnpm vitest run src/components/chat/`, `pnpm vitest run src/lib/admin/`. **NÃO rode a suíte
   inteira** e **NÃO rode smoke de browser**.

6. 🚫 LINHAS VERMELHAS: **nenhum teste ou código pode disparar mensagem real de WhatsApp** (nem
   template, nem teste A/B na Meta). Telefone e e-mail de teste são FALSOS. Nada de PII real em
   arquivo versionado. Não mexa em `src/app/admin/` (a tela vem em outro bloco).

7. 1 commit Conventional (PT-BR) por item. Mova o `fix-NN` para `done/` (best-effort). ADR em
   `docs/decisoes/blocos/2026-09-29-bloco-telefone-ab.md` — e nele diga o que muda no painel quando a
   correção do "viu oferta" entrar (os números do histórico vão mudar).

8. Ao terminar: **push da branch** + `.done/{data}-bloco-telefone-ab.md`. **NÃO abra PR, NÃO faça
   merge, NÃO rode deploy.**

9. RESUMO FINAL, em 6 linhas: como a visita recebe a variante; o que a pessoa vê em cada caminho;
   onde ficou registrado; como o dono lê o resultado no dia 01/10; e o que você NÃO conseguiu fechar.
