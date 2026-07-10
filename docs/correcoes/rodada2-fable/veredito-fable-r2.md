# VEREDITO — Verificador independente (Fable) · RODADA 2 · 2026-07-10

Método: condução adaptativa própria via `POST /api/chat` (4 conversas: Fluxo A Madalena
completo até o fecho; Fluxo B Mario 2× — um com desvio realista, um limpo; run C guard;
run D embedded/scarcity), leitura do diff `e5882cb6~1..HEAD` no worktree
`integ/agente-vendas-consorcio`, trace por turno (`turn-trace`/`tool-io` nos logs do
container `aja-app-agente-vendas-consorcio`, bind-mount do worktree confirmado).
**Nenhuma nota depende do self-report do implementador.**

## Nota final: **4/10** (mínimo das dimensões) — NÃO é matador pra prod

| D | Dimensão | r1 | r2 | Resumo |
|---|---|---|---|---|
| D1 | Motor/agulha | 6 | **9** | Âncora de dinheiro VIVA e correta ao vivo (dial mês 11 pelo bolso + narração com ressalva) |
| D2 | Cards | 4 | **4** | Os 3 cards novos continuam com **0 emissões ao vivo** (7 oportunidades): directives existem, mas o LLM desobedece e nada força em código |
| D3 | Funil/ordem | 3 | **5** | 3ª saída funciona e o Fluxo B chega ao contrato; MAS 1 de 2 runs B morreu em beco-sem-saída por alucinação do LLM sem recovery |
| D4 | Voz/cadência | 7 | **6** | PT/léxico ok; regressões novas: valor monetário QUEBRADO em 2 bolhas ("R$ 4." / "000,00"), "booking", bolha interna vazada |
| D5 | Compliance | 5 | **6** | Clamp provado ao vivo (5,2% vs 41% da r1) e "taxa de contemplação" eliminada; MAS o aviso de ajuste está MORTO em integração nos 2 canais |
| D6 | Fecho WhatsApp | 8 | **9** | Fecho visto 2× completo; gramática da r1 consertada; guard novo do contract-submit provado |

---

## Status dos 10 gaps do veredito r1

### G1 (P0) — 3ª saída "só a parcela" / two_paths → **PARCIAL**
**Feito e provado ao vivo:**
- Chip "Só a parcela, sem lance" presente no gate `lance` (visto em 3 runs; `web/adapter.ts:119-123`, union `chat/actions.ts:41`).
- Clique em `so_parcela` → texto respeita a escolha, descreve os dois caminhos SEM % e devolve a decisão ("Não tem certo ou errado… Qual dos dois combina mais com você?") — run B2 limpo.
- Guard do analyzer (`analyze.ts:167-181`): `hasLance` só captura com o gate `lance` ativo — o loop de educação de embutido da r1 NÃO reproduziu; a recusa não é mais engolida.
- **Fluxo B não morre mais**: chegou a `contract_form` → `real_offer` (RODOBENS 90.000, fiel à ancorada) → fecho completo.
**Faltou:**
- O card `two_paths` **nunca emitiu**: 0 de 2 conduções so_parcela (turn-trace `toolsCalled=[]` nos dois). O directive `buildLanceSoParcelaDirective` roda, mas a emissão depende do LLM chamar `present_two_paths` — sem enforcement server-side. Invariante crítico ficou em prompt, não em código.

### G2 (P0) — carta fora da faixa sem aviso → **PARCIAL** (com bug de integração novo)
**Feito e provado ao vivo:**
- **Clamp real** (`partner-offer-mapper.ts:96,144-150`, `MAX_CREDIT_DEVIATION=0.2`): no MESMO cenário da r1 (pedido 120k → ancorada ITAÚ 150k), o fecho entregou **BANCO DO BRASIL 157.845 (5,2% da ancorada)** em vez dos 211.258 (41%) da r1. Compliance de faixa > fidelidade de marca, como documentado.
**Faltou (o aviso continua CÓDIGO MORTO em integração):**
- Web: `route.ts:676` desestrutura `const { proposalId, offer, noOffer } = await startContract(...)` e remonta o objeto — **descarta `requestedCreditValue`** antes de `realOfferPresentation` (que só põe `rawCreditValue` se o campo chegar). Provei ao vivo: `input.valor`=150.000 (`contract-input.ts:43` = `recommendedOffer.creditValue`) ≠ carta 157.845 e o payload da `real_offer` veio **sem `rawCreditValue`** → o aviso FIX-197 não renderiza.
- WhatsApp: `contract-capture.ts:178-187` monta o payload à mão e **não passa `rawCreditValue`** — o aviso novo do formatter (FIX-240) nunca recebe o campo.
- Os testes novos são de folha (closing-presentation e formatter recebem o campo pronto) — nenhum teste cobre o fio inteiro, por isso passaram com o aviso morto.
- **Bug secundário**: a copy reaproveitada do FIX-197 fica semanticamente INVERTIDA no caso FIX-240 — diria "Ajustamos essa carta de R$ 150.000 [o pedido] pra sua faixa de ~R$ 157.845 [a carta]"; "sua faixa" aponta pro valor novo, que não é a faixa do cliente.
- **Troca de administradora silenciosa**: ITAÚ (ancorada a jornada toda, parcela 3.549,75/50m) → "Confirmei com a BANCO DO BRASIL" (4.974/39m, parcela +40%) sem uma palavra de explicação. Os números reais estão no card e o usuário precisa confirmar ativamente — não é a confirmação cega da r1 — mas segue abaixo do padrão CDC art. 30 de oferta clara.

### G3 (P0) — embedded_bid e scarcity órfãos → **PARCIAL**
**Feito:** directives existem (`directives.ts:127-151`) e DISPARAM — fiação em `route.ts` (ramo no/maybe do gate lance, lance-value, pós-simulator) e `orchestrator/index.ts:337-350` (scarcity pré-decision). Vi os directive-turns rodando nos traces.
**Faltou (na prática os cards seguem invisíveis):**
- `embedded_bid`: **0 emissões em 3 oportunidades** — (a) caminho TEXTO do gate lance ("não tenho reserva…") nem passa pela fiação (turn-trace gate=lance-embutido, artifacts=[]); (b) caminho CLIQUE "Por enquanto não": o directive rodou e o LLM chamou `present_whatsapp_optin` no lugar (trace `589b4651`).
- `scarcity`: **0 emissões em 2 oportunidades** — o LLM respondeu ao directive com a bolha "Não tenho nenhuma novidade de vaga pra te passar agora" (vazou pro usuário — defeito de voz) em vez de chamar a tool; e o caminho MAIS comum de decision (LLM chama `present_decision_prompt` num turno de texto, visto no Fluxo A) não passa pela fiação do scarcity.
- Mesma lei violada do G1: emissão de card crítico entregue ao arbítrio do modelo, sem coerção/emissão determinística server-side (os cards têm coerce pronto — era emitir o artifact direto, como o sistema já faz com gates).

### G4 (P1) — âncora de dinheiro morta → **CORRIGIDO** ✅
Provado ao vivo (Fluxo A): "junto uns 4 mil por mês" no gate lance → analyzer capturou `monthlySavings=4000` (log), dial veio com **`initialTargetMonth: 11`** (bolso, não o prazo desejado 6) e o agente narrou "Juntando os R$ 4.000,00 por mês… lá pelo mês 11 o valor guardado já alcança o lance necessário — isso não garante a contemplação nesse mês exato…" — cálculo único (`computeMoneyAnchor`, `dial-payload.ts:53-89`) alimentando slider + narração, com a ressalva compliance correta. FGTS: capturado no analyzer e abatendo em `anchorMonth` (unit-tested; não exercitei imóvel ao vivo).

### G5 (P1) — pergunta do desire engolida → **CORRIGIDO** ✅
3 de 3 runs: pós-nome veio "Prazer, X!" + **"Qual carro/moto você tem em mente?"** (`web/adapter.ts`: pergunta e card independentes; directive do nome atualizado). Motivação capturada e espelhada 1× ("cansar de ônibus é motivo forte…", "quando o carro dá trabalho, atrapalha tudo"). Gate segue não-bloqueante.

### G6 (P1) — decision prematuro + turno morto → **CORRIGIDO** ✅ (ressalva cosmética)
- "Gostei, faz bastante sentido" pós-reveal → SEM decision card (2 runs); guard `premature-decision` visto no log suprimindo com `nextGate()` como fonte da ordem (`artifact-guard.ts:129-146`).
- Re-pedido por TEXTO pós-decision ("quero seguir com esse plano") → `contract_form` emitido na hora (FIX-239b, roteamento determinístico) — o turno morto da r1 sumiu.
- Ressalva: o LLM ainda narra "Então deixa eu confirmar com você:" ANTES da supressão (2 runs) — promessa visível sem card; o turno se recupera com a próxima pergunta, então não trava, mas fica esquisito. (E o `turn-trace.suppressed` não registra essa supressão — gap de observabilidade.)

### G7 (P1) — "taxa de contemplação" na fala → **CORRIGIDO** ✅
Sanitizer `isTaxaContemplacaoClaim` (`sanitizer.ts:116-124`) dropando o segmento + regra no prompt; **zero ocorrências em 4 conduções** (na r1 apareceu na primeira condução B). Argumento de venda observado usa contemplados/mês real ("contempla 6 pessoas por assembleia", "77 por mês") — fonte permitida.

### G8 (P2) — parcela arredondada nos cards → **CORRIGIDO** ✅
`brl2`/`formatBRL2` em comparison-table, contemplation-dial e two-paths; teste novo `parcela-centavos.fix-242.test.tsx`; embedded-bid REFUTADO com razão (payload não tem parcela — só valores de carta). Ao vivo: parcelas com centavos em todos os payloads/cópias (1.073,52; 2.182,01; 3.549,75; 877,75).

### G9 (P2) — contract-submit sem form → **CORRIGIDO** ✅
Provado ao vivo (run C): conversa virgem + `contract-submit` cru → recusa educada + re-engate no funil (gate name), **zero** `insert_proposal_bevi_consorcio` nos logs. Defesa dupla em `route.ts:629-641` (`contractFormDispatched !== true`).

### G10 (P3) — higiene (emoji/comentário stale/exemplo genérico) → **CORRIGIDO** ✅
- Emoji: a contradição tripla sumiu — todas as menções agora dizem a MESMA regra (parcimônia, ≤1 a cada 3-4 balões; linhas 21/126/149/1191 do system-prompt). Pedantismo: a linha 21 se declara "fonte única" e a regra ainda se repete em 3 lugares — consistente, mas não única.
- Comentário FIX-C4 stale do dial corrigido (`contemplation-dial.ts:70-74` agora documenta o AMORTIZA/FIX-221).
- Exemplo genérico "R$ 100 mil" → carta REAL do cliente, visto ao vivo 2×: "na sua carta de R$ 150.000" / "na sua carta de R$ 23.610" (`gate-questions.ts:lanceEmbutidoEdu`).

---

## Regressões / achados NOVOS da r2

| # | P | Achado | Evidência | Onde |
|---|---|---|---|---|
| N1 | **P0** | **Valor monetário QUEBRADO em duas bolhas**: "Juntando R$ 4." ‖ (quebra de parágrafo) ‖ "000,00 por mês" — 2× ao vivo (reação do gate lance e narração da âncora). O splitter de frases trata o "." de milhar como fim de frase. Superfície criada pela própria narração nova do FIX-241 (dinheiro em prosa). Valor monetário ilegível/errado na tela = mesma linha vermelha do CDC que o G8 corrigiu | Fluxo A T12 e T14 | `sanitizer.ts:163` (`splitSegments`, regex `(?<=[.!?:\n])` sem guarda dígito.dígito), `sanitizer.ts:179` (`lastBoundaryIndex`), `runner.ts:119` |
| N2 | **P0** | **Alucinação sobre entidade em tela sem recovery → beco-sem-saída**: usuário escolheu "ITAÚ" (presente na comparison_table emitida no mesmo run) e o agente NEGOU ("não vi um Itaú na lista"), depois inventou groupIds ("ancora-auto-90k", "ancora") — o anchor-guard bloqueou TODOS (correto, nenhum número inventado vazou), mas o agente respondeu com "deixa eu resolver isso e já te retorno" / "assim que eu conseguir… te retorno" — promessa de turno proativo que a web não tem. Funil morto, run B1 inteiro perdido | Fluxo B1 T6-T13; tool-io com os groupIds inventados e o erro do guard | prompt/contexto do reveal (o modelo não recebe/usa os ids reais da tabela ao resolver menção por nome); falta rota determinística "usuário nomeou admin da tabela → chip/ação" e um watchdog anti-"te retorno" |
| N3 | P1 | Aviso de ajuste com **copy invertida** quando vier a funcionar (ver G2): "essa carta" = pedido, "sua faixa" = carta nova | análise de código + payload ao vivo | `real-offer.tsx:87-101`, `formatter.ts:1046-1053` |
| N4 | P2 | **"é tipo um booking"** — inglês solto em copy ao usuário (inviolável PT-BR) | Fluxo B2, turno do contract_form | fala do LLM (prompt de fechamento) |
| N5 | P2 | Presunção de qualificação: "**Como é sua primeira vez** com consórcio…" sem o usuário ter dito (gate experience ainda nem tinha rodado); e a aula de novato saiu 2× no mesmo run | Run D T3 e T6 | fala do LLM (família BUG-FUNIL-PULA-PASSO2, agora só na narração) |
| N6 | P2 | Bolha interna vazada: "Não tenho nenhuma novidade de vaga pra te passar agora" (recusa do directive de scarcity virou fala) | Run D, turno simulator-offer=no | resposta do LLM ao `buildScarcityDirective` sem fallback/limpeza |
| N7 | P3 | `turn-trace.suppressed` não registra a supressão do `premature-decision` (ficou `[]` com o card suprimido) | trace `1e182700` | telemetria do artifact-guard |
| N8 | P3 | Cadência: "confirma R$ 90 mil?" repetido 3× em turnos seguidos (B1); "Então deixa eu confirmar com você:" sem entrega 2×; pedido de WhatsApp misturado na educação de lance (run D) | transcrições | — |

## Confirmações de regressão NEGATIVA (não regrediu)
- Curva/dial por oferta: `historicalWinningBidPct` 68,09 (ITAÚ 150k) e `lancePercent` 52,6 (RODOBENS 90k) / 71,26 (ÂNCORA 90k) — por oferta ✓; `likelihood` ausente ✓; sem promessa de prazo ✓.
- Lead que diz tudo numa frase pula o slider de valor (B1/B2: "uns 90 mil" → direto pro reveal) ✓.
- `returning` → "vamos direto ao ponto", sem aula ✓; `experience` pós-reveal ✓; `timeframe` como ponte pro simulador ✓.
- Fecho D6 completo 2× (pede o "oi" com a função técnica, especialista em cadastros, sem "reservado"); a frase sem sujeito da r1 não apareceu ("a nossa especialista em cadastros te chama") ✓.
- Anchor-guard de grupos segurou TODAS as tentativas de id inventado — nenhum dado fabricado chegou ao usuário ✓.

## Por que 4 e não mais
O trabalho de MOTOR e GUARDS desta rodada é bom de verdade (âncora, clamp, guards de
funil, sanitizer) — D1/D6 estão a um passo do teto. O que segura a nota é um único
padrão arquitetural repetido: **os três cards do handoff e o aviso de ajuste dependem
de o LLM obedecer um directive (ou de um campo sobreviver a um destructuring), e em 7
oportunidades ao vivo NENHUM card novo apareceu e o aviso nunca renderizou**. A lei
"invariante crítico vira código, não regra-no-prompt" está violada exatamente nos
itens-título da rodada. Com (a) emissão server-side determinística de
two_paths/embedded_bid/scarcity (os coerces já existem), (b) o fio do
`requestedCreditValue` fechado nos 2 canais com copy certa, e (c) o splitter com guarda
de dígito, D2/D5 sobem pro teto e a conversa vira 8+; o N2 (recovery de alucinação) é o
último degrau pra "matador pra prod".
