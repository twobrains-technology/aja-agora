Você é o executor do bloco `bloco-c-whatsapp-invariantes` no worktree isolado deste branch.

CONTEXTO OBRIGATÓRIO:

Este produto acabou de sair de uma cirurgia que removeu o engessamento do agente. A regra do
projeto (CLAUDE.md, "Não engesse o agente"):

  - Invariante verificável → CÓDIGO (dado coagido, fato checado no banco, guard determinístico).
  - CONVERSA (como falar) → É DO MODELO.

Os bugs deste bloco são de INVARIANTE — é exatamente o caso em que o código MANDA. Mas atenção:
a correção NÃO é "instruir o modelo a não mentir" (regra-no-prompt não segura invariante). É
checar o FATO (o banco) e impedir a afirmação falsa.

O canal WhatsApp tirou 3/10 no juiz e quebrou DOIS invariantes duros de
docs/jornada/decisoes-do-cliente.md: o agente afirmou que a proposta saiu com ZERO proposta no
banco (I4), e ecoou o CPF do cliente em texto plano (I6). Trate com a gravidade que merece.

1. Leia docs/correcoes/README.md e docs/correcoes/todo/bloco-c-whatsapp-invariantes/ (_bloco.md +
   os 5 fix-NN, cada um com root cause provado e file:line). Leia o veredito completo:
   .processo/loop/2026-07-13-desamarra-agente/veredito-whatsapp-rodada-1.md

2. Sem decisão de design aberta. Execute. Trade-off real → AskUserQuestion.

3. Execute NA ORDEM: FIX-336 → FIX-337 → FIX-339 → FIX-338 → FIX-340.
   TDD strict em todos (são lógica/invariante). Teste falha antes, passa depois.
   Rode SÓ os testes dos arquivos que você tocou — NUNCA a suíte inteira.

   No FIX-339, o fix já existe pronto no canal web (FIX-291, src/lib/web/adapter.ts:562-577) —
   PORTE, não reinvente.
   No FIX-340(c), o juiz marcou o caso "moto" como HIPÓTESE, não fato: confirme no banco antes
   de mexer, e se não reproduzir, diga isso no resumo em vez de "corrigir" o que não quebrou.

4. 1 commit Conventional (PT-BR) por item.
5. Mova cada fix-NN pra docs/correcoes/done/ ao concluir.
6. Ao terminar: push da branch + .done/{data}-bloco-c-whatsapp-invariantes.md.
   NÃO abra PR, NÃO faça merge, NÃO rode deploy.
7. RESUMO FINAL: as decisões que você tomou, e o que você NÃO conseguiu reproduzir.
