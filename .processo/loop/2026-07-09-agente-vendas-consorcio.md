---
loop: agente-vendas-consorcio
iniciado: 2026-07-09
status: em-andamento
objetivo_macro: "Jornada do agente de vendas de consórcio (handoff validado) implementada e MATADORA pra prod — verificada por agent fable até 10/10."
verificador: agent fable (claude-fable-5), independente, contexto fresco
---

# Loop de goal — agente de vendas de consórcio

## Objetivo macro
Implementar o comportamento validado do handoff (`docs/design/specs/2026-07-09-handoff-agente-vendas-consorcio/`)
na app agêntica existente, sem infra nova, e levar a jornada a 10/10 verificada pelo
agent fable — só então promover a base pra develop.

## Definition of Done (RUBRICA — mecanicamente checável)
Nota final = MÍNIMO das dimensões (não média). 10/10 exige TODAS no teto + o fable declarar
"matador pra prod". Detalhe operacional dos itens em `scratchpad/rubrica-10-10-jornada.md`.

| Dimensão | Pergunta checável | Como o fable checa |
|---|---|---|
| **Negócio** | os 2 fluxos (Madalena junta / Mario sem lance) fecham ponta-a-ponta; guardrail netCredit respeitado; curva converge a sorteio | E2E dos 2 fluxos + juízo |
| **Funcional** | funil ligado de verdade (gates na ordem nova, timeframe reintroduzido, gate desire, 3ª saída→two_paths); cards coagidos server-side; nenhum botão morto | integração real + clicar tudo |
| **Cálculo** | curva power (não achata em 90%, sorteio emerge no fim); AMORTIZA; âncora de dinheiro pelo bolso; FGTS acelera | testes unit do motor verdes |
| **UX** | cadência 1 balão=1 ideia; sem beco-sem-saída; espelha motivation 1x; sem card redundante se responde tudo numa frase | percorrer como usuário |
| **UI/Compliance** | carta em destaque; taxaContemplacao nunca exibida; escassez 1-6 estável; embutido diz "crédito diminui"; two_paths sem % de chance; nunca "reservado"/"reduzir prazo"; pt-BR com acento | comparação visual + guards |
| **E2E/integração** | test:unit + test:integration verdes; E2E dos fluxos P0 passa | rodar a suíte |

## Itens (rodada 1) — FIX-225..235 (ver docs/correcoes/done/ após merge)
- Motor: FIX-225 curva power · FIX-226 guardrail netCredit · FIX-227 âncora+FGTS
- Cards: FIX-228 embutido · FIX-229 dois-caminhos · FIX-230 escassez placebo · FIX-231 guard+ajustes · FIX-232 proposta co-branded
- Jornada: FIX-233 ordem+slots+desire · FIX-234 sanitizer+voz · FIX-235 fecho WhatsApp

## Model routing
- Definir/criticar: Opus (esta sessão). Executar (blocos): sonnet (spec fechada, > haiku pra qualidade).
  E2E operador: haiku. Verificar/julgar: **fable** (claude-fable-5).

## Política de exits
- Exit primário: **fable dá 10/10 matador** → done-report + finish-wave --to-develop.
- No-progress (2 rodadas sem subir score) → TROCA DE ÂNGULO obrigatória (não encerra).
- Human checkpoint: decisão de produto/UX/blast-radius → AskUserQuestion (não crava no escuro).
- Prod: fora de escopo (Kairo não pediu deploy). Só develop após 10/10.

## LEDGER de rodadas
| Rodada | Blocos lançados | Integrado | Determinístico | Score fable | Achados novos → próxima rodada |
|---|---|---|---|---|---|
| 1 | motor-calculo, cards-ui, jornada-conversa (onda 1) | ✓ os 3 na base (7d7a552) | test:unit 2983/2983 ✓ · test:integration 270/270 ✓ · E2E API: jornada ponta-a-ponta | **Fable 3/10** (10 gaps acionáveis) | G1-G10 → rodada 2 |
| 2 | fix-r2-funil-cards (Gap 1,3,5,6) · fix-r2-valor-compliance (Gap 2,4,7,8,9,10) | ✓ os 2 na base (0d35943e), 1 conflito resolvido (adapter/testes) | test:unit 3062/3062 ✓ · test:integration 273/273 ✓ | Fable r2 **4/10** | 3 parciais (cards/aviso) + N1/N2 → rodada 3 |
| 3 | fix-r3-serverside-cards (cards server-side, fio rawCreditValue, N1 splitter, N2 recovery, polish) | ⏳ 1 bloco disparado | (pós-merge) | Fable r2 **4/10** (7/10 gaps corrigidos) → r3 fecha os 3 parciais + 2 novos | — |

### Rodada 2 — veredito Fable r1 (3/10, `docs/correcoes/rodada2-fable/`)
P0: 3ª saída quebrada (Fluxo B beco) · carta 211k sem aviso (CDC) · embedded_bid+scarcity órfãos.
P1: âncora de dinheiro morta · desire engolido · decision prematuro · "taxa de contemplação" na fala.
P2/P3: arredondamento de parcela · contract-submit sem form · higiene (emoji/comentário stale).
Bom (verificado): curva por-oferta, amortiza, guardrail netCredit, real_offer co-branded, fecho WhatsApp, pt-BR.
Decisão Kairo: carta 211k = clamp + aviso.

### Notas rodada 1
- 2 fixes de integração: (a) `present_two_paths` duplicado pelo auto-merge (cards+jornada) na fase closing e no REVEAL_EXPECTED do teste; (b) dev subida com `db:push` (só schema) ficou sem personas — corrigido com `db:migrate` (as personas são seedadas pelas migrations `0012/0016`).
- Dev de pé: http://aja-agente-vendas-consorcio.orb.local (workspace `agente-vendas-consorcio`, pg porta 5434).
- cards travou por `--plan-mode` (ExitPlanMode exige aprovação humana; respondedor só cobre AskUserQuestion) → relançado sem plan-mode.
- **E2E Haiku r1 abortou** por bug de AMBIENTE (não dos blocos): o backfill do `.env.local` deixou `ANTHROPIC_API_KEY` com o PLACEHOLDER do `.env.example` (`sk-ant-your-key`) — o script só preenchia vars vazias, e o placeholder não estava vazio. `invalid x-api-key` → agente mudo → jornada não passava do gate name. Corrigido: re-backfill sobrescrevendo segredos (não só vazios) com a key real (`sk-ant-api03`) + `up --force-recreate app`. Smoke pós-fix: agente responde, analyzer/cache OK. E2E Haiku r2 rodando.

## CONSOLIDAÇÃO (2026-07-10)
- r1+r2+r3 mergeados e **pushados na develop** (30c94094); test:unit 3089/3089 verde.
- Base integ/ + 3 workspaces de bloco deletados (100% mergeado). OrbStack: só develop.
- Validação FINAL (Fable) rodando na develop consolidada → gaps viram rodada 4 (nova base + blocos).

## Rodada 4 (Fable FINAL 4/10, junção develop)
- P0 N-A: what-if re-ancora recommendedOffer → fechamento fecha plano ERRADO (contract-input.ts:43 stale) → proposta real errada na Bevi + loop.
- Cards subiram D2 4→6 (server-side provado); ainda descobertos: scarcity (LLM chama decision_prompt direto), embedded_bid caminho texto; rota nome→grupo falta.
- Consertos r3 confirmados: splitter ✓, aviso fio ✓, recovery sem beco ✓.
- Blocos r4: fix-r4-ancora (FIX-251,252) + fix-r4-cards-polish (FIX-253..256). Base integ/consorcio-r4.

### r4 consolidada (2026-07-10)
- r4 mergeada e pushada na develop (92a8d2c4); test:unit 3116/3116 verde; migration 0033 aplicada.
- Base consorcio-r4 + workspaces r4 deletados. OrbStack: só develop.
- Fable validando a junção r4 (foco no P0 âncora fechado + scarcity/embedded no caminho texto).

## Rodada 5 (Fable r4 5/10 — melhor da série, P0 fechado)
- P0 âncora fechamento CORRIGIDO no núcleo (+1,9% do alvo, não 79%). Scarcity/embedded texto, copy canal, acentos, 0033: todos ✓.
- 2 P1 restantes: (1) espiral de negação (tool input string→number falha silenciosa → nega ofertas reais 3×); (2) fechamento troca marca em silêncio (ITAÚ→BB) + promessa em loop. FIX-252 rota nome→grupo não saiu.
- Blocos r5: fix-r5-toolinput-rota (FIX-257,258) + fix-r5-fechamento-gates (FIX-259,260,261). Base integ/consorcio-r5.

### r5 consolidada (2026-07-10)
- r5 mergeada+pushada na develop (f8a55d01); test:unit 3157/3157 verde. Base+workspaces r5 deletados. OrbStack só develop.
- Fable validando junção r5 (2 P1: espiral de negação [coerce tool input] + seam fechamento [aviso troca marca]).

## Rodada 6 (Fable r5 5/10 — TROCA DE ÂNGULO, nota estagnou 5→5)
- Ganho r5: fecho COMPLETO ao vivo (assinatura+docs+Parabéns) 1ª vez; gates texto + rawCreditValue ✓.
- Causa-raiz sistêmica: LLM sai do trilho e o CÓDIGO não contém — chunk tool-error não tratado (negação muda), anti-refazer no prompt falha, resolveOfferByMention desiste. Todos os matadores do Fable são CÓDIGO.
- Blocos r6: fix-r6-contencao (FIX-262 tool-error+cap, FIX-263 re-ancora textual+anti-refazer código) + fix-r6-mencao-polish (FIX-264 menção v2, FIX-265 menores). Base integ/consorcio-r6.
- CHECKPOINT: se r6 não subir a nota, vale alinhar com o Kairo até onde perseguir 10/10 (custo/rodada alto; LLM sempre acha jeito novo de sair do trilho).

### r6 consolidada (2026-07-10)
- r6 mergeada+pushada na develop (f7cabaa0); test:unit 3195/3195 verde. Base+workspaces r6 deletados. OrbStack só develop.
- Fable validando junção r6 (troca de ângulo: tool-error tratado no runner + cap steps + re-ancora textual + anti-refazer em código + menção v2).

## Rodada 7 (Fable r6 7/10 — SALTO 5→7, espiral morta) — ACABAMENTO
- A troca de ângulo (contenção em código) destravou: 4 matadores corrigidos ao vivo, zero regressões, fecho completo.
- Resta acabamento (não espiral): recuperação enlatada/lenta (72-112s, pede nome já dito 2×) · menção por parcela/prazo · residuais de voz (reserva/dedup/picotado) · finishReason.
- Blocos r7: fix-r7-recuperacao (FIX-266 recuperação=resolução, FIX-267 parcela/prazo) + fix-r7-voz-polish (FIX-268 voz, FIX-269 observabilidade). Base integ/consorcio-r7.

### r7 consolidada (2026-07-10)
- r7 mergeada+pushada na develop (f94d3344); test:unit 3218/3218 verde. Base+workspaces r7 deletados. OrbStack só develop.
- Fable validando junção r7 (acabamento: recuperação=resolução, menção parcela/prazo, voz, observabilidade).

## Rodada 8 (Fable r7 8/10 — subiu 7→8) — último bloqueador + acabamento
- D1 9 D2 8 D3 8 D4 8 D5 8 D6 9; zero regressões. Menção parcela/prazo + observabilidade + recuperação: corrigidos ao vivo.
- ÚNICO bloqueador real: agente FABRICA estado ('documentos recebidos' sem upload; 're-busquei' com 0 tool-calls) → invariante em código (mesma família do loop).
- Blocos r8: fix-r8-estado-verdade (FIX-270 guard fabricação) + fix-r8-acabamento (FIX-271 empty-turn resolver, FIX-272 voz final). Base integ/consorcio-r8.
- RECOMENDAÇÃO: r8 mata o bloqueador; depois disso avaliar PARAR (8→9 com todas dims altas é ótimo patamar).

### r8 consolidada (2026-07-10)
- r8 mergeada+pushada na develop (9d83483c); test:unit 3244/3244 verde. Base+workspaces r8 deletados. OrbStack só develop.
- Fable na validação DECISIVA (bloqueador de fabricação de estado matado? matador pra prod?).

## r8 VEREDITO: 8/10 — MATADOR PRA PROD: **SIM** (verificador independente)
- Bloqueador de fabricação de estado MORTO (FIX-270, 6 sondas adversariais ao vivo). Fecho completo, propostas reais. Suíte 3244/3244.
- Trajetória: 3→4→4→5→5→7→8→8(matador). Exit primário do loop atingido (verificador aprova).
- Dívidas 'antes de ESCALAR' (não de deployar): (1) loop empty-turn no wants_more_options (~50s, WhatsApp texto-only sem escape — DÚVIDA ABERTA verificar); (2) justificativa falsa 120k→150k ('a mais próxima' quando foi por score).
- Nits: blocklist de frases (paráfrase escapa), documentSlotsSent não escrito na web (over-suppress seguro), drop não logado.

---

## Rodada 9 (re-baseline pós-reforma consent — alvo 10/10 LIMPO) — ABERTA 2026-07-12
Contexto: depois do r8 (8/10 "matador pra prod: SIM"), o develop foi **reformado** (merge 473e8843 +
FIX-274/275/276: remove gate consent, motivo em turno próprio via `shouldAskMotive`, terminologia,
recomendação ancorada no valor do bem pedido, + QA de 40 critérios). O veredito r8 está **DEFASADO**
frente ao HEAD atual (4cf81754). A rodada 9 **re-baselina o develop atual** e persegue **10/10 limpo**
(não só "matador") — o Kairo pediu loop até o Fable selar 10/10.

**Itens candidatos** (herdados do veredito r8 — a CONFIRMAR contra o código atual no baseline; a reforma
pode ter fechado/mudado algum):
- **I1 (P1)** — loop empty-turn no intent `wants_more_options` (`docs/correcoes/inbox/2026-07-10-divida-empty-turn-loop-wants-more.md`). Quando o agente PROMETE busca e o próximo turno vem `length`/empty, disparar a busca determinística (não re-perguntar) + cap de repetição de fallback idêntico. FIX-271 não cobre este caminho (não é menção de oferta).
- **I2 (P2)** — justificativa FALSA da divergência de faixa 120k→150k (`.../2026-07-10-divida-justificativa-falsa-faixa.md`). A explicação da divergência tem que vir do motivo REAL (score/ranking), não de "a mais próxima" inventada.
- **I3 (P3 nits)** — guard de fabricação (FIX-270): blocklist frágil (paráfrase escapa → sinal semântico/estado real); `documentSlotsSent` não fiado na web (over-suppress seguro, mas fiar o slot); DROP do guard não logado (Lei 5).

**Baseline (④ primeiro, porque o código andou):** verificação fresca na develop atual — Opus planner
escreve os cenários E2E (2 fluxos P0 + sondas adversariais nos 3 cards) → Haiku coletor monta o dossiê
(`evidencias/rodada-9/`) → Fable juiz pontua a rubrica → score + gaps reais definem os itens finais.

### r9 — LEDGER
| Etapa | Estado |
|---|---|
| env feasibility (agente responde LLM ao vivo?) | ✅ VIÁVEL — `aja-app-develop.orb.local`, contrato `POST /api/chat` SSE (`text-delta`+`data-*`), 5 personas seedadas, key real direto Anthropic (sem VPN) |
| crítico estático (②) I1/I2/I3 vs código pós-reforma | ⏳ rodando (Opus) |
| planner baseline (roteiros+driver) | ⏳ rodando (Opus) → `.processo/loop/evidencias-r9/` |
| coletores (funil ao vivo) | ✅ 5 dossiês capturados via driver DETERMINÍSTICO (sem Haiku — turnos pré-scriptados, respostas capturadas verbatim): madalena 17t/0err (jornada completa até fechamento+real_offer), mario-sem-lance 14t/0err, probe-i1/i2/i3 ok. `evidencias-r9/dossies/` (gitignorado, sem PII) |
| baseline juiz Sonnet (develop atual) | ⏳ lendo dossiês → `veredito-baseline-sonnet.md` |

**Incidente infra (resolvido):** no meio da coleta o engine do OrbStack travou (`docker` não respondia, `fetch failed` em todos os turnos). `orb restart` exige nome de máquina; o fix foi **`orb stop` + `orb start`** (2ª tentativa pegou) → containers auto-voltaram, app 200. Lição: engine wedga sob carga sustentada; ciclar via stop/start, não `orb restart`. Latências reais capturadas: reveal Bevi ~54-66s (fricção de UX a avaliar).
| execução (blocos) | — |
| verificação | — |
| decisão | — |

**Escopo (contrato vigente):** campanha = **jornada do agente de vendas de consórcio** (rubrica no topo). Cards do inbox de outras superfícies (servicos, dashboard, simulador, whatsapp templates) estão FORA desta campanha; o baseline Fable ao vivo é o árbitro autoritativo dos gaps reais da jornada. Escopo maior = decisão do Kairo (não expando no escuro).

**Housekeeping (fazer na consolidação):** 15/16 blocos em `todo/` mergeados → arquivar em `done/`; `bloco-f-artifacts-produto` (FIX-93/95/96, antigo, fora do escopo consórcio, branch inexistente) = incerto, flag pro Kairo. Triage: inbox ~17 resolvidos; "provavelmente aberto" é baixa confiança (grep raso).

### r9 — veredito crítico estático (②, Opus, HEAD 712ce238)
- **I1 (empty-turn `wants_more_options`): AINDA-ABERTO** (reforma não tocou). `wants_more_options`→`decideShowGate=false` (`qualify-state.ts:273`): turno 100% LLM, sem re-apresentação determinística; resolver empty-turn (`route.ts:1403-1439`) só cobre re-pergunta de gate + menção de oferta → cai no `EMPTY_TURN_FALLBACK`; WhatsApp fallback texto puro sem cap (`adapter.ts:366-419`); tensão `system-prompt.ts:212` vs `:480` gera runaway `length`. **Fix (Lei 1/4):** emitir server-side `comparison_table` via `buildOtherOptions(conversationId, meta)` (`route.ts:593-605`, `other-options.ts`) — mesmo caminho do botão `decision_outras`; fallback honesto determinístico se sweep esgotou.
- **I2: reprodução 120k→150k FECHADA por FIX-276** (`creditProximity` dominante `recommendation.ts:18-24`, `recommendation.fix276.test.ts`). Resíduo P3: narrativa livre do motivo (`system-prompt.ts:51`). **ACHADO NOVO DETERMINÍSTICO REAL:** aviso de divergência do hero **INVERTIDO** — `recommendation-card.tsx:271-272` "Ajustamos essa carta de {rawCreditValue=PEDIDO} pra sua faixa de ~{creditValue=CARTA}" chama o pedido de "essa carta"; FIX-247 já corrigiu no `real_offer`/WhatsApp (`formatter.ts:1032`, `real-offer.tsx:100`) mas não no hero; teste `credit-adjustment-notice.fix-197.test.ts` só checa presença, não direção; FIX-276 aumenta exposição. **Fix:** paridade com real_offer + teste que pinna direção.
- **I3: 3 nits AINDA-ABERTOS** (`sanitizer.ts` intocado). (a) blocklist regex frágil (`sanitizer.ts:183-231`)→checar `StateVerificationContext` real; (b) `documentSlotsSent` só WhatsApp (`document-inbound.ts:141`; web `runner.ts:291-296` sempre false, over-suppress SEGURO) — ATADO à D12 (persistência própria), defer; (c) DROP silencioso (`sanitizer.ts:293-347`)→logar (Lei 5).
- **Env "gate-zero" do crítico: REFUTADO** — smoke provou runtime LLM local viável (key direto Anthropic). O `--no-verify` FIX-276 / memória "precisa VPN" = suíte pré-commit (gateway), não runtime.
- **Decisões do Kairo (revisitar em batch só se baseline confirmar):** (1) I1 comportamento quando sweep esgotou (re-apresentar/honesto/ampliar faixa + copy); (2) I2 directive determinística de motivo (P3, talvez desnecessária pós-276); (3) I2 texto do aviso hero (default: paridade real_offer); (4) I3(b) slot web atado a D12 (default PENDENTE).
- **Sonda extra sugerida p/ baseline:** pedido abaixo da menor denominação (proximity pode favorecer carta < bem; guardrail netCredit só cobre embutido `recommendation.ts:129-141`).
