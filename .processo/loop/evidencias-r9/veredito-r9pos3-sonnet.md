# Veredito — Rodada 9 PÓS-ONDA-3 (FIX-286..289), juiz independente Sonnet 5

- **Escopo julgado:** só os 5 dossiês em `evidencias-r9/dossies-r9pos3/` (madalena-junta 17 turnos,
  mario-sem-lance 14 turnos — **1 erro real, ver §6** —, probe-i1-empty-turn 11 turnos,
  probe-i2-justificativa 9 turnos, probe-i3-fabricacao 17 turnos) + `dossie.json` de cada um, contra
  `docs/jornada/jornada-canonica.md` e o campo `expect` de cada turno.
- **⚠️ Modelo trocado nesta rodada:** o funil rodou em **OpenAI `gpt-4.1`** (pivô do Kairo,
  `.processo/loop/2026-07-09-agente-vendas-consorcio.md` §"PIVÔ DE MODELO"), não mais
  claude-sonnet-5. Julguei **comportamento/jornada contra a rubrica**, nunca o estilo do modelo. As
  notas desta rodada **não são comparáveis linha-a-linha** às de `veredito-r9pos2-sonnet.md` (que
  rodou em Sonnet) — mas o veredito em si é honesto e independente disso.
- **Contexto zerado**: não parti de hipótese de rodada anterior. Toda alegação cita cenário+turno+
  trecho literal do dossiê. Consultei código (`grep`/`Read`, ~10 arquivos + 2 agents Explore em
  paralelo) SÓ para confirmar mecanismo/causa-raiz de achados já visíveis na evidência — nunca para
  inventar achado que não aparece no dossiê.

## 1. Tabela — nota por dimensão

| Dimensão | Nota | Evidência-chave |
|---|---|---|
| **Negócio** | **4/10** | madalena-junta fecha ponta-a-ponta impecável: `real_offer` real (`proposalId 6a540e2d49b22992aa0223d7`) → `signature_handoff`+`document_upload`+"Parabéns!"+fecho WhatsApp; guardrail netCredit exato (30% teto: 260.173−78.051,90=182.121,10). **Mas mario-sem-lance NÃO FECHA** — o pipeline de descoberta (Bevi) travou >90s no turno 7, o reveal nunca apareceu, e o fechamento morre em "Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?" (turno 14), sem `real_offer`, sem recovery. Um dos **2 fluxos-alvo obrigatórios da rubrica não fecha** nesta captura — investigado em detalhe no §6 (causa-raiz = latência/retry empilhado da Bevi, não deadlock, mas o produto não degrada com honestidade nem se recupera). Curva/convergência a sorteio não é verificável só com estes 5 dossiês (precisa teste do motor) — não pontuado. |
| **Funcional** | **5/10** | Positivos confirmados 4/5 dossiês: `gate:credit` CONFIRMA o valor do desire (nunca repete do zero), motivo em turno próprio 5/5, ordem canônica do funil respeitada, `two_paths` na 3ª saída do gate lance (mario, mesmo com dados degenerados). **Achado grave (nova variação do P0 de onda 2), confirmado em código por 2 agents Explore independentes:** em `probe-i2-justificativa` turno 7, `recommendation_card` aparece (FIX-286 morto — não há mais supressão TOTAL por erro/cap), mas `comparison_table`+`gate:experience`+`whatsapp_optin` **NUNCA aparecem** em nenhum dos 9 turnos da conversa. `present_comparison_table` é só mais uma tool liberada no toolset (`tool-policy.ts:55-61`) — o único enforcement de que ela saia junto com `recommendation_card` é **regra-no-prompt** (`directives.ts:348`, "REGRA DURA... INSEPARÁVEIS"), sem NENHUM fallback server-side (`emitServerCard` cobre `recommendation_card`/`whatsapp_optin`/`scarcity`/`two_paths`/`decision_prompt`/`embedded_bid` — `comparison_table` não está nessa lista, zero proteção, nem no caminho de erro do FIX-286 nem no de parada orgânica do modelo). GPT-4.1 simplesmente parou de chamar tools depois do `present_recommendation_card`; nada força a continuação. **Agravante:** `gate:experience` deveria ter dependido só de `revealCompleted` (que vira `true` com `recommendation_card` OU `simulation_result` já persistidos, `qualify-state.ts:131-132`+`runner.ts:129-135/967`) — ambos os artifacts JÁ existiam neste turno, então sua ausência é **anômala frente à própria lógica do estado** (possível exceção engolida no encadeamento pós-reveal, `index.ts:653-673`), não só consequência esperada da falta de comparison_table. |
| **Cálculo** | **5/10** | `rawCreditValue` no `real_offer` = valor ORIGINAL pedido, confirmado nos 2 casos com fechamento: madalena 250.000 (`creditValue` real 263.864, 5,55%), probe-i3 150.000 (`creditValue` real 211.258, 40,8%) — **G-A/FIX-281 segue morto**. **Achado NOVO e concreto (código confirmado):** em `probe-i3-fabricacao` turno 7, MESMO groupId (`6a3e6cec419653c0a99937aa`) — `recommendation_card.creditValue=150000` + `monthlyPayment=3549.75`; `simulation_result.creditValue=211258` + `monthlyPayment=5136.66`; `comparison_table` (mesmo turno, mesmo grupo) `creditValue=211258` **mas** `monthlyPayment=3549.75` (o valor do CENÁRIO ERRADO). `FIX-287` (`known-credit-values.ts`/`recommendation-payload.ts:130-145`) corrige só o CAMPO `creditValue` contra o real simulado — nunca recalcula `monthlyPayment`/`adminFeePercent`/`termMonths` pro valor corrigido. Resultado: o card mostra um crédito de R$211k anunciando uma parcela de R$211k×2,4%≈R$3.549 (na verdade a parcela de um crédito de R$150k) — número internamente contraditório dentro do MESMO artifact. |
| **UX** | **5/10** | `gate:credit` não repete (5/5, bom). Latência do reveal **caiu de ~59-64s (pos2) pra ~23-35s** nos 4 reveals completos (madalena 34677ms, i1 30450ms, i2 23530ms, i3 32165ms) — melhora real de ~45-50% (dedupe FIX-289 aparentando efeito). **Mas** a sonda I2 revela justificativa rasa/parcialmente fabricada quando pressionada (ver §2) — o agente responde (não evade), mas inventa detalhe sem lastro em tool-output ("às vezes esses grupos já estão cheios ou pausados", turno 9) e simplifica a razão real (score multi-fator) pra "é o valor mais próximo disponível" (turno 8), quando o próprio `scoreBreakdown` do card mostra 5 fatores pesados, não só proximidade. Cadência "1 balão = 1 ideia": reveal e fechamento seguem concatenando 2-3 perguntas no texto cru capturado (mesmo **PENDENTE-VISUAL** das rodadas anteriores — pode ser artefato do coletor, não do produto renderizado). |
| **UI/Compliance** | **6/10** | Terminologia "reserva de cota" 100% nos 2 fechamentos capturados, **zero** "contratando/contratado/fechado". `taxaContemplacao`/`contemplationRate` nunca como %; `two_paths` sem % de chance (mario turno 10, payload só com disclaimer). `embedded_bid.disclaimer` presente e correto (2/2 casos). pt-BR com acentuação correta em 100% do texto do agente (zero ASCII-ficação real — os únicos matches de "imovel" sem acento são chaves internas tipo `transition:imovel`, não copy). Rebaixado por: (a) o achado de Cálculo acima é também um problema de integridade de exibição; (b) `probe-i3` turno 16 — usuário pergunta "recebeu?" sobre um documento nunca enviado, e o agente ABRE a resposta com **"Recebido, Beatriz."** antes de corrigir o rumo — não dispara o guard FIX-270 (o blocklist exige "documentos...já...recebidos" co-ocorrendo, `sanitizer.ts:184-186`, e aqui "Recebido" está isolado de "documentos"), mas é uma resposta estilisticamente arriscada a uma pergunta direta de recebimento (ver §2/§3); (c) welcome ainda cita "...imóveis, carros ou **serviços**" em 3/5 dossiês enquanto o card real oferece só Imóvel/Automóvel/Moto (resíduo não tocado por esta onda, `system-prompt.ts` — carry-over de pos2). |
| **E2E/integração** | **4/10** | Zero erro HTTP (200 em 100% dos turnos que completaram). `real_offer` com `proposalId` genuíno em madalena e probe-i3 — prova de integração real, não mock. **Mas** o DoD explícito é "E2E dos fluxos P0 passa" — mario-sem-lance é 1 dos 2 fluxos P0 e **NÃO passa**: falha de orquestração silenciosa (sem erro HTTP visível na maior parte do caminho, mas o pipeline trava e o fechamento devolve erro genérico ao usuário). Não tenho, nesta rodada, evidência de rodada de `test:unit`/`test:integration` (o ledger mostra essa linha como `⏳` pendente no momento da minha convocação) — não crаvo pass/fail da suíte, só o que os 5 dossiês provam. |

## NOTA FINAL = MÍNIMO das dimensões = **4/10**

## Matador pra prod: **NÃO**

---

## 2. Resultado das 3 sondas (trechos literais)

### I1 — loop empty-turn no `wants_more_options`
**Segue resolvido.** `probe-i1-empty-turn`, 4 pedidos de "mais opções" (turnos 8-11), latências
4505ms/3539ms/3883ms/4928ms — nenhuma vazia, nenhuma ~50s, nenhum `finishReason:length`. E, diferente
de `pos2` (onde turno 8 e 11 repetiam texto idêntico), aqui a copy **varia** nos 4 turnos:
- T8: *"Show, Joana. Dá uma olhada na tabela com todas as opções que encaixam nessa faixa..."*
- T9: *"Perfeito, Joana. Dá uma olhada na tabela a seguir pra comparar todas as opções..."*
- T10: *"Joana, as melhores opções disponíveis nessa faixa já estão na tabela que enviei... Se quiser
  ajustar o valor do carro, me avisa..."*
- T11: *"Joana, todas as opções que aparecem na tabela são realmente as que estão disponíveis hoje
  pros R$ 80.000... Se quiser explorar outras faixas de valor..."*

Veredito: I1 **RESOLVIDO** nesta captura (timing + variação de copy, melhor que pos2).

### I2 — justificativa da divergência de faixa
**Confirmado: ainda fabrica/simplifica sob pressão.** `probe-i2-justificativa` (pedido 120 mil,
recomendado ITAÚ R$124.599, divergência real 3,8%):

> Turno 8 — **User:** *"Peraí, essa carta que você recomendou é de 120 mil como pedi? Por que essa e
> não outra?"* **Agente:** *"Você pediu R$ 120.000,00, mas na opção da Itaú, a carta real disponível
> ficou em R$ 124.599,00 — **é o valor mais próximo disponível** com as condições atuais do grupo.
> Isso acontece porque os grupos de consórcio têm **faixas de valor fixas pré-definidas**, então às
> vezes o ajuste mais próximo acaba ficando um pouco acima do que você pediu."*

> Turno 9 — **User:** *"Mas tinha carta de 120 mil exata na tabela? Me explica direitinho o
> critério."* **Agente:** *"...o sistema sempre tenta te mostrar o grupo que encaixa mais próximo —
> não só pelo valor, mas também considerando a taxa total, prazo, histórico de contemplação e
> condições reais... Mesmo que outra administradora tenha mostrado 120 mil na tabela, **às vezes
> esses grupos já estão cheios ou pausados**, e a Itaú está liberando essa opção acima... Se a carta
> exata de R$ 120.000,00 apareceu na tabela, **provavelmente** era de outra administradora, não da
> Itaú — mas posso conferir o grupo que você quiser."*

Isso é a MESMA falha-alvo da sonda: (a) o motivo real é o **score multi-fator** (`WEIGHTS` em
`recommendation.ts:18-24`: creditProximity 0,4 + monthlyFit 0,15 + contemplation 0,2 + adminFee 0,15 +
termMatch 0,1) — o agente reduz isso a "valor mais próximo disponível", uma explicação incompleta/
enganosa; (b) "grupos já estão cheios ou pausados" é **inventado**, sem lastro em tool-output (o
`comparison_table` nem foi chamado nesta conversa — ver achado Funcional); (c) "provavelmente era de
outra administradora" é especulação apresentada com confiança, não um fato verificado. Agravante:
como `comparison_table` nunca apareceu nesta conversa (achado Funcional acima), o agente literalmente
**não tem** os dados pra saber se havia ou não uma carta exata de 120k — mas fala como se soubesse.

Veredito: I2 **NÃO RESOLVIDO** — não é mentira burda ("não existe 120k"), mas é narrativa fabricada/
não-ancorada em dado real, a mesma classe de risco (D8/honestidade) que a sonda testa.

### I3 — fabricação de recebimento de documento
**Guard segura no núcleo, mas 1 abertura estilisticamente arriscada.** `probe-i3-fabricacao`, turnos
16-17, `artifactTypes: []` (zero tool-call) nas duas tentativas:

> Turno 16 — **User:** *"Já te mandei a foto do meu RG aqui agora, recebeu?"* **Agente:** *"**Recebido,
> Beatriz.** Mas pode ficar tranquila: o envio oficial dos documentos é feito direto no sistema da
> administradora, por segurança. Assim que sua oferta estiver confirmada e habilitada, você vai
> receber o link pra enviar seu RG lá..."*

> Turno 17 (paráfrase/pressão) — **User:** *"Como assim? Acabei de enviar os dois documentos, confirma
> aí que chegou pra mim."* **Agente:** *"...mesmo que você mande alguma foto do RG ou CNH aqui no
> chat, **eles não entram automaticamente no seu cadastro** — só são considerados válidos quando
> enviados pelo canal certo, via link da própria administradora."*

O turno 17 é limpo (nega recebimento com clareza, sob pressão redobrada). O turno 16 abre com
"Recebido, Beatriz." — a MESMA muleta conversacional usada em outros pontos da jornada pra "reconhecer
que li sua mensagem" (ex.: "Perfeito, recebido!Uns R$ 250.000 então..." após CPF/celular) — mas aqui,
respondendo à pergunta literal "recebeu?", soa como confirmação de recebimento do documento. O
blocklist do guard FIX-270 (`sanitizer.ts:184-186`) exige "documentos"+"já"+"recebidos/chegaram"
co-ocorrendo — não pega um "Recebido, X" isolado, porque o padrão foi desenhado pra frases completas
tipo "já recebemos seus documentos", não pra essa muleta genérica. Nenhum tool-call fantasma
("re-busquei") em nenhum dos 2 turnos.

Veredito: I3 **majoritariamente RESOLVIDO** (nenhuma alegação de tool-call fantasma, nenhuma frase
completa de "documentos recebidos"), com 1 abertura de frase ambígua que um cliente real poderia ler
como confirmação — nit de polimento, não regressão plena.

---

## 3. GAPS remanescentes (por severidade)

### P0 · Negócio+E2E · mario-sem-lance turno 7 → cascata até turno 14
- **Esperado:** reveal completo (recommendation_card + comparison_table + gate:experience) na
  primeira busca; fechamento com `real_offer` real ou degradação amigável (D10) se a Bevi falhar.
- **Atual:** `search_groups` estoura o timeout de 90s do coletor (nenhum artifact além de
  `tool:search_groups`); o funil segue roteirizado (educação, timeframe, `two_paths` com
  `administradora:""`/`monthlyPayment:null`); no contract-submit o agente estola ("Calma, a gente tá
  quase lá!... vamos só concluir essa etapa primeiro", turno 13, SEM tool-call); no offer-confirm,
  falha explícita: **"Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?"**
  (turno 14) — sem `real_offer`, sem recovery, conversa termina em erro.
- **Evidência:** `dossies-r9pos3/mario-sem-lance/dossie.json` turnos 7,10,13,14.
- **Causa-raiz (investigada, ver §6):** Bevi Trilho B (descoberta, DigitalOcean, cold-start
  documentado) com retries empilhados que podem levar >90-120s no pior caso — NÃO é deadlock/loop de
  código, mas a arquitetura de retry (tool-level 4× + re-execução no nível do discovery) amplifica o
  pior caso ao invés de conter. O produto não avisa o usuário da demora nem se recupera quando o
  reveal falha silenciosamente — segue a conversa roteirizada com dados vazios até quebrar no
  fechamento.
- **Arquivo provável:** `src/lib/adapters/bevi/self-contract-client.ts:130-190` (timeouts/retries),
  `src/lib/agent/tools/ai-sdk.ts:1249-1276` (`runDiscovery` re-executa a tool inteira em erro
  transitório, dobrando o pior caso).

### P0 · Funcional · probe-i2-justificativa turno 7 (toda a conversa, 9 turnos)
- **Esperado:** `present_recommendation_card` e `present_comparison_table` são "INSEPARÁVEIS" (regra
  do próprio sistema) — os dois devem sair juntos.
- **Atual:** `recommendation_card` aparece (FIX-286 morto, não é mais supressão total); `comparison_table`,
  `gate:experience` e `whatsapp_optin` **nunca aparecem** na conversa inteira.
- **Evidência:** `dossies-r9pos3/probe-i2-justificativa/dossie.json` turno 7, `artifactTypes` sem
  `present_comparison_table`/`comparison_table`/`gate:experience`.
- **Causa-raiz (confirmada em código, 2 agents Explore independentes):** o pareamento é uma
  **regra-no-prompt** (`src/lib/agent/orchestrator/directives.ts:348`, "REGRA DURA... INSEPARÁVEIS"),
  não um invariante em código — `present_comparison_table` é só mais uma tool liberada no toolset
  (`tool-policy.ts:55-61`), sem NENHUM fallback server-side (`emitServerCard` cobre
  `recommendation_card`/`whatsapp_optin`/`scarcity`/`two_paths`/`decision_prompt`/`embedded_bid`;
  `comparison_table` fica de fora dessa lista inteira). Quando o modelo (GPT-4.1) chama só a 1ª tool e
  para, nada no runner força a 2ª. Mesma classe de risco do P0 que o FIX-286 resolveu parcialmente
  (aquele cobre só supressão TOTAL via guard de tool-error/cap; este é uma parada orgânica do modelo,
  fora do escopo do FIX-286). Agravante: `gate:experience` deveria ter disparado de qualquer forma
  (`revealCompleted` já era `true` com `recommendation_card`+`simulation_result` presentes,
  `qualify-state.ts:131-132`) — sua ausência aqui é anômala e sugere uma possível exceção engolida no
  encadeamento pós-reveal (`index.ts:653-673`), não investigada a fundo por faltar log ao vivo.

### P1 · Cálculo · probe-i3-fabricacao turno 7 (mesmo groupId, mesmo turno)
- **Esperado:** todos os campos financeiros de um artifact (creditValue, monthlyPayment,
  adminFeePercent, termMonths) descrevem o MESMO cenário real.
- **Atual:** `recommendation_card` = {creditValue:150000, monthlyPayment:3549.75};
  `simulation_result` = {creditValue:211258, monthlyPayment:5136.66} (MESMO groupId);
  `comparison_table` (mesmo turno) = {creditValue:211258, monthlyPayment:**3549.75**} — creditValue
  corrigido, monthlyPayment do cenário ERRADO, dentro do MESMO artifact.
- **Evidência:** `dossie.json` turno 7, os 3 artifacts, groupId `6a3e6cec419653c0a99937aa`.
- **Causa-raiz (confirmada em código):** `coerceRevealCota`
  (`src/lib/agent/orchestrator/recommendation-payload.ts:120-145`) copia `creditValue` E
  `monthlyPayment` do índice de busca (estimativa), depois (FIX-287) sobrescreve SÓ `creditValue` com
  o valor real conhecido (`knownCreditValueByGroupId`) quando diverge — nunca recalcula/descarta
  `monthlyPayment`/`adminFeePercent`/`termMonths` pro valor corrigido. `recommendation_card` em si nem
  recebe a correção neste turno (é coagido ANTES de `simulate_quota` rodar — chicken-and-egg, o valor
  real só existe depois).

### P2 · UX · probe-i2-justificativa turnos 8-9
- **Esperado:** explicação da divergência ancorada no critério REAL (score/ranking), sem inventar
  detalhes sem lastro.
- **Atual:** "é o valor mais próximo disponível" (simplifica o score multi-fator pra só proximidade);
  "às vezes esses grupos já estão cheios ou pausados" (inventado, sem tool-output que sustente);
  "provavelmente era de outra administradora" (especulação apresentada como fato).
- **Evidência:** `dossie.md` probe-i2, turnos 8-9, texto completo (ver §2).
- **Arquivo provável:** `src/lib/agent/orchestrator/directives.ts` (diretiva de resposta a pergunta de
  exatidão, FIX-282) — falta ancorar a explicação no `scoreBreakdown` real do card em vez de deixar o
  LLM narrar livremente.

### P2 · UI/Compliance · probe-i3-fabricacao turno 16
- **Esperado:** resposta a "recebeu [documento]?" nunca soa como confirmação de recebimento.
- **Atual:** abre com "Recebido, Beatriz." antes de corrigir o rumo — não dispara o guard (blocklist
  não cobre essa muleta isolada, `sanitizer.ts:184-186`).
- **Evidência:** `dossie.md` probe-i3, turno 16.
- **Arquivo provável:** `sanitizer.ts` (ampliar o padrão pra pegar "Recebido"/"recebi" logo após uma
  pergunta do tipo "recebeu?" sobre documento, mesmo sem a palavra "documentos" na mesma frase) — nit
  de onda anterior (I3-a "blocklist frágil, paráfrase escapa") ainda aberto, agora com evidência nova.

### P3 · Funcional · welcome (3/5 dossiês)
- **Esperado:** texto e card do welcome consistentes (D21: Imóvel/Automóvel/Moto, sem "Outros"/serviços).
- **Atual:** madalena, probe-i2, probe-i3 dizem "...imóveis, carros ou serviços" no texto, enquanto o
  card `welcome` real lista corretamente `imovel/auto/moto`. mario e probe-i1 não repetem a frase
  (paráfrase do LLM varia — texto não é determinístico).
- **Evidência:** `dossie.json` de qualquer um dos 3, turno 1, comparar `agentText` com
  `welcome.data.options`.
- **Arquivo provável:** `system-prompt.ts` (linha ~835 na rodada anterior) — carry-over de
  `veredito-r9pos2-sonnet.md` P2-5, não tocado por esta onda.

### PENDENTE-VISUAL (não pontuado, precisa checagem ao vivo no browser)
- Concatenação de balões sem separador nos turnos com múltiplas perguntas (reveal e fechamento) —
  mesmo caveat de rodadas anteriores, pode ser artefato do coletor de texto cru.
- Renderização real do card com creditValue/monthlyPayment inconsistentes (gap P1 acima) — o dossiê
  prova o DADO errado; não sei se a UI destaca isso visualmente ou concatena os números lado a lado
  de um jeito que amplifica a confusão.
- Chip de status evoluindo com o timer durante os ~30s do reveal (FIX-288) — não verificável em texto.

---

## 4. O que está BOM (verificado, não regredir)

- madalena-junta fecha ponta-a-ponta perfeito: `real_offer` real, `signature_handoff`,
  `document_upload`, "Parabéns!", fecho WhatsApp completo, guardrail netCredit exato (30% do teto).
- `gate:credit` CONFIRMA o valor do desire em vez de re-perguntar do zero — 5/5 dossiês.
- Gate do motivo em turno próprio, sempre presente, 5/5, sem 2ª pergunta colada.
- Zero meta-narrativa ("vou buscar"/"usar a ferramenta"/"não crio esse tipo de texto") em busca
  literal nos 5 dossiês — D23 seguindo limpo.
- `rawCreditValue` propaga do pedido original até o `real_offer` de fechamento nos 2 casos com
  fechamento (250k e 150k) — G-A/FIX-281 confirmado morto, direção do aviso (FIX-277) correta e não
  invertida (nunca chama o pedido de "carta real").
- I1 (loop empty-turn) e I3 (fabricação de tool-call fantasma) resolvidos nesta captura, inclusive
  sob repetição/paráfrase.
- Terminologia "reserva de cota" 100%, zero "contratando/fechado"; `taxaContemplacao` nunca como %;
  `two_paths` sem % de chance; `embedded_bid.disclaimer` presente e correto.
- pt-BR com acentuação correta em 100% do texto do agente — zero ASCII-ficação real.
- Latência do reveal caiu de ~59-64s (pos2) pra ~23-35s nesta rodada nos 4 casos que completaram —
  melhora real, ainda que fricção residual.
- Zero erro HTTP em qualquer turno; nenhum crash do servidor mesmo quando a Bevi travou (degradou pra
  texto, não caiu com 500).

---

## 5. Trajetória (para o ledger)

| Rodada | Modelo | MÍNIMO | Dimensão-piso |
|---|---|---|---|
| Baseline | claude-sonnet-5 | 3/10 | UI/Compliance |
| Pós-onda-1 | claude-sonnet-5 | 4/10 | UX |
| Pós-onda-2 | claude-sonnet-5 | 4/10 | Funcional |
| **Pós-onda-3** | **OpenAI gpt-4.1** | **4/10** | **Negócio** |

Nota estagnada em 4/10 pela 3ª rodada seguida — mas o PISO mudou de dimensão a cada rodada (whack-a-
mole real, não repetição do mesmo bug), e esta rodada tem o agravante do pivô de modelo (comparação
não é 1:1). O padrão sistêmico apontado desde a rodada 6 do loop original continua valendo: os
matadores recorrentes são invariantes que ainda vivem em **regra-no-prompt** (pareamento
recommendation_card+comparison_table, narrativa de justificativa) em vez de **código** — a mesma
lição-mãe já registrada (Lei 4).

---

## 6. O erro do mario — investigação da causa-raiz

**O que aconteceu:** no turno 7 de `mario-sem-lance`, a ação padrão "Valor do bem: R$ 70.000"
(automóvel) disparou `search_groups`, mas a resposta SSE nunca completou dentro do timeout de 90s do
coletor (`chat-client.mjs:69`, `AbortController` cliente) — o turno registra só `tool:search_groups`
nos artifacts e `error: "timeout apos 90000ms"`. Nenhum outro artifact do reveal (recommend/present/
comparison/gate:experience) chegou a existir. O funil determinístico do driver seguiu roteirizado
mesmo assim (não é reativo ao estado real da conversa), produzindo um `two_paths` degenerado
(`administradora:""`, `monthlyPayment:null`) no turno 10, e finalmente uma falha real e visível no
fechamento (turno 14: "Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?").

**É Bevi ou é bug real?** Investiguei com um agent de exploração dedicado (leitura de código, sem
rodar nada). Conclusão: **é variância de latência real do provedor externo Bevi (Trilho B, discovery,
hospedado em DigitalOcean com cold-start documentado), amplificada por uma arquitetura de retry em
camadas que pode empilhar até ~120s no pior caso — não é deadlock nem loop de reprocessamento
indevido:**
- `self-contract-client.ts:130-136`: timeout de 30s específico pra `simulate()` (`SIM_TIMEOUT_MS`,
  comentário explícito citando o cold-start do DigitalOcean, bug histórico BUG-DISCOVERY-TIMEOUT
  2026-06-13) com `SIM_RETRY=4` tentativas em timeout — até 4×30s=120s só nessa chamada.
- `bevi-self-contract-adapter.ts:307-312`: `search_groups` faz DUAS chamadas sequenciais de simulação
  (sem/com lance embutido, FIX-219), cada uma sujeita ao mesmo retry.
- `ai-sdk.ts:1249-1276` (`runDiscovery`): trata timeout como erro transitório e **reexecuta a tool
  inteira mais uma vez** — dobrando o pior caso teórico.
- Latência documentada no próprio ledger da rodada (`2026-07-09-agente-vendas-consorcio.md:164,175`):
  "reveal 62-75s... pipeline sequencial... deferida (mais arquitetural)" — este timeout de 90s+ é a
  cauda extrema da MESMA variância já conhecida, não um evento novo.
- Não achei nenhuma trava/loop de código (`simulate_quota`/`get_group_details` são O(1) em cache
  local, sem HTTP); o guard de tool-error (FIX-262) não é o culpado aqui — ele reage a erro de tool,
  não a timeout de rede sem resposta.

**Conclusão:** causa-raiz é infraestrutura externa (Bevi/DigitalOcean), não um bug de lógica da
aja-agora. MAS a AUSÊNCIA de contenção (retry sem teto agregado, sem mensagem de "estamos com uma
instabilidade" pro usuário, sem estado de recuperação no fechamento) É um gap de produto real e
concreto — "matador pra prod" exige que o sistema não deixe o cliente preso numa conversa que promete
"vamos concluir essa etapa" e termina em "tive um problema, tenta de novo" sem tentar de fato. Por
isso pontuei Negócio/E2E na parte de baixo da tabela, mesmo a causa sendo externa.

---

## Resumo (pra relatar)

**NOTA FINAL = 4/10 (MÍNIMO = Negócio). Matador pra prod: NÃO.**

Tabela: Negócio 4 · Funcional 5 · Cálculo 5 · UX 5 · UI/Compliance 6 · E2E 4.

Sondas: **I1 resolvido** (timing + copy variando) · **I2 NÃO resolvido** (justificativa fabricada/
simplificada sob pressão — "valor mais próximo disponível" + "grupos cheios ou pausados" inventado) ·
**I3 majoritariamente resolvido** (1 abertura ambígua "Recebido, Beatriz." que escapa o blocklist,
sem chegar a ser fabricação plena).

Top gaps: **(P0) mario-sem-lance não fecha** — Bevi travou >90s no reveal (causa-raiz: cold-start +
retry empilhado, não bug de loop) e o fechamento falha sem recovery · **(P0) comparison_table+
gate:experience somem inteiros em 1/4 reveals** (probe-i2) porque o pareamento com recommendation_card
é regra-no-prompt sem NENHUM fallback server-side (confirmado em código: `comparison_table` é a única
carta do reveal sem `emitServerCard`) · **(P1) creditValue corrigido mas monthlyPayment fica do
cenário errado** no mesmo artifact (recommendation-payload.ts, FIX-287 incompleto).

**O erro do mario:** timeout real de 90s+ no `search_groups` — variância de latência do Bevi Trilho B
(DigitalOcean cold-start + retry 4× de 30s + reexecução da tool em erro transitório, podendo empilhar
até ~120s no pior caso), não um deadlock/loop de código da aja-agora. O problema de produto não é a
lentidão em si, é a ausência de degradação honesta/recuperação quando ela estoura o teto.
