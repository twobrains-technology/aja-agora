Você é o executor do bloco `bloco-d-alucinacao-oferta`.

CONTEXTO OBRIGATÓRIO ANTES DE TOCAR EM QUALQUER COISA:

Este produto saiu de uma cirurgia que REMOVEU o engessamento do agente (ele estava "bitolado,
respondendo sempre a mesma coisa"). A regra que rege o projeto (CLAUDE.md, "Não engesse o agente"):

  - Invariante verificável → CÓDIGO (dado coagido / fato checado / guard determinístico).
  - CONVERSA (como falar, com que palavra) → É DO MODELO.

O bug deste bloco é INVARIANTE puro: o agente RECOMENDA administradora que NÃO EXISTE nas ofertas
reais (inventou "Bradesco" e "Estrela"; o usuário perseguiu uma oferta fantasma por 4 turnos).
Isso NÃO se resolve com "peça pro modelo não inventar" — regra-no-prompt não segura invariante, e
foi exatamente assim que o produto chegou ao estado engessado. Resolve-se checando o FATO (quais
administradoras a Bevi realmente retornou) e bloqueando a fala que diverge.

1. Leia docs/correcoes/todo/bloco-d-alucinacao-oferta/fix-342 (root cause + correção fechada) e
   o veredito .processo/loop/2026-07-13-desamarra-agente/veredito-rodada-2.md (P0 #1).

2. Sem decisão de design aberta. Execute. Trade-off real não previsto → AskUserQuestion.

3. TDD strict. O teste tem que provar as DUAS direções:
   - com ofertas reais [ITAÚ, ÂNCORA], a fala "recomendo a Bradesco" é DROPADA;
   - com as mesmas ofertas, "recomendo a ITAÚ" PASSA (não vire mordaça — o agente precisa
     continuar falando das ofertas que EXISTEM).
   `listShownOffersForConversation` (choose-offer.ts) já lê as ofertas reais da conversa —
   REUTILIZE, não reinvente.
   Rode SÓ os testes dos arquivos que você tocou.

4. 1 commit Conventional (PT-BR) por item.
5. Mova o fix-342 pra docs/correcoes/done/.
6. push da branch + .done/{data}-bloco-d-alucinacao-oferta.md. NÃO abra PR, NÃO mergeie, NÃO faça deploy.
7. RESUMO FINAL: as decisões que você tomou.
