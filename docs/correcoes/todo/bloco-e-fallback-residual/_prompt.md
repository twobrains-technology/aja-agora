Você é o executor do bloco `bloco-e-fallback-residual`.

CONTEXTO OBRIGATÓRIO:

Este produto saiu de uma cirurgia que removeu o engessamento do agente. A regra (CLAUDE.md, "Não
engesse o agente"):

  - Invariante verificável → CÓDIGO.
  - CONVERSA (como falar) → É DO MODELO.

O FIX-343 é o **sintoma-mor** do produto: o servidor DESCARTA a fala do modelo e cospe um texto
fixo quando uma tool dá erro. O dono descreveu isso como "o agente responde sempre a mesma coisa".
Uma rodada anterior já atacou isso e NÃO bastou — ainda dispara em 5 de 8 jornadas, com um loop de
3× em serviços.

⚠️ É PROIBIDO "consertar" isso adicionando mais texto fixo, mais guard ou mais regra-no-prompt. O
bug É uma camada dessas. A correção é REMOVER o caminho em que o servidor fala no lugar do modelo,
dando ao modelo o DADO/tool de que ele precisa pra se corrigir sozinho no próprio turno.

1. Leia docs/correcoes/todo/bloco-e-fallback-residual/ (fix-343 e fix-344) e o veredito
   .processo/loop/2026-07-13-desamarra-agente/veredito-rodada-2.md (P0 #2 e #3).

2. **PROVE o root cause antes de corrigir** (o fix-343 não traz a causa fechada — traz o método):
   suba/observe os logs e descubra QUAL tool está sendo negada agora e por quê. Não corrija no
   escuro. Se precisar, use AskUserQuestion.

3. TDD strict nos dois. Rode SÓ os testes dos arquivos que você tocou.
   Invariante que NÃO pode quebrar: continua PROIBIDO re-buscar na Bevi pós-reveal.
   No FIX-344, cuidado: o beat "te mandei uma mensagem / responde com um oi" deve CONTINUAR
   existindo no canal WEB (é lá que faz sentido) — some só no WhatsApp.

4. 1 commit Conventional (PT-BR) por item.
5. Mova cada fix-NN pra docs/correcoes/done/.
6. push da branch + .done/{data}-bloco-e-fallback-residual.md. NÃO abra PR, NÃO mergeie, NÃO faça deploy.
7. RESUMO FINAL: as decisões que você tomou e o root cause que você PROVOU.
