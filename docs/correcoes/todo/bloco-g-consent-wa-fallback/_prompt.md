Você é o executor do bloco `bloco-g-consent-wa-fallback`.

CONTEXTO OBRIGATÓRIO:

Este produto saiu de uma cirurgia que removeu o engessamento do agente. A regra (CLAUDE.md, "Não
engesse o agente"):

  - Invariante verificável → CÓDIGO.
  - CONVERSA (como falar) → É DO MODELO.

⚠️ Nesta campanha, DUAS vezes um "fix" piorou o produto: um guard calou o nome VÁLIDO da
administradora (e o agente inventou uma desculpa), e um intercept respondia por texto fixo repetido.
NÃO conserte com mais texto fixo nem regra-no-prompt.

O FIX-350(b) é o exemplo perfeito da regra: o guard já impede a MENTIRA (citar administradora
inexistente), mas o agente responde mal porque ninguém lhe deu o FATO. A correção é injetar o fato
no contexto ("a Bradesco não está nas opções; as reais são X, Y, Z") e deixar o MODELO redigir —
igual ao que já existe em `system-context.ts` (`exactnessFacts`).

1. Leia docs/correcoes/todo/bloco-g-consent-wa-fallback/ e o veredito
   .processo/loop/2026-07-13-desamarra-agente/veredito-rodada-4.md (P1.2, P1.3, P1.5).

2. **PROVE o root cause do FIX-349**: em `servicos-whatsapp` o gate `reco-consent` NUNCA aparece na
   conversa inteira. Descubra por quê (nextGate/turn-trace/log). Não corrija no escuro.

3. TDD strict. Rode SÓ os testes dos arquivos que você tocou.

4. 1 commit Conventional (PT-BR) por item.
5. Mova cada fix-NN pra docs/correcoes/done/.
6. push da branch + .done/{data}-bloco-g.md. NÃO abra PR, NÃO mergeie, NÃO faça deploy.
7. RESUMO FINAL: decisões + root cause PROVADO.
