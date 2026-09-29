Você é o executor do bloco **bloco-custo** (`feat/custo-de-ia-e-mensagem`) no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md`, `docs/decisoes/blocos/2026-09-28-decisoes-da-frente-aja.md` e
   `docs/correcoes/todo/bloco-custo/`.

2. DECISÃO DO DONO — **ROTA B**, e isto é YAGNI explícito no spec (`docs/design/specs/2026-09-28-goal-aja-agora-pessoa-como-unidade.md`,
   seção "Fora de escopo"): o custo de IA é lido da **fonte atual (Langfuse)**, por canal/modelo/dia,
   cruzado com o Postgres pelo `sessionId` que é igual ao `conversationId`. **NÃO** crie tabela
   `usos_de_ia`, **NÃO** crie `precos-dos-modelos.ts`, **NÃO** grave tokens do turno no banco. Se você
   achar que a rota B não fecha, PARE e registre a dúvida no ADR — não decida sozinho trocar de rota.

3. Fonte: as credenciais do Langfuse vivem no vault (`secrets.sh get-key …`), nunca no repo, nunca em
   log, nunca em teste. Em teste, use fixture/mock — **nunca** chame o Langfuse de verdade.

4. GARANTIA QUE VALE PARA OS TRÊS ITENS: **ausência de preço significa "não calculável", nunca
   "R$ 0,00"**, e a tela diz QUAL dos dois motivos (falta de dado × falta de vínculo). Escreva o teste
   disso ANTES de implementar.

5. TDD STRICT nos três (é número). Rode só o que tocar: `pnpm vitest run src/lib/admin/` e
   `pnpm vitest run src/components/admin/performance/`. **NÃO rode a suíte inteira** e **NÃO rode smoke
   de browser**.

6. 1 commit Conventional (PT-BR) por item. Mova o `fix-NN` para `done/` (best-effort). ADR em
   `docs/decisoes/blocos/2026-09-28-bloco-custo.md`.

7. Ao terminar: **push da branch** + `.done/{data}-bloco-custo.md`. **NÃO abra PR, NÃO faça merge,
   NÃO rode deploy.**

8. RESUMO FINAL: de onde exatamente o número de cada custo sai (endpoint/tabela), e o que a tela mostra
   quando o preço de mensagem não está cadastrado.
