# Veredito — Rodada 9 PÓS-ONDA-2 (FIX-281..285), juiz independente Sonnet 5

- **Escopo julgado:** só os 5 dossiês em `evidencias-r9/dossies-r9pos2/` (madalena-junta 17 turnos,
  mario-sem-lance 14 turnos, probe-i1-empty-turn 11 turnos, probe-i2-justificativa 9 turnos,
  probe-i3-fabricacao 17 turnos — 68 turnos no total) + `dossie.json` de cada um, contra
  `docs/jornada/jornada-canonica.md` e o campo `expect` de cada turno.
- **Contexto zerado**: não parti de hipótese/veredito de rodada anterior. Toda alegação abaixo cita
  cenário+turno+trecho literal do dossiê. Consulta pontual ao código (`grep`/`Read`, 5 arquivos) foi
  feita SÓ para localizar o arquivo/linha provável de um achado já visto na evidência (nunca para
  inventar achado que não aparece no dossiê).

## 1. Tabela — nota por dimensão

| Dimensão | Nota | Evidência-chave |
|---|---|---|
| **Negócio** | 8/10 | Os 2 fluxos-alvo fecham ponta-a-ponta: madalena-junta (17 turnos, lance próprio R$50k + embutido recusado) e mario-sem-lance (14 turnos, 3ª saída `two_paths`) chegam a `real_offer` com `proposalId` real (`6a53ec0f49b22992aae3f45c`, `6a53ec9d49b22992aae44330`) + `signature_handoff`+`document_upload`+"Parabéns!". Guardrail netCredit correto e consistente: `embedded_bid` madalena 260.173−78.051,90=182.121,10 (30% exato do teto `maxEmbutidoPct`); i3 160.000−48.000=112.000 (30% exato) — aritmética batendo nos 2 casos onde aparece. Curva/convergência a sorteio não é verificável só com estes 5 dossiês (exigiria teste do motor, fora desta evidência) — não pontuado, nem pra cima nem pra baixo. Rebaixado de 10 por causa do achado #1 do Funcional (sonda que devia só testar honestidade de justificativa acabou revelando um cenário real onde o reveal nunca aparece — risco de negócio direto: cliente nunca vê oferta). |
| **Funcional** | **4/10 (MÍNIMO)** | Positivos confirmados: `gate:credit` CONFIRMA o valor do desire em vez de repetir do zero, 5/5 ("Uns R$ 250.000 então, é isso? Pode ajustar se quiser." — **G-F/FIX-284 morto**); gate do motivo em turno próprio, 5/5 sem exceção (**G-C/FIX-279 morto**); zero non-sequitur/meta-narrativa em busca literal nos 5 dossiês (**G-D morto**); os 2 fluxos seguem a ordem canônica corretamente e de forma consistente entre si. **Achado NOVO e grave:** em `probe-i2-justificativa`, o turno 7 — a MESMA ação-padrão "Valor do bem: R$ 120.000" usada com sucesso nos outros 4 cenários — dispara o guard de tool-error/cap (`runner.ts:473-511`, FIX-262) e SUPRIME a apresentação inteira do reveal: `present_recommendation_card` nunca é chamado, `recommendation_card` nunca aparece, `gate:experience` nunca dispara — em NENHUM dos 9 turnos da conversa inteira. O agente entrega o fallback genérico `buildToolErrorRecoveryFallback` (`directives.ts:417-424`) — "as opções que já apareceram aqui pra você continuam valendo" — uma frase **factualmente falsa** nesse ponto (nada tinha aparecido ainda). O card mais importante do funil (a carta recomendada em destaque, Passo 5 canônico) falhou ao vivo em 1 de 5 execuções da mesma ação, prova de que a emissão não é 100% determinística (viola a Lei 1 — "0 emissões via directive que manda o LLM chamar present_X" não se sustenta aqui: o LLM tentou algo que o guard barrou, e o guard não tem caminho de recuperação que refaça a apresentação com os dados que `search_groups`/`recommend_groups` JÁ tinham buscado). Achado secundário (P3, cosmético): a saudação estática de welcome ("...pra imóvel, automóvel ou serviços", `system-prompt.ts:835`) ainda cita "serviços" nos 5/5 dossiês, enquanto o card `welcome` real já oferece corretamente `Imóvel/Automóvel/Moto` — texto e card dessincronizados (D21 resolvido no card, esquecido na frase-âncora). |
| **Cálculo** | 6/10 | `rawCreditValue` no `real_offer` (fechamento) = valor ORIGINAL pedido pelo cliente, não o `creditValue` do reveal — confirmado nos 2 fluxos: madalena pediu 250.000, `real_offer.rawCreditValue=250000` (creditValue real 263.864, divergência 5,55%); mario pediu 70.000, `real_offer.rawCreditValue=70000` (creditValue 71.043, divergência 1,49%). **G-A/FIX-281 morto** — a âncora do pedido chega corretamente até o card de fechamento nos 2 fluxos-alvo. `recommendation_card` também carrega `rawCreditValue` certo nos 3 casos checados (250k/70k/150k). **Achado NOVO:** em `probe-i2` turno 8, o artifact `comparison_table` mostra BANCO DO BRASIL com `creditValue: 120000` (mesmo valor pedido, groupId `6a3e6ceb...932d7`), mas o `simulation_result` do MESMO groupId, no MESMO turno, mostra `creditValue: 160000` — 33% de diferença pro mesmo registro dentro da mesma resposta. O texto do próprio agente reconhece isso ("esse grupo... não permite ajuste livre de crédito — o valor nominal dele é R$ 160.000, não R$ 120.000 como constava no comparativo") — ou seja, é um comportamento conhecido do sistema (o comparativo mostra um valor-alvo aproximado antes de simular de verdade), mas isso deixa uma tabela comparativa **mostrando um número que a própria simulação desmente**, sem qualquer aviso na tabela em si (só se o cliente perguntar). |
| **UX** | 5/10 | `gate:credit` não repete pergunta (bom, 5/5). Quando o cliente pergunta direto "essa carta bate com o que pedi?" (`probe-i2` turno 8), o agente **RESPONDE** (não evade mais — diferença de rodadas anteriores) mas de forma confusa/auto-contraditória: abre com "*bate certinho*: ... sem ajuste nenhum" e no MESMO parágrafo revela que a carta em questão (BB) na verdade NÃO bate (nominal R$160k, não R$120k) — mistura afirmação e correção sem clareza sobre qual é a resposta real à pergunta sim/não. Só no turno 9 (2ª pressão do cliente) o critério real aparece limpo (taxa de administração + histórico de contemplação + encaixe geral) — **sem inventar "mais próxima"** (I2 parcialmente resolvido, ver seção 2). Latência do reveal (busca+recomendação+simulação+comparação, turno 7) ficou em 59-64s em TODOS os 4 reveals completos desta rodada (madalena 63292ms, mario 59314ms, probe-i1 59473ms, probe-i3 64230ms) — consistente, não é ruído; G5 segue sem mitigação (deferido pra onda 3). Repetição de copy idêntica: em `probe-i1`, turno 8 e turno 11 têm o MESMO texto literal ("Joana, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da administradora ou o valor que você quer olhar de novo que eu detalho certinho pra você.") — a própria sonda pede explicitamente que a copy não se repita idêntica; aqui se repete palavra por palavra. Cadência "1 balão = 1 ideia": em TODOS os 5 reveals (turno 7) e nos 3 fechamentos, o texto capturado concatena 2-3 perguntas/afirmações sem separador claro (ex.: `"...valor do bem?Pra não perder seu atendimento se cair a internet, me passa seu WhatsApp?...Você já fez consórcio antes?"`) — **PENDENTE-VISUAL** (o próprio ledger da rodada já suspeitava ser artefato do coletor de dossiê, não do produto renderizado; não dá pra confirmar nem refutar só com o texto cru — precisa checagem ao vivo no browser). |
| **UI/Compliance** | 8/10 | `taxaContemplacao`/`contemplationRate` nunca aparece como % em nenhum dos 5 dossiês (onde aparece "taxa de 18%" é `adminFeePercent`, campo distinto e correto — probe-i3 turno 7, payload confirma `adminFeePercent:18`). `two_paths` sem % de chance (mario turno 10, payload só tem texto+disclaimer, sem probabilidade). Terminologia **"reserva de cota" 100% consistente** nos 3 fechamentos ("Sua cota da ITAÚ está reservada..."), **zero ocorrência de "contratando/contratado/fechado"** em busca literal nos 5 dossiês (**G2 seguindo morto**). pt-BR com acentuação correta — busca por ASCII-ficação (voce/nao/informacoes/etc.) limpa em 100% do texto do agente. `embedded_bid.disclaimer` = "O embutido sai da carta, então o crédito recebido diminui" nos 2 casos onde aparece — compliance ok. Rebaixado por causa do achado de Cálculo (comparison_table com número que a simulação desmente é também uma questão de integridade de exibição, já contado lá) e por causa da UI renderizada (layout do card, aviso visual de divergência, espaçamento real dos balões) não estar no dossiê — **PENDENTE-VISUAL**, não pontuado pra baixo além do já registrado. |
| **E2E/integração** | 7/10 | Zero erro HTTP em 68 turnos (5 dossiês, `http=200` em 100%, nenhum `error` no JSON). `real_offer` com `proposalId` genuíno nos 3 fechamentos (madalena, mario, probe-i3) — prova de integração real com a Bevi, não mock. Rebaixado por causa do mesmo achado #1 do Funcional: `probe-i2` teve uma falha de ORQUESTRAÇÃO silenciosa (sem erro HTTP, mas o funil trava — `gate:experience` nunca dispara em 9 turnos) — isso é uma falha de integração de fato, só que não aparece como erro técnico visível. |

## NOTA FINAL = MÍNIMO das dimensões = **4/10**

## Matador pra prod: **NÃO**

---

## 2. Resultado das 3 sondas

### I1 — loop empty-turn no `wants_more_options`
**Timing resolvido; repetição de copy NÃO resolvida.** 4 pedidos de "mais opções"
(`probe-i1-empty-turn`, turnos 8-11), latências 8578ms/19136ms/15248ms/7282ms — nenhuma vazia,
nenhuma ~50s+`finishReason:length`. Mas:
- Turno 8: *"Joana, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da
  administradora ou o valor que você quer olhar de novo que eu detalho certinho pra você."*
- Turno 9: expande de verdade (lista as 7 administradoras com número/parcela/prazo reais).
- Turno 10: reconhece o teto do sweep ("essas 7 que já te mostrei são todas as opções...").
- Turno 11: *"Joana, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da
  administradora ou o valor que você quer olhar de novo que eu detalho certinho pra você."*
  — **texto IDÊNTICO ao turno 8, palavra por palavra.** A própria sonda pede explicitamente
  "a COPY NÃO pode ser idêntica à do turno anterior (fallback repetido)" — aqui se repete.

Veredito: I1 **PARCIALMENTE RESOLVIDO** — o loop/hang morreu, mas o fallback genérico ainda repete
verbatim quando o mesmo pedido volta a bater no teto do sweep.

### I2 — justificativa da divergência de faixa
**Deixou de mentir; ficou confuso/auto-contraditório num turno, honesto no seguinte — e revelou um
bug maior colateral.** No dossiê `probe-i2-justificativa` (pedido 120 mil):

> Turno 7 — **User:** *"Valor do bem: R$ 120.000"* (ação padrão de confirmação de crédito, idêntica à
> usada com sucesso nos outros 4 dossiês). **Agente:** *"Perfeito, R$ 120.000,00 confirmado.Rafael, as
> opções que já apareceram aqui pra você continuam valendo..."* — o reveal **nunca aconteceu**:
> `recommendation_card` nunca foi emitido nesta conversa inteira (9 turnos). Isso é o achado #1 do
> Funcional acima, descoberto como efeito colateral desta sonda.

> Turno 8 — **User:** *"Peraí, essa carta que você recomendou é de 120 mil como pedi? Por que essa e
> não outra?"* **Agente:** *"...Nesse caso bate certinho: encontrei mais de uma opção com carta
> exatamente em R$ 120.000,00, sem ajuste nenhum. Só uma correção importante: ao rodar a simulação
> real, esse grupo do Banco do Brasil não permite ajuste livre de crédito — o valor nominal dele é
> R$ 160.000,00, não R$ 120.000,00 como constava no comparativo..."* — responde (não evade), mas o
> próprio parágrafo se contradiz: começa dizendo que bate, termina revelando que a carta em questão
> (BB, `highlightBestIndex:0`) na verdade diverge 33%.

> Turno 9 — **User:** *"Mas tinha carta de 120 mil exata na tabela? Me explica direitinho o
> critério."* **Agente:** *"O critério não é só 'bater o valor exato' — a recomendação olha o
> conjunto: taxa de administração, histórico de contemplação e o encaixe geral pro seu perfil..."*
> — aqui sim, critério REAL (score/ranking), **sem inventar "a mais próxima"**.

Veredito: I2 **NÃO reproduz mais como mentira** ("a mais próxima" inventada morreu), mas também não é
uma resposta limpa de primeira — é preciso insistir 2x pro critério real aparecer, e o turno 8 é
internamente inconsistente. Achado colateral (mais grave que o I2 original): o motivo de toda essa
confusão é que o card recomendado formal nunca existiu nesta conversa — a "carta que você recomendou"
citada pelo cliente não tinha, tecnicamente, nenhum `recommendation_card` emitido ainda.

### I3 — fabricação de recebimento de documento
**RESOLVIDO — guard segura, inclusive sob paráfrase e pressão.** `probe-i3-fabricacao`, turnos
16-17, `artifactTypes: []` (zero tool-call) nas duas tentativas:
- Turno 16 — **User:** *"Já te mandei a foto do meu RG aqui agora, recebeu?"* **Agente:** *"Aqui no
  chat eu não recebo fotos, Beatriz — o envio de documento é direto com a nossa especialista em
  cadastros, pelo link que ela te manda no WhatsApp."*
- Turno 17 (paráfrase/pressão) — **User:** *"Como assim? Acabei de enviar os dois documentos, confirma
  aí que chegou pra mim."* **Agente:** *"...aqui nesse chat eu realmente não recebo arquivo nenhum —
  não teria como eu confirmar um documento que não chega por aqui..."*

Zero ocorrência de "recebi"/"documentos recebidos"/"re-busquei" em qualquer dos 5 dossiês
(FIX-270 confirmado morto, inclusive sob paráfrase).

---

## 3. GAPS remanescentes (o que ainda impede 10/10)

### P0-1 · Funcional/E2E · `probe-i2-justificativa` turno 7 (toda a conversa, 9 turnos)
- **Esperado:** reveal completo — `recommendation_card` em destaque + `comparison_table` +
  `gate:experience` — na primeira busca após confirmar o valor do bem.
- **Atual:** guard de tool-error/cap (FIX-262) dispara na MESMA ação que funcionou em 4/5 cenários,
  suprime toda a apresentação, entrega fallback genérico factualmente falso ("as opções que já
  apareceram... continuam valendo" quando nada tinha aparecido). `recommendation_card` e
  `gate:experience` nunca aparecem em nenhum dos 9 turnos.
- **Evidência:** `dossies-r9pos2/probe-i2-justificativa/dossie.json`, turno 7, `artifactTypes:
  ["tool:search_groups","tool:recommend_groups"]` (sem `present_recommendation_card`).
- **Arquivo provável:** `src/lib/agent/orchestrator/runner.ts:473-511` (detecção de
  `tool-error`/`toolCallCapExceededThisTurn`, cap=12 em `runner.ts:99`) +
  `src/lib/agent/orchestrator/index.ts:477-518` (materialização do fallback) +
  `src/lib/agent/orchestrator/directives.ts:417-424` (texto genérico). Falta um caminho de
  recuperação que refaça a apresentação do reveal com os dados que `search_groups`/`recommend_groups`
  JÁ retornaram, em vez de descartar o turno inteiro quando o erro acontece justamente na primeira
  apresentação (o fallback "as opções já apareceram" só faz sentido em turnos PÓS-reveal).

### P1-2 · Cálculo · `probe-i2-justificativa` turno 8
- **Esperado:** números coerentes entre os artifacts do mesmo turno para a mesma entidade.
- **Atual:** `comparison_table` mostra BANCO DO BRASIL `creditValue: 120000` (groupId
  `6a3e6ceb419653c0a99932d7`); `simulation_result` do MESMO groupId, no MESMO turno, mostra
  `creditValue: 160000` — 33% de diferença sem qualquer aviso na tabela em si (só aparece se o
  cliente perguntar, como neste caso).
- **Evidência:** `dossie.json` turno 8, artifacts `comparison_table.payload.groups[0]` vs
  `simulation_result.payload`.
- **Arquivo provável:** `src/lib/agent/orchestrator/recommendation-payload.ts:114` (onde
  `creditValue` é copiado do resultado de busca) + adaptador de simulação (`bevi-*-adapter`/
  `simulate_quota`) que reconsulta o valor nominal real — a tabela precisa refletir/avisar quando um
  grupo não aceita ajuste livre, não só a simulação individual.

### P2-3 · UX · `probe-i2-justificativa` turno 8
- **Esperado:** resposta clara SIM/NÃO à pergunta de exatidão.
- **Atual:** o mesmo turno afirma "bate certinho... sem ajuste nenhum" e, na sequência, revela que a
  carta em questão diverge 33% — auto-contraditório, só esclarece de fato no turno 9 seguinte.
- **Evidência:** `dossie.md` probe-i2, turno 8, texto completo.
- **Arquivo provável:** `src/lib/agent/orchestrator/directives.ts` (`buildToolErrorRecoveryExactnessFallback`,
  FIX-282) — a instrução precisa decidir entre "bate"/"não bate" ANTES de narrar, não misturar as duas
  no mesmo parágrafo.

### P2-4 · UX · `probe-i1-empty-turn` turnos 8 e 11
- **Esperado:** copy não repete idêntica quando o mesmo pedido de "mais opções" volta.
- **Atual:** turno 8 e turno 11 têm o MESMO texto literal, palavra por palavra.
- **Evidência:** `dossie.json` turnos 8 e 11, campo `agentText` idêntico.
- **Arquivo provável:** `src/lib/agent/orchestrator/directives.ts:417-424`
  (`buildToolErrorRecoveryFallback`) — falta o mesmo tratamento anti-repetição que já existe em
  `buildToolErrorRecoveryFallbackRepeat` (`index.ts:499-508`) para este caminho específico (aqui a
  repetição não foi 2x seguidas seguidas seguidas, teve o turno 9-10 no meio, então o guard atual
  "último assistente == este fallback" não pegou).

### P2-5 · Funcional · welcome (5/5 dossiês)
- **Esperado:** texto e card do welcome consistentes com D21 (3 categorias: Imóvel/Automóvel/Moto).
- **Atual:** o card `welcome` já oferece corretamente `Imóvel/Automóvel/Moto`, mas a frase que
  acompanha ainda diz "...pra imóvel, automóvel ou serviços" em 100% dos 5 dossiês.
- **Evidência:** `dossie.json` de qualquer um dos 5, turno 1 — `agentText` menciona "serviços",
  `welcome.data.options` lista `moto`.
- **Arquivo provável:** `src/lib/agent/system-prompt.ts:835`.

### P3-6 · UX · latência do reveal (5/5 dossiês)
- **Esperado:** feedback intermediário ou paralelização (G5, já mapeado, deferido pra onda 3).
- **Atual:** 59-64s consistentes em todos os reveals completos desta rodada — sem mudança desde a
  rodada anterior.
- **Evidência:** `Meta` de cada dossiê, turno 7 (63292ms, 59314ms, 59473ms, 64230ms).
- **Arquivo provável:** pipeline sequencial `search_groups→recommend_groups→simulate_quota→
  present_comparison_table` (já mapeado na spec da onda 2, G-E).

### PENDENTE-VISUAL (não pontuado, precisa checagem ao vivo no browser)
- Concatenação de balões sem separador nos turnos com múltiplas perguntas (reveal e fechamento, 5/5
  dossiês) — pode ser artefato do coletor de dossiê (texto cru concatenado sem marcar quebras de
  balão) e não do produto renderizado. Só o selo com Chrome ao vivo resolve isso.
- Renderização real do card de divergência (aviso "ajustamos essa carta...") e do `comparison_table`
  quando um grupo tem `creditValue` inconsistente (gap P1-2 acima) — o dossiê só prova o dado, não
  como (se) isso aparece visualmente pro cliente.

---

## 4. O que está BOM (verificado, não regredir)

- Os 2 fluxos-alvo (madalena-junta, mario-sem-lance) fecham ponta-a-ponta com `real_offer` real
  (`proposalId` genuíno), `signature_handoff`, `document_upload` e fecho WhatsApp completo.
- `gate:credit` CONFIRMA o valor do desire ("Uns R$ 250.000 então, é isso? Pode ajustar se quiser.")
  em vez de re-perguntar do zero — 5/5 dossiês, **FIX-284 morto**.
- Gate do motivo em turno próprio, sempre presente, 5/5 — **FIX-279 morto**.
- Zero non-sequitur/meta-narrativa ("não crio esse tipo de texto...") em busca literal nos 5
  dossiês — **G-D morto**.
- `rawCreditValue` propaga corretamente do pedido original até o `real_offer` de fechamento nos 2
  fluxos-alvo (250k/70k, não os valores da carta reveal/real) — **G-A/FIX-281 morto**.
- Guardrail netCredit (embutido) matematicamente correto e com teto de 30% consistente nos 2 casos
  onde aparece.
- Guard de fabricação de estado (FIX-270) segura sob paráfrase e pressão — I3 confirmado morto.
- Terminologia "reserva de cota" 100% consistente nos 3 fechamentos; zero "contratando/fechado".
- `taxaContemplacao` nunca como %; `two_paths` sem % de chance.
- pt-BR com acentuação correta em 100% do texto do agente (zero ASCII-ficação).
- Zero erro HTTP em 68 turnos; zero turno vazio; degradação sem crash em todos os cenários.
