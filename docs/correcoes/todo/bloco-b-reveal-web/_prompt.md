Você é o executor do bloco `bloco-b-reveal-web` no worktree isolado deste branch.

CONTEXTO OBRIGATÓRIO ANTES DE TOCAR EM QUALQUER COISA:

Este produto acabou de sair de uma cirurgia que removeu o engessamento do agente (ele estava
"bitolado, respondendo sempre a mesma coisa"). A regra que rege o projeto está no CLAUDE.md,
seção "Não engesse o agente":

  - Invariante verificável → CÓDIGO (dado que não chega ao modelo, ou coerção server-side).
  - CONVERSA (como falar, com que palavra) → É DO MODELO.

PROIBIDO consertar estes bugs com regra-no-prompt do tipo "não fale de X". O modelo desobedece,
e foi assim que o agente ficou engessado. Se a informação NÃO pode ser dita, ela NÃO PODE CHEGAR
ATÉ O MODELO. Corte o dado, não a liberdade.

1. Leia docs/correcoes/README.md e docs/correcoes/todo/bloco-b-reveal-web/ (_bloco.md + fix-333,
   334, 335 — cada um com root cause e correção). Leia também o mockup, que é a referência viva:
   docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/mockups/aja-dois-cenarios.html
   e o veredito .processo/loop/2026-07-13-desamarra-agente/veredito-web-rodada-1.md.

2. Sem decisão de design aberta. Execute. Trade-off real não previsto → AskUserQuestion.

3. Execute NA ORDEM: FIX-333 → FIX-334 → FIX-335. TDD strict (é lógica/fluxo): teste falha antes,
   passa depois. Rode SÓ os testes dos arquivos que você tocou — NUNCA a suíte inteira.

   ⚠️ No FIX-335, cuidado pra não virar mordaça: o objetivo é o agente FAZER em vez de ANUNCIAR,
   não ficar mudo. Não adicione mais proibição do que o necessário.

4. 1 commit Conventional (PT-BR) por item.
5. Mova cada fix-NN pra docs/correcoes/done/ ao concluir (status: done + commit + executado_em).
6. Ao terminar: push da branch + .done/{data}-bloco-b-reveal-web.md.
   NÃO abra PR, NÃO faça merge, NÃO rode deploy.
7. RESUMO FINAL: as decisões que você tomou.
