Você é o executor do bloco `bloco-a-fallback-enlatado` no worktree isolado deste branch.

CONTEXTO QUE VOCÊ PRECISA ENTENDER ANTES DE TOCAR EM QUALQUER COISA:

Este produto acabou de sair de uma cirurgia que REMOVEU o engessamento do agente. A regra que
agora rege o projeto está no CLAUDE.md, seção "Não engesse o agente":

  - Invariante verificável (a Bevi exige CPF antes de simular; número nunca é inventado) → CÓDIGO.
  - CONVERSA (como perguntar, com que palavra, o que responder) → É DO MODELO.

É PROIBIDO "consertar" este bug adicionando mais uma camada de texto fixo, mais um guard, ou
mais uma regra-no-prompt. O bug É uma camada dessas. A correção é REMOVER o caminho que faz o
servidor responder no lugar do modelo, dando ao modelo o DADO de que ele precisa.

1. Leia docs/correcoes/README.md e docs/correcoes/todo/bloco-a-fallback-enlatado/ (o _bloco.md e
   o fix-332 — root cause já provado nos logs, correção já desenhada).
   Leia também .processo/loop/2026-07-13-desamarra-agente/veredito-web-rodada-1.md (P0 #1) e
   veredito-whatsapp-rodada-1.md (o mesmo fallback aparece nos dois canais).

2. Sem decisão de design aberta — o fix-332 traz a correção fechada. NÃO brainstorme, execute.
   Se você encontrar um trade-off REAL não previsto, use AskUserQuestion (recomendada em 1º).

3. TDD strict (é bug de lógica/fluxo): escreva o teste de integração que REPRODUZ o loop
   (conversa pós-reveal → modelo chama search_groups → hoje vira tool-error + texto enlatado),
   veja FALHAR, corrija, veja passar. Rode SÓ os testes dos arquivos que você tocou
   (`pnpm exec vitest run <path>`) — NUNCA a suíte inteira (ela roda no gate da integradora).

   ⚠️ Invariante que não pode quebrar: continua PROIBIDO re-buscar na Bevi pós-reveal. A tool
   devolve os grupos JÁ EXIBIDOS (leia os artifacts — `orchestrator/choose-offer.ts:44-80` já faz
   isso, reutilize). Prove com spy que o adapter da Bevi NÃO foi chamado.

4. 1 commit Conventional (PT-BR) por item.

5. Ao concluir, mova o fix-332 pra docs/correcoes/done/ com status: done + commit + executado_em.

6. Ao terminar: push da branch + gere .done/{data}-bloco-a-fallback-enlatado.md.
   NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart.

7. RESUMO FINAL: liste as decisões que você tomou ("decidi X em vez de Y porque Z"). Sem decisão? Diga.
