Você é o executor do bloco **bloco-motor-calculo** no worktree isolado deste branch (`feat/motor-calculo-contemplacao`). É o CORAÇÃO NUMÉRICO da onda "agente de vendas de consórcio" — módulos puros, sem UI, sem prompt.

1. Leia, nesta ordem:
   - `docs/correcoes/README.md` (regras do fluxo)
   - `docs/correcoes/todo/bloco-motor-calculo/` — `_bloco.md` (contrato de saída!) + os 3 cards `fix-225/226/227`
   - A SPEC canônica: `docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/docs/03-regras-calculo.md` e a implementação de referência **pronta** em `.../docs/03c-implementacao-referencia.ts` (adapte, não copie cego).

2. DESIGN: o design está FECHADO nos cards + spec (root cause + fórmula canônica prontos). NÃO brainstorme, NÃO faça perguntas — implemente. Exceção: se ao codar você descobrir que a fórmula da spec quebra um invariante REAL do código (ex.: o AMORTIZA FIX-221), PARE, registre em `docs/decisoes/blocos/2026-07-09-motor-calculo-ajuste.md` e siga a spec marcando o ponto com `PENDENTE-KAIRO`.

3. Execute os itens NA ORDEM: FIX-225 (curva) → FIX-226 (guardrail) → FIX-227 (âncora). **TDD strict**: escreva o teste que FALHA antes do fix, veja falhar, corrija, veja passar.

4. INVARIANTES QUE NÃO SE NEGOCIAM (Lei de arquitetura do projeto — invariante financeiro é CÓDIGO):
   - MANTER o modelo AMORTIZA (`contemplation-dial.ts:116-122`, FIX-221) e a faixa `<8% → sorteio`. Só a CURVA muda.
   - `winningBidPct` derivado POR OFERTA (`averageBid/creditValue`) — NUNCA % fixo, NUNCA reusar o lance de uma carta em outra.
   - REMOVER `likelihood` (heurística sem base de dado). Ver contrato em `_bloco.md`.
   - Guardrail `netCredit >= valorDoBem` é filtro em CÓDIGO, não regra-no-prompt.
   - NÃO calcular/expor redução de prazo (fora de escopo, D7). Abatimento vira parcela menor, só.
   - Preservar a blindagem NaN (BUG-DIAL-NAN) e as funções `contemplationDialMarks`/`paymentAfterLabel`.

5. 1 commit Conventional (PT-BR, imperativo minúsculo) por item. Ao concluir cada item, MOVA o `fix-NN` pra `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`.

6. Ao terminar: **push da branch** (`git push origin feat/motor-calculo-contemplacao`) e gere `.done/2026-07-09-motor-calculo.md` (resumo + testes verdes + gaps). **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** A integração na base é do ORQUESTRADOR. Rode `pnpm test:unit` (ou o subconjunto dos arquivos tocados) e garanta VERDE antes do push.

7. RESUMO FINAL: liste as decisões que tomou ("decidi X em vez de Y porque Z"). Sem decisão de design real? Diga isso.
