Você é o executor do bloco bloco-i-vendedor-proativo no worktree isolado deste branch (forka da
base já com o bloco G — remoção de "Serviços" — integrado).

**Modo de urgência (pedido explícito do operador):** priorize velocidade, mas os dois itens
aqui têm uma fase de INVESTIGAÇÃO obrigatória antes de corrigir — não pule essa fase, ela evita
retrabalho e regressão em código sensível (integração externa Bevi, card com histórico de 5
fixes anteriores).

1. Leia `docs/correcoes/README.md` e esta pasta (`_bloco.md` + `fix-366-...md` +
   `fix-367-...md`). Leia `.processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md`
   (ITENS 4 e 5) pro contexto da campanha.

2. **Sem decisão de design nova** para a parte "manter escassez fora do so_parcela" (já
   decidida por default recomendado no goal doc). A decisão sobre COMO resolver a
   paralelização Bevi (FIX-366) é sua a tomar tecnicamente — se достигnetar ambiguidade real de
   produto (não técnica), use `AskUserQuestion` com opção recomendada em 1º; sem resposta em
   tempo razoável, siga a recomendada e documente no `.done/`.

3. **FIX-367 primeiro (mais barato de investigar, evita reabrir bug antigo por engano):**
   - Leia o histórico de comentários FIX-230/237/246/253/268 em `orchestrator/index.ts` e
     `scarcity-payload.ts` antes de tocar em qualquer linha — entenda por que o card foi
     desenhado do jeito que está.
   - Reproduza (via teste de integração ou simulação local) o cenário "moto, pressa, COM lance"
     (nunca `so_parcela`) até o ponto de decisão. Descubra qual dos 3 caminhos é o real: (a)
     caiu em so_parcela — não corrija, é esperado; (b) sem grupo ancorado no momento certo —
     corrija a ancoragem; (c) grupo ancorado mas oferta Bevi sem `availableSlots` — não invente
     número, documente como gap de dado externo.
   - Se for (b): TDD strict — teste que prova a ancoragem correta e o card aparecendo com
     número real.
   - Se for (a) ou (c): não há fix de código — escreva a conclusão da investigação no
     `.done/` deste bloco (é uma entrega válida: "investigamos, a causa real é X, não é bug de
     código").

4. **FIX-366 depois:**
   - Investigue se a Bevi tolera 2 chamadas concorrentes na mesma proposta ativa (`setSegment`
     em `bevi-self-contract-adapter.ts:282-284` muda estado compartilhado) — leia o
     cookbook/doc citada nos comentários `:351-369`, ou monte um teste manual/sandbox se
     houver ambiente pra isso. Documente a conclusão.
   - Se concluir que é seguro paralelizar: implemente com `Promise.all` (ou equivalente) as
     duas chamadas de `offersForValue`. TDD strict: teste que prova que o resultado (oferta
     COM e SEM embutido) permanece íntegro e que o tempo total não é maior que o sequencial.
   - Se concluir que NÃO é seguro: implemente a alternativa que você achar mais razoável
     (ex.: pré-fetch assíncrono via segunda sessão/proposta, ou aceitar uma janela de atraso
     menor) e documente a decisão técnica no `.done/`.
   - Depois, reforce (via prompt/directive do orquestrador, NÃO regex/texto fixo) a sugestão
     proativa de lance embutido quando o cliente diz que não tem aporte (`hasLance:"no"`) e já
     existe oferta de embutido pré-buscada. Reforce a explicação em
     `embedded-bid-payload.ts` com o ângulo "parcela alta até contemplar, cai depois da
     amortização, ainda vale a pena". Essa parte comercial NÃO tem TDD — será validada pelo
     juiz da campanha nos 3 cenários E2E (dossiê de conversa), não por asserção de texto.

5. Rode SÓ os testes dos arquivos que você tocou — NUNCA a suíte inteira.
6. 1 commit Conventional (PT-BR) por sub-passo relevante.
7. Mova os fix-NN pra `docs/correcoes/done/` com `status: done` + `commit:` + `executado_em:`
   (best-effort).
8. Ao terminar: push da branch (`git push origin fix/vendedor-lance-embutido-escassez`) + gere
   `.done/{data}-bloco-i-vendedor-proativo.md`. NÃO abra PR, NÃO faça merge, NÃO rode
   deploy/restart.
9. RESUMO FINAL: liste as decisões técnicas tomadas — em especial a conclusão da investigação
   de concorrência da Bevi (FIX-366) e a causa real da ausência do card de escassez (FIX-367).
