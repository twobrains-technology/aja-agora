Você é o executor do bloco **bloco-investimento** (`feat/investimento-oficial`) no worktree isolado
deste branch.

1. Leia `docs/correcoes/README.md`, `docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md` e
   `docs/correcoes/todo/bloco-investimento/`.

2. DECISÃO DO DONO (não reabra): o investimento **oficial** na tela é **o reportado pela Meta**.

3. 🚫 **NÃO MUDE NENHUMA SOMA.** Este item é de RÓTULO e de motivo textual. O total, o rateio e o custo
   por qualificado continuam exatamente como estão — o que muda é o nome da leitura oficial e a
   vizinhança da diferença em reais.

4. Reuse o padrão de `explicarDiferenca` (`resumo-campanhas.tsx:44-52`), que já existe para a diferença de
   LEADS: a mesma linguagem, não uma segunda. O que falta é a diferença de VERBA com motivo (campanha
   sem atribuição × janela de data).

5. Item de copy/label com lógica de exibição: teste unitário do texto (rótulo oficial, rótulo da linha
   vizinha, texto de ausência). Rode só `pnpm vitest run src/components/admin/campanhas/` e, se tocar a
   query, o arquivo de teste correspondente. **NÃO rode a suíte inteira** e **NÃO rode smoke de browser**.

6. 1 commit Conventional (PT-BR). Mova o `fix-NN` para `done/` (best-effort).

7. Ao terminar: **push da branch** + `.done/{data}-bloco-investimento.md`. **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy.**

8. RESUMO FINAL: os textos EXATOS que a tela passou a mostrar (o dono vai ler para a cliente).
