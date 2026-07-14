Você é o executor do bloco `bloco-f-turno-vazio-meta`.

CONTEXTO OBRIGATÓRIO:

Este produto saiu de uma cirurgia que removeu o engessamento do agente (ele estava "bitolado,
respondendo sempre a mesma coisa"). A regra do projeto (CLAUDE.md, "Não engesse o agente"):

  - Invariante verificável → CÓDIGO.
  - CONVERSA (como falar) → É DO MODELO.

⚠️ Nesta campanha já aconteceu DUAS vezes de um "fix" piorar o produto:
- um guard passou a calar o nome VÁLIDO da administradora, e o agente inventou uma desculpa;
- um intercept respondia por texto fixo e repetia a mesma frase byte-a-byte.

NÃO repita o padrão. Não conserte com mais texto fixo, mais guard cego ou mais regra-no-prompt.

1. Leia docs/correcoes/todo/bloco-f-turno-vazio-meta/ (fix-347, fix-348) e o veredito
   .processo/loop/2026-07-13-desamarra-agente/veredito-rodada-4.md (P1.1 e P1.4).

2. **PROVE o root cause do FIX-347 antes de corrigir.** A hipótese principal: o turno esvazia
   porque o SANITIZER dropou tudo (a campanha adicionou vários guards). Verifique no log/turn-trace.
   Se for isso, a correção é dar ao modelo uma chance de reformular COM O MOTIVO do corte — não
   relaxar um guard de invariante, e não emitir texto fixo.

3. TDD strict nos dois. Rode SÓ os testes dos arquivos que você tocou.
   No FIX-348, cuidado pra não virar mordaça: transição curta legítima ("Olha só o que encontrei:")
   tem que PASSAR. O alvo é a REDUNDÂNCIA (3 frases pro mesmo ato).

4. 1 commit Conventional (PT-BR) por item.
5. Mova cada fix-NN pra docs/correcoes/done/.
6. push da branch + .done/{data}-bloco-f.md. NÃO abra PR, NÃO mergeie, NÃO faça deploy.
7. RESUMO FINAL: decisões tomadas + o root cause que você PROVOU.
