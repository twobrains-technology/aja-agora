Você é o executor do bloco bloco-j-resume-escassez-rodada2 no worktree isolado deste branch.

Contexto: esta é a RODADA 2 da campanha `loop-de-goal` "vendedor matador de consórcio"
(`.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md`, aja-agora). Um juiz Sonnet
avaliou a rodada 1 (E2E real com 3 personas via browser) e encontrou 2 gaps que impedem a nota
10/10. Os cards abaixo já têm o root cause investigado no código — não redescubra do zero, mas
confirme antes de implementar.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e este `docs/correcoes/todo/bloco-j-resume-escassez-rodada2/`
   inteiro (`_bloco.md` + `fix-368-*.md` + `fix-369-*.md`) — root cause, cenário, correção
   proposta, regressão exigida.

2. DESIGN: pule o brainstorming formal — ambos os cards já têm correção proposta fechada
   (o quê × onde). A ÚNICA decisão real é dentro do FIX-369: se a hipótese de código
   (bypass via `present_decision_prompt` chamado direto pelo modelo) for REFUTADA na
   reprodução, você tem uma decisão de design genuína sobre qual dos 2 caminhos
   alternativos seguir — aí sim, use `AskUserQuestion` (opção recomendada em 1º lugar,
   rótulo terminando em "(Recomendado)"); sem resposta em tempo razoável, siga a
   recomendada e registre em `docs/correcoes/decisions/2026-07-22-bloco-j-resume-escassez-rodada2.md`.

3. Execute NA ORDEM indicada em `_bloco.md`:
   - **FIX-368**: implemente a nova seção de prompt dinâmica (`resumeAfterCloseSection` ou
     nome equivalente) em `system-prompt.ts`, ativada só quando `contractClosedInfo` existe
     E o turno é reconhecidamente um "retorno pós-fechamento" (reuse o sinal que já existe
     pra mensagens de resume, ou adicione um flag explícito propagado desde
     `theater-chat.tsx` → `route.ts` → `runner.ts`/`resolveAgent`). A seção deve instruir o
     modelo a, na primeira frase, reconhecer que a proposta já foi confirmada/está com a
     administradora e reforçar o encaminhamento pro WhatsApp — SEM travar a frase exata em
     regex (isso é do modelo). TDD: teste de prompt/snapshot que prova que a seção aparece
     no bloco `dynamic` quando as condições batem e NÃO aparece fora delas (ver "Regressão
     exigida" no card — é assertable mesmo sendo comportamento de LLM, porque você está
     testando a MONTAGEM do prompt, não a resposta do modelo).
   - **FIX-369**: primeiro REPRODUZA o cenário da persona 2 (moto, pressa, aceita lance
     embutido) no ambiente local — pode usar o harness de conversa real (chat web) ou um
     teste de integração que force esse caminho — e confirme se `present_decision_prompt`
     chega via tool-call direto do modelo (bypass) ou via `dispatchDecisionCascade`. Registre
     o resultado da reprodução no `.done/` deste bloco ANTES de escrever o fix. Se confirmado
     o bypass: implemente a correção proposta no card (emitir `buildScarcityCard` também no
     hardening de `runner.ts:~1595`, OU tirar `present_decision_prompt` do toolset nessa fase
     — decisão de design, ver passo 2). Se refutado: documente o achado real e escreva um
     fix-NN novo (numeração seguinte) com o root cause verdadeiro, deixando-o em
     `docs/correcoes/inbox/` pra próxima rodada SE não der tempo de corrigir agora, ou
     corrija direto se for simples. TDD: teste de integração do orquestrador que prova que
     o artifact `scarcity` é emitido mesmo no caminho de bypass (ou, se a causa for outra,
     teste cobrindo a causa real).

4. Rode SÓ os testes dos arquivos que você tocou (ex: `vitest run <path>`) — NUNCA a suíte
   inteira. **NÃO rode smoke/QA de browser neste bloco** — a validação E2E das 3 personas é
   da rodada seguinte, no orquestrador.

5. 1 commit Conventional (PT-BR) por item (`test+fix: ...`).

6. Ao concluir cada item: mova o fix-NN pra `docs/correcoes/done/` com `status: done` +
   `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   `docs/correcoes/todo/bloco-j-resume-escassez-rodada2/`.

7. Ao terminar: push da branch (`git push origin fix/resume-escassez-rodada2`) + gere
   `.done/2026-07-22-bloco-j-resume-escassez-rodada2.md` (resumo + decisões + testes + o
   resultado da reprodução do FIX-369 + gaps). NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart, NÃO crie reminder.

8. RESUMO FINAL: liste as decisões que você tomou linha por linha ("decidi X em vez de Y
   porque Z"), incluindo explicitamente se a hipótese do FIX-369 foi confirmada ou refutada.
