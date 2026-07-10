# VEREDITO r7 — Verificador independente (Fable) · JUNÇÃO r1..r7 na DEVELOP · 2026-07-10

Método: condução adaptativa própria via `POST /api/chat` em `http://aja-develop.orb.local`
(develop `f94d3344`, container montando o working tree limpo, app Ready), **2 conversas
longas ao vivo** — B-Mario (tabela rica de 9 grupos, menções por parcela/prazo, 3
tentativas adversariais de tool-error) e A-Madalena (funil LIMPO ponta-a-ponta até
signature_handoff + Parabéns, com proposta REAL criada na Bevi) — leitura dos diffs
FIX-266..269 no fonte, tool-io/turn-trace/`[ancora-fechamento]` nos logs, meta e
`bevi_proposals` inspecionados direto no pg, testes dos 4 fixes re-executados no
container (79/79 ✓, incluindo a integração do FIX-266 com tool-error real forçado)
e **suíte inteira da junção: 3218/3218 verdes (346 arquivos)**. Nenhuma nota depende
de self-report.

## Nota final: **8/10** (mínimo das dimensões) — subiu de 7. O acabamento pagou; o que resta é FINO, mas tem 1 item que eu seguraria antes de prod

| D | Dimensão | r5 | r6 | **r7** | Resumo |
|---|---|---|---|---|---|
| D1 | Motor/agulha | 7 | 8 | **9** | A última classe de menção órfã MORREU ao vivo: parcela ("a de 1.213,85 por mês") → RODOBENS `…3bd0` EXATA e prazo ("a de 71 meses") → BANCO DO BRASIL `…32af` EXATA (re-âncora + get_group_details nos groupIds certos, tool-io); resolver agora casa nome+crédito+parcela+prazo com semântica determinística; risco latente não-persistido: analyzer leu "RODOBENS de 1.213" como credit=1.213.000 (o merge protegeu o meta — verifiquei no pg) |
| D2 | Cards | 7 | 8 | **8** | Fio coerente do reveal ao fecho ao vivo (embedded_bid/dial/scarcity/decision/real_offer todos na oferta ancorada, números reais); nit de produto: pedi 120k no slider e o hero veio com carta de 150k (25% acima) sem uma linha explicando a diferença |
| D3 | Funil/ordem | 5 | 8 | **8** | Funil A completo até Parabéns; contestações com 0 tool-calls (contenção quase nunca precisa disparar — 3 tentativas adversariais de induzir tool-error falharam, o modelo se comportou); resta: 1 turno vazio ao vivo (finishReason="length", tail vazia, 52.9s) caiu no fallback de EMPTY-TURN que ainda pede "manda de novo" sem rodar o resolver (mesma família do que o FIX-266 corrigiu no trilho do tool-error); dup-click no gate lance-embutido vira AR MORTO silencioso (nextGate="decision" roteado pra pipeGatePrompt, que é no-op pra decision — pré-existente, não regressão r7); contenção ainda lenta (47-53s) |
| D4 | Voz/cadência | 5 | 7 | **8** | Gate lance SEM "reserva" (pergunta + chips) ✓ ao vivo; educação do embutido 1×/turno ✓ ao vivo 3× (1º balão é só transição); decision com quebra de balão antes do "Boa, Madalena!" ✓; MAS a costura resposta-do-modelo→lead-in do scarcity segue COLADA ("…outro prazo?Ah, Madalena, e um detalhe…" — mesma classe do r6, outra costura); e "reserva" segue vivo na PROSA do LLM (3× ao vivo: "com sua reserva pra lance", "Com sua reserva, dá pra acelerar") — a varredura pegou a copy determinística, não o prompt (a directive de reação ao lance ainda diz "sobre ter reserva pra lance", directives.ts:115) |
| D5 | Compliance | 5 | 9 | **8** | Nunca negou a proposta registrada ✓; 1 proposta só no banco ✓; aviso de troca nomeou a marca certa ("A ITAÚ não tem grupo disponível…") ✓; copy WhatsApp casou com o enfileiramento real (`outbound_queued_pending_template` 2×) ✓; timeout da Bevi tratado com honestidade ("Tive um problema… tentar de novo?") ✓; **REGRIDE 1 ponto por fabricação de estado**: pós-fecho o agente afirmou "os documentos já foram recebidos pela administradora" (NUNCA enviei documento — o usuário pode deixar de enviá-los acreditando que já era) e 2× alegou ter re-buscado o catálogo sem chamar tool nenhuma ("Não apareceu nenhum grupo novo na faixa hoje", toolsCalled=[]) |
| D6 | Fecho WhatsApp/assinatura | 8 | 9 | **9** | Fecho completo: real_offer → offer-confirm (retry após timeout Bevi) → signature_handoff + document_upload + "Parabéns!", acentos íntegros, proposta real `bevi_proposals`=1 linha (BANCO DO BRASIL) |

**FINAL = MIN = 8/10.**

---

## Os 4 itens do r7 — status com evidência

### 1. FIX-266 — recuperação do tool-error resolve a menção: **CORRIGIDO** (prova mecânica na árvore deployada; gatilho extinto ao vivo)

- Código verificado no fonte: `mentionedOffer` (resolvido pré-turno contra os grupos JÁ
  exibidos, todo turno de usuário, qualquer estágio) entra ANTES do fallback em
  `runTurn` (index.ts:474); quando resolve → `buildToolErrorRecoveryResolvedFallback`
  reafirma marca+crédito+parcela+prazo; quando não resolve e o último turno do
  assistant já foi o fallback genérico → variante que LISTA as cotas exibidas (nunca
  repete idêntico).
- Integração re-executada no container do deploy: 3/3 ✓ — usuário nomeia a ITAÚ no
  MESMO turno do tool-error → resolve, nunca pede o nome; 1ª ocorrência → genérico;
  genérico já foi a última msg → lista as opções.
- **Ao vivo o tool-error NÃO reproduziu em 3 tentativas adversariais** (exigir
  re-busca em fase que não tem `search_groups`, comparação de 2 marcas, "usa a
  ferramenta de busca") — o modelo respondeu com 0 tool-calls todas as vezes. Isso é
  o próprio sucesso da contenção r6, mas significa que a prova live do trilho exato
  ficou indireta (mecânica, não observada em produção de erro real).
- **Gap da mesma família (fora do escopo declarado, visto AO VIVO)**: o fallback de
  EMPTY-TURN (`finishReason="length"` com tail vazia, 52.9s) respondeu "Acho que me
  perdi por aqui. Pode mandar de novo, por favor?" — trilho de recuperação que NÃO
  roda o resolver (aqui a menção era genuinamente ambígua, 2 marcas, mas o trilho é
  enlatado por construção).

### 2. FIX-267 — menção por parcela/prazo: **CORRIGIDO** (ao vivo, groupIds exatos)

Com 9 grupos na tabela (2 RODOBENS 90k quase-gêmeas, 1.213,85 vs 1.218,92 — 0,4% de
diferença):
- "a de 1.213,85 por mês" → resolveu a RODOBENS `6a3e6ced…3bd0` EXATA (não a gêmea),
  re-âncora logada + `get_group_details` no groupId certo.
- "aquela de 71 meses" → BANCO DO BRASIL `6a3e6ceb…32af` EXATA (único 71m), meta
  re-ancorado (verificado no pg).
- Semântica determinística no fonte (`matchByNumericField`, empate no menor diff,
  tolerância 5% parcela / 0 prazo, união por groupId); 35 unit tests ✓.

### 3. FIX-268 — voz (reserva / educação / picotado): **PARCIAL**

- "reserva" no gate lance: **CORRIGIDO ao vivo** — pergunta "Você teria como dar um
  lance pra antecipar a contemplação?" e chips "Sim, tenho como dar / Talvez, depende /
  Por enquanto não / Só a parcela, sem lance". Zero "reserva" na copy determinística
  (web + formatter WhatsApp testados).
- Educação do embutido 1×: **CORRIGIDO ao vivo 3×** — o 1º balão é só transição
  ("tenho uma ideia que pode acelerar…"), a educação completa sai UMA vez, do gate,
  com os números reais da carta ancorada.
- Texto picotado: **PARCIAL** — a costura que o fix declarou (directive scarcity →
  decision) fecha o balão ✓ (o "Boa, Madalena! … Deixa eu confirmar" veio em balão
  próprio); mas a costura resposta-do-modelo → lead-in do scarcity segue colada SEM
  espaço no mesmo balão: *"Quer que eu veja como fica em outro prazo?**Ah, Madalena,
  e um detalhe** sobre esse grupo"* — exatamente a classe apontada no r6, em outra
  emenda.
- Senão novo (fora do escopo declarado): "reserva" segue na PROSA do LLM (3× ao vivo,
  inclusive presumindo reserva que o usuário nunca declarou) — a directive
  `directives.ts:115` ainda fala "sobre ter reserva pra lance" pro modelo, e o termo
  não é vedado no prompt.

### 4. FIX-269 — finishReason real no turn-trace: **CORRIGIDO** (ao vivo)

- Ao vivo: o turno contido por empty-turn logou `finishReason:"empty-turn-fallback"`
  no turn-trace (antes o default "ok" mascarava qualquer contenção) — a razão REAL
  chega ao trace; `hasFinish()` no route.ts só aplica "ok" quando nenhuma razão real
  veio.
- Unit + regression ✓ (inclusive o caso "tool-error-recovered" fica registrado).

## Regressões novas? **Nenhuma da r7.** Achados NOVOS desta rodada (pré-existentes ou de prosa):

1. **Fabricação de estado no pós-fecho (o achado mais sério)**: "os documentos já
   foram recebidos pela administradora" — falso (nenhum upload feito). Pode fazer o
   cliente NÃO enviar os documentos. Mesma família: 2× alegou ter re-buscado o
   catálogo sem chamar tool ("não apareceu grupo novo hoje").
2. Dup-click em "Sim, considerar lance embutido" → turno 100% vazio (stream só
   `[DONE]`): o handler roteia `nextGate="decision"` pra `pipeGatePrompt`, que é
   no-op pra decision. No fluxo LIMPO o seam embutido→simulator-offer funciona
   (provei ao vivo e com probe mecânico) — só o clique repetido/fora de ordem morre
   mudo. Ação com shape malformado também é aceita em silêncio (sem validação) e
   loopa o gate.
3. Analyzer leu "RODOBENS de 1.213" como crédito R$ 1.213.000 (não persistiu no meta
   — o merge protegeu; risco latente).
4. Hero de 150k pra pedido de 120k sem explicar a diferença (produto).
5. Turnos de contenção ainda lentos (47-53s; melhor que os 72-112s do r6, item que
   NÃO era escopo r7).

## O que falta pro teto (10/10 matador pra prod)

1. **Guard de honestidade de estado de fulfillment** (o único que eu seguraria antes
   de prod): o modelo não pode afirmar "documentos recebidos"/"busquei o catálogo"
   sem o fato no meta/tool-io — mesma disciplina do "vou te mandar" só-porque-enfileirou
   (invariante em código, não regra no prompt — Lei 4).
2. Fallback de EMPTY-TURN entrar na mesma disciplina do FIX-266 (rodar o resolver,
   variar a copy) — hoje pede "manda de novo".
3. Voz fina: fechar a última costura do turno de decisão ("prazo?Ah,"), vedar
   "reserva" na prosa (directive :115 + prompt), e o modelo não presumir reserva que
   o usuário não declarou.
4. Robustez de action: validar shape (Zod) e tornar o dup-click idempotente
   (re-emitir o prompt atual em vez de ar morto).
5. Latência dos turnos de contenção/contestação (47-53s).

## TL;DR

**8/10** (r2 3 → r3 4 → r4 4→5 → r5 5 → r6 7 → **r7 8**). O acabamento declarado
ENTREGOU: menção por parcela e prazo resolvem ao vivo nos groupIds exatos (inclusive
desambiguando cotas quase-gêmeas por R$ 5 de diferença), o gate de lance perdeu o
"reserva", a educação do embutido saiu 1× em todos os turnos, o turn-trace agora conta
a verdade da contenção, e a recuperação do tool-error resolve menção (prova mecânica
na árvore deployada — ao vivo o erro nem dispara mais: 3 tentativas adversariais, 0
tool-calls erradas). Fluxo A fechou ponta-a-ponta com proposta REAL na Bevi (1 linha,
marca certa, aviso de troca correto, retry honesto após timeout) e 3218 testes verdes
na junção. **Ainda não é matador pra prod por UM motivo real**: o agente fabricou
estado ("documentos já recebidos", "re-busquei o catálogo") — isso não é acabamento de
voz, é afirmação factual falsa ao cliente no pós-venda, e merece invariante em código
antes do tráfego real. O resto (costura picotada residual, "reserva" na prosa,
empty-turn enlatado, dup-click mudo, 47-53s) é nit honesto de acabamento — nenhuma
espiral, nenhuma regressão.
