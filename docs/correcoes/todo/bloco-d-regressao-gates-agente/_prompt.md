Você é o executor do bloco bloco-d-regressao-gates-agente no worktree isolado deste branch.

1. Leia `docs/correcoes/README.md` (regras do fluxo) e
   `docs/correcoes/todo/bloco-d-regressao-gates-agente/fix-354-*.md` — cenário,
   4 testes que já falham, hipótese de causa raiz (NÃO confirmada) e correção
   proposta.

2. Sem decisão de design em aberto que precise de brainstorming — mas HÁ
   investigação de causa raiz obrigatória antes de codar. Use a skill
   `superpowers:systematic-debugging`: rode os 4 testes, confirme as falhas, depois
   `git log -p`/`git bisect` nos arquivos tocados (`src/lib/agent/qualify-state.ts`,
   `src/lib/agent/system-prompt.ts`) entre o commit do fix original (FIX-296) e
   HEAD da develop, pra achar qual mudança reintroduziu cada sintoma. NÃO aplique a
   "correção proposta" do card às cegas — confirme a causa raiz primeiro. Se
   descobrir que o comportamento atual é intencional (mudança de produto
   posterior que o teste não acompanhou), PARE, documente a divergência em
   `docs/decisoes/blocos/<data>-bloco-d-regressao-gates-agente.md` (o quê, opções,
   por quê) em vez de forçar o teste a passar — commit `docs:` desse ADR antes de
   prosseguir.

3. TDD strict (os 4 testes já existem e já falham — não escreva teste novo, é o
   próprio achado): corrija o root cause confirmado, rode os 4 testes até
   passarem, depois rode a suíte completa de `src/lib/agent` e `src/lib/whatsapp`
   pra garantir que não quebrou mais nada. 🚫 Não rode smoke/QA de browser neste
   bloco.

4. 1 commit Conventional (PT-BR) por sintoma corrigido (ex.: um commit pro gate
   `credit`/intent de queixa, outro pra ordem valor-antes-de-identidade no
   system-prompt, outro pro emoji na copy de exemplo) — ou um commit coeso se a
   causa raiz for realmente compartilhada entre os 4.

5. Ao concluir: mova `fix-354-*.md` pra `docs/correcoes/done/` com `status: done` +
   `commit: <hash>` + `executado_em: <data>`. Bloco esvaziou → apague a pasta
   `bloco-d-regressao-gates-agente/`.

6. Ao terminar: **push da branch** (`git push origin fix/regressao-gates-agente`) +
   gere `.done/{data}-bloco-d-regressao-gates-agente.md` (resumo + causa raiz
   confirmada + decisões + testes + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart, NÃO crie reminder.** A integração na base é do orquestrador.

7. RESUMO FINAL: qual era a causa raiz REAL de cada um dos 4 sintomas (não a
   hipótese do card — o que você de fato confirmou), e se algum comportamento
   atual acabou sendo intencional (teste desatualizado) em vez de bug.
