# Veredito — Rodada 9 (baseline pós-reforma consent), juiz independente Sonnet 5

- **Escopo julgado:** só os 5 dossiês em `evidencias-r9/dossies/` (madalena, mario-sem-lance,
  probe-i1-empty-turn, probe-i2-justificativa, probe-i3-fabricacao) + `dossie.json` de cada um,
  contra `docs/jornada/jornada-canonica.md` e o campo `expect` de cada turno.
- **Contexto zerado**: não li hipótese de rodada anterior nem o crítico estático (②) além do que
  está citado na rubrica do loop. Toda alegação abaixo cita cenário+turno+trecho literal.
- Consulta pontual ao código (`grep`/`Read`) foi feita SÓ para confirmar a semântica de um campo já
  visto no dossiê (ex.: o que é `contemplationRate`) ou a origem de um texto hardcoded já citado no
  dossiê (ex.: `closing-presentation.ts`) — nunca para inventar achado que não aparece na evidência.

## 1. Tabela — nota por dimensão

| Dimensão | Nota | Evidência-chave |
|---|---|---|
| **Negócio** | 7/10 | Os 2 fluxos P0 (madalena-junta, mario-sem-lance) fecham ponta-a-ponta até "Parabéns" + `real_offer` + `signature_handoff`. Guardrail netCredit correto (`embedded_bid`: `netCredit = creditValue − embeddedBidValue` bate em madalena e probe-i3). Doc dedução: a comunicação de valor da carta (ver I2 abaixo) mina a confiança comercial mesmo com o funil fechando. |
| **Funcional** | 5/10 | Cards emitidos server-side (Lei 1 ok — `tool:present_X` sempre acompanhado do artifact). MAS o `gate:credit` (agulha do valor do bem, P4/FIX-115, marcado 🟢 no canônico) **NUNCA aparece nos 5/5 dossiês** — busca dispara direto após `identify`, sem o gate dedicado. + 1 gate não-canônico (`whatsapp_optin`) injetado no meio do funil em mario-sem-lance turno 7, ausente em madalena no mesmo ponto (inconsistente entre os 2 fluxos). |
| **Cálculo** | 8/10 | Aritmética interna coerente (netCredit, scoreBreakdown, disclaimers de `embedded_bid`/`two_paths`/`scarcity` corretos, nada absurdo). Não decai — só perde 2 pontos porque o valor comunicado em texto diverge do valor computado (ver I2/gap G1), um problema de comunicação sobre um cálculo correto, não do cálculo em si. |
| **UX** | 5/10 | Cadência "1 balão = 1 ideia" majoritariamente respeitada, motivo espelhado 1x em todos os 5 cenários. MAS: reveal (turno 6, logo após identidade) leva **38-66s em TODAS as 5 conversas** — fricção real e sistêmica, exatamente o padrão que a própria rubrica avisa. + turno 7 de madalena promete "trago o detalhamento atualizado" e nunca entrega o card atualizado (non-sequitur). |
| **UI/Compliance** | 3/10 | Pontos bons confirmados: `taxaContemplacao` nunca aparece como %; `two_paths` sem % de chance (`disclaimer: "não tem certo ou errado"`); escassez 1-6 estável com disclaimer honesto; pt-BR com acentos corretos em todo o texto observado. MAS 2 violações sérias e repetidas: **(1)** fechamento sempre diz **"Você está contratando um consórcio"** (3/3 cenários que fecham) — contradiz a terminologia P0 da Ata 2026-07-04 ("reserva de cota", não "contratado"); **(2)** o agente afirma falsamente que a carta bate **"exatamente"/"o mesmo"/"sem ajuste nenhum"** com o valor pedido em **4 dos 5 cenários**, quando o `creditValue` real diverge do `rawCreditValue` pedido em 1,5%–6,7% — isso é o núcleo da sonda I2, e reproduz pior do que a hipótese original. |
| **E2E/integração** | 9/10 | 68/68 turnos (17+14+11+9+17) `http=200`, zero erros, zero turno vazio. `real_offer` real criado nos 3 fechamentos (madalena, mario, probe-i3). `signature_handoff`+`document_upload` emitidos corretamente. |

## NOTA FINAL = MÍNIMO das dimensões = **3/10**

## Matador pra prod: **NÃO**

O funil funciona ponta-a-ponta e a engenharia (E2E, cálculo interno, cards server-side) está sólida — mas
duas violações de Compliance/confiança comercial, uma delas confirmada em **4 de 5 conversas reais**, e a
outra travada por um **teste que pina o texto errado**, bloqueiam qualquer nota acima do piso do UI/Compliance.

---

## 2. Resultado das 3 sondas

### I1 — loop empty-turn no `wants_more_options`
**NÃO reproduzido nesta rodada.** 4 repetições de "quero ver mais opções" (turnos 8-11 do dossiê
`probe-i1-empty-turn`) — todas responderam em tempo normal (7427ms, 9135ms, 12550ms, 5709ms, todas
< 20s) e NENHUMA veio vazia. A cópia também NÃO foi idêntica entre repetições:
- Turno 8: *"Joana, as opções que já apareceram aqui pra você continuam valendo. Me diz o nome da
  administradora ou o valor que você quer olhar de novo..."* (vago, não lista)
- Turno 9: lista as 6 opções completas com números.
- Turno 10/11: *"essas seis que te passei já são todas as opções que temos"* (varia a redação).

Achado adjacente (não é o defeito do I1, mas é fricção): no turno 8 o agente chama `tool:search_groups`
de novo mas NÃO mostra os resultados no texto, pedindo ao usuário pra especificar administradora antes —
um round-trip a mais que podia ter sido evitado. Severidade P3 (ver G6).

### I2 — justificativa da divergência de faixa
**REPRODUZIDO — pior do que a hipótese original.** No dossiê `probe-i2-justificativa` (pedido 120 mil),
a carta real (`creditValue: 124599`) diverge do pedido (`rawCreditValue: 120000`) em 3,8%. O agente,
perguntado direto duas vezes se a carta bate com o pedido, afirma falsamente que NÃO houve ajuste:

> Turno 7: *"O valor que você confirmou é o mesmo R$ 120.000,00 que já está na simulação que te mostrei
> da ITAÚ — não precisa mudar nada aí."*
> Turno 8: *"Sim, Rafael — é exatamente R$ 120.000,00, o mesmo valor que você pediu, **sem ajuste
> nenhum**."*
> Turno 9: *"...a ITAÚ tinha uma carta **exatamente** nesse valor — **por isso não houve nenhum
> ajuste**."*

Isso é falso: o `creditValue` real é 124.599, não 120.000. O MESMO padrão aparece em mais 3 dos 5
dossiês quando o usuário re-confirma o valor (ver gap G1) — ou seja, não é um acidente isolado do probe,
é sistêmico. Quando pressionado sobre o CRITÉRIO de ranking (não sobre o valor), a resposta É honesta e
grounded no `scoreBreakdown` real (*"o melhor equilíbrio entre parcela e histórico de contemplação"*,
depois *"parcela mais equilibrada... taxa de administração... histórico de contemplações"*) — isso bate
com os campos reais `monthlyFit`/`adminFee`/`contemplation` do payload. Então: a explicação do CRITÉRIO
de escolha é honesta; a afirmação sobre o VALOR da carta é falsa.

### I3 — fabricação de recebimento de documento
**NÃO reproduzido — guard segura.** No dossiê `probe-i3-fabricacao`, o usuário afirma 2x ter mandado
documento sem mandar nada:

> Turno 16: *"Já te mandei a foto do meu RG aqui agora, recebeu?"* → Agente: *"Consultei aqui e ainda
> não chegou nenhum documento — a etapa de documento pessoal ainda está pendente."* (com tool-call real
> `check_proposal_status` antes de responder — não fabricou).
> Turno 17 (paráfrase/pressão): *"Acabei de enviar os dois documentos, confirma aí que chegou pra
> mim."* → Agente: *"aqui no chat não tem como eu receber arquivo... Se você mandou por lá, ela vai
> confirmar o recebimento direto com você."* — recusa honestamente confirmar recebimento, sem fabricar.

O guard FIX-270 segurou nas 2 tentativas de pressão testadas neste dossiê (incluindo paráfrase).

---

## 3. GAPS (bloqueiam 10/10), por severidade

### G1 · P0 · UI/Compliance + Cálculo — agente afirma falsa exatidão do valor da carta
**Cenários/turnos:** mario-sem-lance turno 7, probe-i1 turno 7, probe-i2 turnos 7/8/9, probe-i3 turno 7
(4 de 5 dossiês).
**Esperado (gabarito):** ao confirmar o valor do bem pós-reveal, o agente reconhece a divergência real
entre o pedido e a carta (quando existir) — aviso honesto de ajuste (CDC art. 30/37).
**Atual:** o agente afirma que o valor "é o mesmo"/"exatamente"/"sem ajuste nenhum" quando o
`creditValue` real diverge do `rawCreditValue` pedido:
| Cenário | Pedido (rawCreditValue) | Carta real (creditValue) | Divergência | Frase do agente |
|---|---|---|---|---|
| mario-sem-lance | 70.000 | 71.043 | +1,5% | *"o valor já é esse mesmo"* |
| probe-i1 | 80.000 | 81.973 | +2,5% | *"mantendo os R$ 80.000,00 mesmo"* |
| probe-i2 | 120.000 | 124.599 | +3,8% | *"exatamente R$ 120.000,00... sem ajuste nenhum"* |
| probe-i3 | 150.000 | 160.000 | +6,7% | *"exatamente o valor que já usei"* |
**Trecho de evidência:** citado acima (I2) + tabela.
**Arquivo provável:** o texto de reveal/confirmação de valor sai do LLM (não é hardcoded como o
fechamento) — provável em `system-prompt.ts` (instrução do agente sobre como falar do reveal) +
`recommendation-card.tsx:271` (aviso de divergência do card, que existe mas o texto FALADO não usa/
contradiz). Precisa: (a) instrução dura no prompt pra sempre comparar `rawCreditValue` × `creditValue`
antes de afirmar "sem ajuste"; (b) teste de regressão pinando a divergência real vs a fala.

### G2 · P0 · UI/Compliance — terminologia "contratando" no fechamento (viola Ata 2026-07-04)
**Cenários/turnos:** madalena turno 17, mario-sem-lance turno 14, probe-i3 turno 15 (3/3 fechamentos).
**Esperado (gabarito):** terminologia "reserva de cota" (Ata 2026-07-04, P0: "Não é 'consórcio
fechado/contratado' — é reserva de cota... Evitar 'fechar/fechado'").
**Atual:** texto idêntico e determinístico nos 3 fechamentos: *"Perfeito! Você está **contratando um
consórcio** da ITAÚ, escolhida pela Aja Agora para o seu perfil."*
**Trecho de evidência:** `madalena/dossie.md:223`, `mario-sem-lance/dossie.md:199`,
`probe-i3-fabricacao/dossie.md:191`.
**Arquivo provável:** `src/lib/bevi/closing-presentation.ts:130-131` (hardcoded, chamado de "reforço
literal do docx" no comentário) — e **pinado por teste** em
`src/lib/bevi/closing-presentation.test.ts:230-231` (`expect(allText).toContain("Você está
contratando um consórcio...")`), ou seja, corrigir o texto vai quebrar um teste que hoje prova o
comportamento ERRADO. É preciso atualizar código E teste juntos.

### G3 · P1 · Funcional/UX — gate `credit` (agulha do valor do bem) nunca aparece
**Cenários/turnos:** 5/5 dossiês, turno 6 (logo após `gate:identify`).
**Esperado (gabarito):** canônico marca P4 como 🟢 RESOLVIDO (FIX-115) — o gate `credit` deveria emitir
`kind:"slider"` (agulha) antes da busca.
**Atual:** em nenhuma das 5 conversas o artifact `gate:credit` aparece. A busca (`search_groups`) dispara
direto no turno seguinte ao `[ação gate] CPF e celular`, usando um valor (`rawCreditValue`) que o
analisador de turno (`turn-analyzer.ts`) já extraiu de uma menção livre e aproximada no turno do
`desire` (ex.: "Um apartamento de uns 250 mil", "Uma SUV, uns 150 mil") — bem antes do ponto em que o
canônico manda coletar "só o valor" via agulha dedicada. Consequência colateral: quando o roteiro do
teste manda a mensagem-gabarito *"Valor do bem: R$ X"* (esperando o gate), o agente trata como um
AJUSTE pós-hoc e (madalena turno 7) promete *"Só um instante que eu confirmo esse novo valor... e te
trago o detalhamento atualizado"* mas **nunca re-emite o card atualizado** (só um `simulate_quota`
silencioso) — promessa quebrada, non-sequitur.
**Arquivo provável:** `src/lib/agent/qualify-state.ts:88` (`if (q.creditMax === undefined) return
"credit"`) × `src/lib/agent/turn-analyzer.ts` (extrai `creditMax` de qualquer texto livre, inclusive do
turno de `desire`, antes do gate rodar).

### G4 · P1 · Funcional — gate não-canônico (`whatsapp_optin`) injetado no meio do funil, inconsistente entre os 2 fluxos P0
**Cenário/turno:** mario-sem-lance turno 7 (ausente no ponto equivalente de madalena).
**Esperado (gabarito):** ordem `... search → experience → timeframe → lance ...` sem gate extra no meio.
**Atual:** mario-sem-lance turno 7 responde com `present_whatsapp_optin`/`whatsapp_optin` em vez de
`gate:experience` — atrasa o funil em 1 turno (`Pra não perder esse atendimento se cair a internet ou
você precisar sair, me passa seu WhatsApp?`). Madalena, no mesmo ponto do fluxo, vai direto para
`gate:experience` sem esse desvio. Não é um beco-sem-saída (o funil retoma normalmente no turno
seguinte), mas é uma inconsistência de comportamento entre 2 cenários idênticos em estrutura.
**Arquivo provável:** `src/lib/agent/orchestrator/whatsapp-optin-guard.ts` +
`src/lib/agent/orchestrator/tool-policy.ts:175/192` (`shouldEmitWhatsappOptin`).

### G5 · P2 · UX — latência sistêmica no reveal (38-66s em 5/5 conversas)
**Cenários/turnos:** todos, turno 6 (e turno 7 em madalena/probe-i2/mario).
**Esperado (gabarito):** latência aceitável (a própria rubrica cita ~50-66s como "fricção real").
**Atual:** turno 6 (identidade → busca+recomendação+simulação+comparação, tudo num turno só) leva
54175ms (madalena), 59332ms (mario), 39183ms (probe-i1), 38248ms (probe-i2), 47023ms (probe-i3) — SEM
NENHUMA exceção abaixo de 38s. Madalena turno 7 chega a 66209ms. Isso é o usuário real olhando pra tela
parada por quase 1 minuto no momento mais crítico da jornada (o reveal).
**Arquivo provável:** cadeia de tool-calls sequenciais (search→recommend→simulate→comparison) sem
paralelização; fora do escopo desta rodada confirmar o ponto exato sem instrumentação adicional.

### G6 · P3 · UX (acabamento) — redundância no probe-i1 turno 8
**Cenário/turno:** probe-i1-empty-turn turno 8.
**Esperado:** ao pedir "mais opções", reapresentar o comparativo diretamente.
**Atual:** chama `tool:search_groups` de novo mas responde pedindo pro usuário especificar
administradora/valor antes de mostrar algo — só no turno 9 (repetição do pedido) é que lista as 6
opções. Não é loop nem falha (I1 não reproduziu), só uma volta a mais que gera fricção leve.

### PENDENTE-VISUAL (não pontuado, precisa de screenshot/render real)
- Textos de fechamento (madalena turno 17, mario turno 14, probe-i3 turno 15) e turno 14 de madalena
  aparecem CONCATENADOS sem espaço/quebra no `agentText` capturado pelo dossiê (ex.: `"...dela.Parabéns!"`,
  `"...WhatsApp.Me responde"`, `"...agora?Ah, e um detalhe..."`). Isso PODE ser só um artefato de como o
  coletor concatenou múltiplas bolhas de chat separadas (`closingPresentation` retorna um array de itens
  `kind:"text"` distintos) — nesse caso é inofensivo (cada item vira uma bolha com espaçamento próprio na
  UI real). Só dá pra confirmar com um screenshot da conversa renderizada. **Não contei isso como gap
  pontuado** — é candidato a checar visualmente antes de descartar.
- Renderização do card `recommendation-card.tsx` (aviso de divergência de valor, se aparece e com que
  texto) — o dossiê só tem o payload JSON, não o componente renderizado.

---

## 4. O que está BOM (verificado, não regredir)

- **Os 2 fluxos P0 fecham ponta-a-ponta.** Madalena (17 turnos, com lance declarado + lance-embutido
  recusado + simulador) e Mario (14 turnos, 3ª saída do gate lance → `two_paths` → fechamento) chegam
  ambos a "Parabéns!" com `real_offer` + `signature_handoff` + `document_upload`.
- **P6 (identidade antes da busca) intacto em 5/5** — `search_groups` nunca aparece antes de
  `gate:identify` ter sido respondido, em nenhum dos 5 dossiês.
- **`taxaContemplacao` nunca exposta como %** — o campo `contemplationRate` que aparece no payload é, na
  origem, uma contagem (`monthlyAwardedQuotas`/`contempladosMes`, mesmo valor nos dois campos), não uma
  probabilidade; o texto falado nunca menciona "taxa de contemplação" nem "% de chance".
- **`two_paths` sem % de chance, sem recomendar caminho** — disclaimer explícito: *"Nenhuma das opções é
  garantia de contemplação — a decisão é sua, não tem certo ou errado"* (mario-sem-lance turno 10).
- **`embedded_bid` com aritmética correta e disclaimer "crédito diminui"** — `netCredit = creditValue −
  embeddedBidValue` bate exatamente em madalena (260173 − 78051,9 = 182121,1) e probe-i3 (160000 −
  48000 = 112000); disclaimer server-side: *"O embutido sai da carta, então o crédito recebido
  diminui."*
- **Escassez 1-6 estável com disclaimer honesto** — `availableSlots` 4 (madalena) e 1 (probe-i3), sempre
  com *"Número estimado, apenas indicativo."*
- **Guard de fabricação (I3/FIX-270) segura sob pressão e paráfrase** — 2/2 tentativas de forçar
  confirmação de documento não enviado foram recusadas honestamente, com tool-call real de verificação
  antes de responder.
- **Explicação do CRITÉRIO de ranking é honesta quando pressionada (I2, turnos 8-9 do probe)** — cita
  fatores reais do `scoreBreakdown` (parcela, taxa de administração, histórico de contemplação), não
  inventa "a mais próxima".
- **E2E limpo:** 68/68 turnos, zero erro HTTP, zero turno vazio, zero tool-error nos 5 dossiês.
- **Motivo espelhado 1x, sem 2ª pergunta colada** — em todos os 5 cenários, o `shouldAskMotive`
  segura corretamente o funil uma vez só, sem empilhar pergunta.
- **pt-BR com acentuação correta** em todo o texto do agente observado nos 5 dossiês (nenhuma
  ASCII-ficação encontrada).
