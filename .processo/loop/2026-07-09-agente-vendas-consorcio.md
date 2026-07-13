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
| baseline juiz Sonnet (develop atual) | ✅ **3/10 (MÍNIMO) — matador: NÃO** (`veredito-baseline-sonnet.md`). Neg 7·Func 5·Cálc 8·UX 5·**UI/Compl 3**·E2E 9 |
| execução onda 1 (blocos) | ✅ 2 blocos DONE + integrados. FIX-277 direção do aviso · FIX-278 reserva de cota · FIX-279 agulha só no gate ativo (guard `activeGateAtTurnStart`) · FIX-280 optin server-side. Merge LIMPO (system-prompt.ts auto-mergeou, regiões distintas). Promovido develop `193c1c83`. Container reiniciado. `test:unit` no container = gate. Workspaces de bloco deletados. |
| re-verificação (pós-onda-1) | ✅ **Sonnet 4/10** (subiu 3→4). Neg 7·Func 6·Cálc 5·UX 4·UI/Compl 6·E2E 9. `veredito-r9pos-sonnet.md`. **G1-G4 CONFIRMADOS MORTOS.** MÍNIMO=UX(4). |
| execução onda 2 | ✅ 3 blocos DONE + integrados. FIX-281 âncora rawCreditValue→real_offer · FIX-282 classificador de pergunta-de-exatidão (não fallback) · FIX-283 sanitizer meta-narrativa · FIX-284 gate credit confirma o desire · FIX-285 desireAnswered desacoplado. Merge LIMPO (system-prompt.ts auto-mergeou). Promovido develop `26cc9e0e`. Container reiniciado (smoke ok, sem 500). Workspaces + base deletados. |
| re-verificação (pós-onda-2) | ✅ test:unit **3304 verde**. 5 roteiros (68 turnos, 0 erros, `dossies-r9pos2/`). **Sonnet 4/10** (Neg8·**Func4**·Cálc6·UX5·UI8·E2E7). `veredito-r9pos2-sonnet.md`. Os 5 fixes onda 2 CONFIRMADOS (G-A/G-B/G-C/G-D/G-F ✓). MÍNIMO mudou p/ Funcional(4) por um P0 NOVO. |
| execução onda 3 | ✅ 3 blocos DONE + integrados. FIX-286 reveal materializa de `revealGroupsById` (nunca afirma estado falso) · FIX-287 `known-credit-values.ts` fonte única de creditValue/grupo · FIX-288 chip evolui com timer · FIX-289 recommend reaproveita search. Merge LIMPO (ai-sdk.ts auto-mergeou). Promovido develop `2beb775f`. Workspaces+base deletados. |
| re-verificação (pós-onda-3, **OpenAI**) | ✅ test:unit 3321 verde. 5 roteiros OpenAI. **Sonnet 4/10** (Neg4·Func5·Cálc5·UX5·UI6·E2E4). `veredito-r9pos3-sonnet.md`. Latência 62→33s ✓. Travou 3ª vez em 4 (whack-a-mole + pivô OpenAI). |
| execução onda 4 (raiz) | ✅ 3 blocos DONE + integrados. FIX-290 `comparison_table` server-side (nunca some) · FIX-291 degradação honesta Bevi + cap de retry · FIX-292 monthlyPayment consistente · FIX-293 directive anti-invenção. Merge LIMPO. Promovido develop `404cd35b`. Workspaces+base deletados. |
| **SELO FINAL (Fable, claude)** | ✅ `veredito-FABLE-selo.md`: **8/10 (MÍNIMO), MATADOR: NÃO por 1 bloqueio** (Neg10·Func9·Cálc9·**UX8**·UI9·**E2E8**). Trajetória 3→4→4→4→**8**. Produto vivo matador (comparison_table nunca some, degradação honesta, valores consistentes, anti-fabricação, reserva de cota, 3 propostas reais). Bloqueio **G-R0**: `test:integration` 2 vermelhas (ondas só gatearam test:unit): (a) `present_whatsapp_optin` re-exposta ao specialist (`ai-sdk.ts:1035` PRESENTATION_TOOLS, viola FIX-280); (b) contract_form pré-reveal suprimido sem re-emitir identify (recovery FIX-12 perdida × colisão FIX-279). Fable: resolvidas as 2 + suíte verde → MATADOR SIM sem nova coleta. |
| onda 5 (cirúrgica G-R0) | ✅ FIX-294 denylist optin (`builder.ts`) · FIX-295 re-emite identify (`runner.ts`; root cause = colisão FIX-285). test:integration 312 verde, test:unit 3335 verde. |
| **🏆 SELO FABLE FINAL** | ✅ **MATADOR PRA PROD: SIM — 10/10** (`veredito-FABLE-selo-final.md`, claude-sonnet-5, prova mecânica das suítes + estática do fix honesto). `develop→main` AUTORIZADO. |

## 🏁 CONCLUSÃO — r9 MATADOR PRA PROD (2026-07-12)
- **Selo Fable 10/10** no modelo de prod (claude). Trajetória: 3→4→4→4→8→**10**.
- **15 fixes** FIX-277..295, 5 ondas (4 raiz + 1 cirúrgica), cada uma verificada por juiz independente ao vivo.
- Suíte: **3335 unit + 312 integração, 0 falha.** Done-report: `.done/2026-07-12-2153-jornada-consorcio-matador-prod.md`.
- **Deploy:** `develop→main` (prod). Blast radius verificado: migration 0033 aditiva, sem breaking de contrato.
- **Gaps não-bloqueantes (próxima onda):** latência Bevi ~60s (PENDENTE-AGX paralelização) · G-R1..R6 polish.
- **Nota:** ondas 3-4 validadas no OpenAI (key salesbox, patch revertido); selo+deploy no claude (prod).

### r9 ONDA 4 — spec (pós-onda-3 4/10; 3 rodadas travadas → fix de RAIZ, lição r6/r8 "invariante em código")
Padrão claro: o MÍNIMO pula porque cards do reveal sem coerção server-side somem + Bevi third-party sem degradação. Gaps (`veredito-r9pos3-sonnet.md`):
- **FIX-290 · P0 sistêmico** — `comparison_table` é a ÚNICA carta do reveal sem coerção server-side (pareamento com `recommendation_card` é só regra-no-prompt) → some (probe-i2, junto de gate:experience+whatsapp_optin). **Fix:** coerção/emissão server-side do `comparison_table` (como o `recommendation_card`) — mata a classe "card do reveal some". Provável `ai-sdk.ts`/`route.ts`/orchestrator do reveal.
- **FIX-291 · P0 Bevi third-party** — mario não fechou: Bevi (DigitalOcean cold-start) travou 90s+, retries empilhados (~120s), fechamento quebrou "Tive um problema" SEM degradação. **Fix:** degradação HONESTA quando search/Bevi esgota retries (mensagem clara + recovery, nunca seguir roteirizado com dados vazios até quebrar no fechamento) + cap do empilhamento de retry. (Paralelização = PENDENTE-AGX, fora desta onda.)
- **FIX-292 · P1** — FIX-287 incompleto: corrigiu `creditValue` mas `monthlyPayment` ficou do cenário errado (mesmo groupId). **Fix:** `monthlyPayment` da fonte única (`recommendation-payload.ts`).
- **FIX-293 · I2** — sob pressão o agente inventa "grupos cheios/pausados" sem lastro de tool + simplifica o score. **Fix:** directive determinística com o motivo REAL (multi-fator) + proibir alegação de estado sem tool.
- **Blocos:** bloco-r9-4-reveal-serverside (FIX-290) · bloco-r9-4-bevi-degradacao (FIX-291) · bloco-r9-4-valor-honestidade (FIX-292+FIX-293).
- **Modelo do selo:** pergunta dispensada → sigo no OpenAI; confirmar claude(prod)×OpenAI no fechamento.

**🔀 PIVÔ DE MODELO (decisão do Kairo):** a partir da onda 3 a validação roda no **OpenAI `gpt-4.1`** (key salesbox direta, não o gateway) — patch reversível `OPENAI_DIRECT` em `gateway-openai.ts` (uncommitted) + `.env.local` (gitignorado). Ondas baseline→2 (nota 4/10) foram no **claude-sonnet-5** (prod default) → notas NÃO comparáveis daqui. Fixes onda 3 são server-side/determinísticos (valem em qq modelo). Reverter = tirar 3 linhas do `.env.local`. **PENDENTE-KAIRO:** se o selo final deve ser no claude (prod) ou OpenAI.

### r9 ONDA 3 — spec (pós-onda-2 Sonnet 4/10; nota não moveu 4→4, MÍNIMO pula → mudança de ângulo)
Onda 2 fechou G-A/G-B/G-C/G-D/G-F (confirmados). Composição subiu (UI 6→8, Neg 7→8) mas MÍNIMO virou Funcional(4) por um P0 novo. Gaps (`veredito-r9pos2-sonnet.md`):
- **P0 · Funcional · reveal suprimido pelo guard de tool-error/cap** — em probe-i2 a ação "Valor do bem: R$120.000" disparou FIX-262 (`runner.ts:473-511`) que engoliu o reveal inteiro (`recommendation_card`/`gate:experience` nunca apareceram); fallback FALSO "opções já apareceram" quando nada apareceu. Família r6 (contenção). **Fix:** guard NÃO pode suprimir reveal legítimo; fallback não pode afirmar estado falso.
- **P1 · Cálculo · comparison_table × simulation_result inconsistentes** — mesmo groupId, `creditValue` 120000 (tabela) vs 160000 (simulação), 33% sem aviso. **Fix:** fonte única de creditValue por grupo.
- **P2 · UX · latência reveal 62-64s** (Bevi-bound, ~100% em `search_groups`: 2 queries sequenciais sem/com embutido, `simulate()` ~15-25s cold-start DigitalOcean). **Fix Eixo B (percebido, seguro):** chip de status EVOLUI com o tempo (`streaming-dots.tsx`/`chat-message.tsx`) — hoje fica estático ~50s. **Fix Eixo A-seguro:** dedupe `recommend_groups` (rebusca o que search já trouxe). **⚠️ PENDENTE-KAIRO:** paralelizar as 2 chamadas Bevi (~40-50% de ganho) exige confirmar com Bevi/AGX que PATCH concorrente na mesma proposta é seguro (código assume sequencial) — NÃO autônomo.
- **Resíduos:** I2 turno 8 auto-contraditório ("bate certinho... sem ajuste" seguido de "diverge 33%"); I1 fallback repete texto verbatim (cosmético).
- **Blocos onda 3:** bloco-r9-3-reveal-guard (P0+I2) · bloco-r9-3-consistencia-valor (P1) · bloco-r9-3-latencia-percebida (Eixo B+A-seguro).

### r9 ONDA 2 — spec (pós-onda-1 Sonnet 4/10)
Onda 1 fechou G1-G4; nota subiu 3→4. Novos blockers (`veredito-r9pos-sonnet.md` §3):
- **G-A · P1 · Cálc+Compl** — âncora de divergência (`rawCreditValue` original) não propaga até o `real_offer` (fechamento): mario **sem o campo** (pedido 70k, some), madalena **aponta pro `creditValue` do reveal (260.173) em vez do pedido (250.000)** → sub-representa divergência 5,55%→1,4%. Componente certo (`real-offer.tsx:85-100`); fonte do payload errada (contract-submit/present_real_offer). Fix: fiar `rawCreditValue` original até o fechamento + teste de ponta a ponta.
- **G-B · P1 · UX** — evasão: perguntado 2x "é 120k como pedi? por quê essa?", agente despeja lista crua sem responder sim/não nem conectar ao score (probe-i2 t8-9). Matou a mentira (G1), virou não-resposta. Fix: directive/invariante que faça o agente RESPONDER a divergência+critério (paridade com o dado que já tem).
- **G-F · P2 · UX** — valor do bem pedido 2x (desire + gate credit) em 5/5 — efeito colateral do FIX-279. Fix: gate credit CONFIRMA o valor do desire ("uns 250 mil, certo?") em vez de re-perguntar do zero.
- **G-D · P2 · UX** — meta-narrativa "não crio esse tipo de texto por conta própria" (mario t7, 1/5, viola D23). Fix: suprimir (código/sanitizer > prompt).
- **G-C · P2 · Func** — gate motivo pulado + CPF 2x (probe-i1 t4-5, 1/5, `qualify-state.ts:191 shouldAskMotive`). Fix: garantir o gate motivo em código.
- **G-E · P2 · UX (ONDA 3)** — latência reveal 62-75s (pode ter ruído de cold-start pós-restart); pipeline sequencial. Deferida (mais arquitetural).
- **PENDENTE-VISUAL:** concatenação no fechamento (provável artefato do dossiê, não do produto) + render do aviso — checar no selo Fable com screenshot ao vivo (Chrome).
- **Blocos onda 2:** bloco-r9-2-anchor-fechamento (G-A) · bloco-r9-2-prompt-honestidade (G-B+G-D) · bloco-r9-2-gate-refino (G-F+G-C).

**⚠️ Bloqueio de deps resolvido (dívida de infra pré-existente):** o restart do container develop expôs que o node_modules estava **corrompido/parcial** — `@ai-sdk/openai` (dep de `a7d6f7d1`, importado top-level por `builder.ts:20 createGatewayOpenAI()`) AUSENTE, apesar de estar no lockfile → **HTTP 500 em todo `/api/chat`**. `pnpm install --frozen-lockfile`/`--force`/rm `.modules.yaml` **mentiam "up to date"** sem instalar; só **`docker exec aja-app-develop pnpm add @ai-sdk/openai@3.0.80`** materializou (fetch+link). Lockfile do host não mudou (revertido churn espúrio de URL deprecated). **Consequência p/ o baseline:** o 3/10 rodou num build cacheado PRÉ-`a7d6f7d1` (stale); a re-verificação pós-fix roda em código 100% atual (`193c1c83`) — medição autoritativa. `test:unit`: 2749 passaram; 24 arquivos falham por ESM resolution do `@ai-sdk/openai` no vitest (não asserção; ortogonal aos fixes).

**⚠️ Incidente recuperado (housekeeping adiado mordeu):** o 1º `launch-blocks --wave 1` disparou os 18 blocos STALE que ainda estavam em `todo/` (r2-r8 + reveal, já mergeados/em done/ mas nunca arquivados). Criou 5 workspaces antes de parar. Recuperação: deletei os 5 workspaces stale, **arquivei as 18 pastas** (cards já em `done/`, zero perda), sincronizei a base, re-lancei só os 2 r9. **Lição:** arquivar `todo/` ANTES de `launch-blocks` (a memória já avisava — adiei e paguei).

### r9 — BASELINE Sonnet 3/10 (achados reais ≠ herdados I1/I2/I3)
Sondas: **I1 (empty-turn) NÃO reproduziu ao vivo** (4 reps <20s, copy variou) · **I3 (fabricação) guard segurou** · **I2 CONFIRMADO e pior**. Verificado contra canon/Ata/código:
- **G1 · P0 · falsa exatidão do valor** — agente jura "sem ajuste nenhum/exatamente" com divergência real 1,5-6,7% em 4/5 dossiês (mario 70k→71.043, i2 120k→124.599, i3 150k→160k). Card `recommendation-card.tsx:264-275` INVERTIDO (renderiza `rawCreditValue`=pedido como "essa carta"; payload popula ao contrário do comentário FIX-197). Fala do reveal = LLM livre sem invariante. **Fix:** invariante server-side comparando `rawCreditValue`×`creditValue` + paridade real_offer no card + regression test.
- **G2 · P0 · terminologia "contratando"** — `closing-presentation.ts:130` "Você está contratando um consórcio" viola canon (`jornada-canonica.md:31-32`) + Ata (`atas/2026-07-04:78,157`: "RESERVA DE COTA, não contratado/fechado"). **Pinado por teste ERRADO** (`closing-presentation.test.ts:230-231`). **Fix:** copy "reserva de cota" + corrigir código E teste juntos.
- **G3 · P1 · gate `credit` nunca dispara** (5/5) — `turn-analyzer` extrai `creditMax` do turno `desire` livre → pula a agulha canônica (`qualify-state.ts:88`); consequência: valor afirmado pós-reveal vira "ajuste" com promessa quebrada (madalena t7 promete detalhamento atualizado, nunca re-emite card). **Fix:** não pré-preencher `creditMax` do desire (gate agulha dispara) OU re-emitir card no ajuste — alinhar canon.
- **G4 · P1 · `whatsapp_optin` inconsistente** — mario t7 injeta gate não-canônico ausente em madalena no mesmo ponto (`whatsapp-optin-guard.ts`, `tool-policy.ts:175/192`). **Fix:** consistência entre fluxos (investigar condicional).
- **G5 · P2 · latência reveal 38-66s** (5/5) — tool-calls sequenciais search→recommend→simulate→comparison. **Fix (onda 2):** feedback intermediário / paralelizar.
- **G6 · P3** probe-i1 round-trip extra · **PENDENTE-VISUAL:** concatenação de balões no fechamento (pode ser artefato do dossiê — checar screenshot) + render do recommendation-card.
- **BOM (não regredir):** 2 fluxos fecham ponta-a-ponta · identidade antes da busca (5/5) · taxaContemplacao nunca como % · two_paths sem % · embedded_bid aritmética+disclaimer · escassez 1-6 · guard fabricação segura · E2E 68/68 · pt-BR com acento.

### r9 ONDA 1 — spec (2 blocos, defeitos ancorados em canon, sem decisão do Kairo)
- **bloco-r9-compliance-copy** (P0): FIX-277 (G1 falsa exatidão) + FIX-278 (G2 reserva de cota). Arquivos: `recommendation-card.tsx`, `recommendation-payload.ts`, `system-prompt.ts`, `closing-presentation.ts(+test)`.
- **bloco-r9-gate-funil** (P1): FIX-279 (G3 credit gate/promessa) + FIX-280 (G4 whatsapp_optin). Arquivos: `qualify-state.ts`, `turn-analyzer.ts`, `whatsapp-optin-guard.ts`, `tool-policy.ts`.
- Onda 2 (após re-verificar): G5 latência (FIX-281), G6/pendente-visual.

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

---

## Rodada 10 (nova fonte de intenção — mockup humanização + estudo P1-P10 sob modelo fraco) — ABERTA 2026-07-12

**Contexto:** o r9 selou 10/10 e foi pra prod validando contra os modelos Claude (Sonnet/Fable). O
Kairo rodou uma sessão manual de teste com um modelo **barato em validação (Qwen 3.5 Fast, via
gateway OpenAI-compat)** e a jornada degradou em pontos que o r9 nunca sondou — porque o
invariante estava garantido pelo PROMPT (regra que Claude obedece e Qwen não), não pelo código.
Isso é o mesmo padrão da lição-mãe do r9 (invariante em código > invariante em prompt), aplicado a
uma superfície nova: **robustez contra modelo fraco** + **nova coreografia de humanização** que o
Kairo desenhou num mockup.

**Fontes normativas desta rodada (superam decisões pontuais do r9 onde conflitarem — "palavra nova
vence", registrar ADR quando aplicável):**
- Mockup da jornada-alvo: `docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html` (2 cenários:
  Madalena "vai juntando" / Mario "sem entrada") — a régua de como a conversa deve SOAR e fluir.
- Estudo de causa-raiz: `docs/design/specs/2026-07-12-jornada-humanizada-estudo-e-correcao-design.md`
  (P1-P10 com file:line, S1-S7 propostas de correção) — a régua de QUAIS bugs são inaceitáveis.

**Mudança de objetivo macro (supersede parcialmente o objetivo original do topo do doc):** além de
"matador pra prod" no modelo de prod, a jornada agora tem que **segurar o funil mesmo sob um modelo
mais fraco que o de prod** — isto é, os invariantes que hoje só vivem no system-prompt (uma
pergunta por turno, sem card alucinado, sem menu genérico) viram código, e a régua de admissão de
qualquer troca de modelo passa a ser o bakeoff mecânico, não a torcida.

### Definition of Done — ACRÉSCIMO à rubrica (r10, mecanicamente checável)
As dimensões do topo do doc continuam valendo; r10 adiciona critérios explícitos por-P, TODOS
precisam bater o teto pro Fable selar (nenhum dos P1-P10 pode sobreviver, mesmo que o resto esteja
ótimo — é o pedido explícito do Kairo, o juiz é instruído a ser supercrítico contra esta lista):

| # | Critério de teto (P1-P10 do estudo) | Como o juiz checa |
|---|---|---|
| P1/P2 | **Invariante bi-fluxo** (não sequência única — o crítico ② provou que Mario não tem motivo/espelho/valor separado): (a) identidade NUNCA antes do valor ser conhecido; (b) identidade é sempre o ÚLTIMO gate antes do search; (c) quando o fluxo pergunta motivo, ele vem em turno próprio (nunca colado a outro pedido); (d) categoria vem antes do nome, com divider de especialista (D2: aprovado) | dossiê madalena/mario turno-a-turno — cada invariante checado nos DOIS fluxos, não uma sequência fixa |
| P3 | **Condicional** (D1: coreografia adaptativa aprovada): quando o fluxo leva a uma recomendação hero (ex.: Madalena), a cadeia é lista(comparison_table)→"já fez consórcio?"→explicação+chips (se 1ª vez)→**consentimento explícito**→hero — nunca hero direto sem consentimento. Quando o fluxo NÃO leva a hero (ex.: Mario, sem-lance/sorteio), a cadeia pula pra lista→two_paths sem os gates de recomendação — isso é esperado, não reprovação | dossiê + transcript, avaliado por-fluxo |
| P4 | ZERO turnos com 2+ perguntas no mesmo balão, em QUALQUER modelo testado (Claude E Qwen/modelo fraco) | grep de `?` por balão no transcript de ambos os dossiês |
| P5 | WhatsApp opt-in só aparece no FECHO (pós-decisão aceita), nunca solto pós-reveal | dossiê: posição do card na timeline |
| P6 | ZERO cards com conteúdo/labels não-ancorados (topic_picker só com catálogo canônico fixo); sondar ADVERSARIALMENTE pedindo o modelo fraco "confundir" o agente | probe adversarial dedicado no roteiro E2E + inspeção do payload do card |
| P7 | Usuário confuso ("não entendi") → o agente reancora no gate pendente de forma mais simples, nunca menu genérico nem dissertação fora de escopo | probe "não entendi" no roteiro |
| P8 | Usuário inativo no web recebe reengajamento proativo (mesma escada do WhatsApp) | probe de inatividade simulada no dossiê web |
| P9 | Modelo candidato (se ainda em avaliação) só é considerado "admitido" se `scripts/bakeoff.sh` bate a régua (fluxoScore ≥ 0.85, sem falha de passo) | log do bakeoff re-rodado pós-fixes |
| P10 | Sem frases coladas/emoji/capitalização errada em NENHUM gateway (Anthropic nativo E OpenAI-compat) | dossiê comparado nos dois caminhos |

### ② Veredito do crítico (Opus, contexto fresco) — RESOLVIDO

O crítico confirmou a maioria das root causes mas achou **8 buracos reais**: 2 estruturais (rubrica
P1/P3 não cabia no fluxo Mario; falso paralelismo de blocos — S1/S2/S5 colidem em
`qualify-state.ts`+`orchestrator/index.ts`+`runner.ts`, S3/S7 colidem em `sanitizer.ts`), 4 de
precisão (root cause de S2 mal localizada, S3 quebraria o próprio mockup se fosse "1 ask" em vez de
"1 frase interrogativa", S4 depende de intent `confused` inexistente, S5 depende de flag
`decisionAccepted` inexistente) e 2 de regressão r9 não endereçadas (S2 reescreve exatamente o
FIX-290 que fechou "comparison_table nunca some"; S1+S5 tocam a zona do FIX-294/295, cujos 2 testes
de integração têm que continuar verdes). Decisões D1/D2/D4 resolvidas pelo Kairo via
`AskUserQuestion` (D3/D5 do crítico adotados por padrão, sem bloquear — ver abaixo). Itens
reescritos com as correções abaixo, promovidos com **precisão de arquivo real**, e a execução vira
**2 ondas sequenciais** (não 7 blocos soltos) por causa do acoplamento lógico real.

**Decisões:**
- **D1 (coreografia):** ADAPTATIVA (aprovado) — pula motivo/espelho/reveal-2-tempos quando o
  usuário já deu a info ou está no caminho sem-lance/sorteio (fiel a Madalena × Mario).
- **D2 (abertura):** IMPLEMENTAR categoria→divider de especialista→nome (aprovado) — novo tipo de
  artifact `specialist_divider` (ou reaproveitar o mecanismo de troca de persona já existente em
  `directives.ts:29` + um card leve).
- **D4/timeout web:** 90s, igual WhatsApp (aprovado) — reusa `GATE_REENGAGE_TIMEOUT_MS` sem ajuste.
- **D5 (admissão de modelo — adotado sem bloquear, não é decisão de produto):** endurecer os
  invariantes em código e usar o bakeoff como gate de admissão, **sem prometer que o Qwen especificamente
  vai passar** — se não passar mesmo após os fixes, o piso barato já medido é o Haiku 4.5.

### Itens (r10) — corrigidos pelo crítico, promovidos por ONDA

**ONDA 1 (paralela, mesma base) — 4 blocos:**

- **BLOCO r10-1-funil-reveal (fusão S1+S2+D1+D2)** — mesma máquina de estados, tem que ser um bloco
  só (o crítico provou que dividir cria risco de ordem inconsistente no `nextGate()`).
  - S1: `qualify-state.ts:77-88` (FIX-53 põe `identify` antes de `credit`) +
    `qualify-state.ts:264-266` (força identidade no turno do motivo). Nova ordem: categoria→nome
    (D2, novo divider)→desire(bem)→motivo(turno próprio, SÓ quando aplicável — D1)→credit
    (copy referencia `desiredItem` real; `gateQuestion()` precisa receber o item, hoje só recebe
    `category`)→identify (moldura "ofertas reais")→search. Reverte FIX-53 conscientemente —
    registrar ADR.
  - S2: **root cause CORRIGIDA pelo crítico** — não é `recommendation-payload.ts:252-259` (isso é
    só o builder), é **`runner.ts:939-959`** (FIX-290 força `comparison_table` junto do
    `recommendation_card` quando há 2+ grupos) + `runner.ts:1043` (`revealCompleted`). Correção
    **CONDICIONAL** (D1): só nos fluxos que levam a hero — `search`→lista(comparison_table,
    SEMPRE server-side, preserva FIX-290)→`experience`→explicação/chips (catálogo canônico do
    mockup: "o que é lance?", "como funciona o sorteio?", "e quando eu for contemplado?")→novo
    gate leve `reco-consent`→hero (**server-forced, nunca dependente do LLM chamar tool** — é o que
    faz sobreviver a modelo fraco). Fluxos sem hero (Mario) pulam direto pra
    lista→`two_paths`. Tudo server-side (`emitServerCard`), Lei 1 preservada.
  - ⚠️ **Preservar regressão r9:** FIX-294 (denylist `present_whatsapp_optin` em `builder.ts`) e
    FIX-295 (re-emite `identify` na supressão de `contract_form` pré-reveal, `runner.ts`) — os 2
    testes de `test:integration` da onda 5 do r9 têm que continuar verdes. Rodar
    `test:integration` (não só `test:unit`) no gate deste bloco.

- **BLOCO r10-1-sanitizer-invariantes (fusão S3+S7-casca)** — mesma zona de arquivo
  (`sanitizer.ts`), agrupar.
  - S3: hoje "1 pergunta por turno" é só `system-prompt.ts:59,930` (regra-no-prompt); única
    anti-colisão em código é `shouldAskMotive`/`decideShowGate`
    (`qualify-state.ts:188-202,252-255`), específica do motivo. **Correção precisa (crítico):** o
    invariante é **"1 FRASE interrogativa por balão"**, não "1 pedido por balão" — o próprio
    mockup tem "Que carro você tem em mente, **e quanto custa** mais ou menos?" (dois pedidos, uma
    frase, um `?`) e isso é válido. No `EphemeralTextFilter`/`sanitizer.ts`: turno com
    gate/card do servidor descarta qualquer sentença interrogativa livre do LLM; turno sem gate
    mantém só a ÚLTIMA sentença terminada em `?`.
  - S7-casca: strip de emoji (zero-emoji já é política) + capitalização determinística do
    `contactName` no save — ambos no `sanitizer.ts`/save path, mesma zona.

- **BLOCO r10-1-topicpicker-clarify (S4)** — ⚠️ risco de conflito parcial com o bloco funil-reveal
  em `qualify-state.ts`/`orchestrator/index.ts` (revisar com cuidado no merge; git 3-way costuma
  resolver regiões distintas, como em quase toda onda do r9).
  - Root cause CONFIRMADA: print do card "a"/"b"/"Voltar" bate `topic-picker.tsx` —
    `present_topic_picker` (`ai-sdk.ts:256-266`) é a única tool com `topics: z.array(z.string())`
    livre, liberada em toda fase (`tool-policy.ts:45-51`). `topics` vira enum de catálogo canônico
    fixo (o mesmo catálogo do mockup, ver acima); restringir fase (fora de `decision`/closing);
    `artifact-guard` suprime se já há gate/card do servidor no turno.
  - **Correção de dependência (crítico):** a intent `confused` **NÃO EXISTE** hoje no
    `turn-analyzer`/type `UserIntent` (só `expressing_doubt`/`off_topic`) — precisa ser adicionada
    OU mapeada a partir de `expressing_doubt` + existência de gate pendente. A transição `clarify`
    não precisa virar um novo valor no enum `Gate`; pode ser um comportamento do orquestrador
    (re-emite o MESMO gate pendente com copy simplificada) sem mexer no type.

- **BLOCO r10-1-web-reengage (S6)** — único item verdadeiramente paralelo, sem colisão.
  - Root cause CONFIRMADA: `gate-reengage-poll.ts:53-59` filtra `channel==="whatsapp"`; comentário
    `:14-15` já admite o gap (PENDENTE-KAIRO histórico). Correção: remover o filtro de canal;
    ramificar a entrega (WhatsApp continua via `fireGate`/Meta API; web persiste a mensagem de
    reengajamento na conversa e o cliente puxa via o mecanismo de poll/resume já existente,
    `/api/chat/resume`). Timeout 90s (D4, aprovado).

**ONDA 2 (sequencial, depende da onda 1 integrada) — 2 blocos:**

- **BLOCO r10-2-whatsapp-fecho (S5)** — precisa da estrutura final do branch de reveal/decision da
  onda 1 antes de decidir o gatilho exato.
  - Root cause: `orchestrator/index.ts:699-717` + `whatsapp-optin-guard.ts:17-23` disparam em
    `revealCompleted`. **Correção de gatilho (crítico):** não existe flag `decisionAccepted` — usar
    `contractFormDispatched`/apresentação do `real_offer` (a proposta co-branded), que é
    exatamente onde o mockup põe o fecho (proposta → SÓ ENTÃO WhatsApp, com a 2ª persona
    "especialista em cadastros" e os 3 balões `wa:true` do roteiro FECHO). `phaseFromMeta` (closing
    = `decisionDispatched`) não é o corte certo — decisão MOSTRADA ≠ decisão ACEITA.

- **BLOCO r10-2-bakeoff-regua (S7-processo)** — depende dos fixes de código estarem integrados
  pra re-rodar o bakeoff com sentido.
  - `.bakeoff/qwen-jornada.log` confirma reprovação mecânica (fluxoScore 0.774 < 0.85) hoje.
    Re-rodar `scripts/bakeoff.sh` pós onda 1+2 pra medir se os invariantes em código melhoram a
    nota (sem prometer que o Qwen especificamente vai passar — D5). Investigar o chunking de
    frases no `gateway-openai.ts` via turn-trace ANTES de propor fix (não cravar sem log — a spec
    já reconhecia isso).

### Model routing (r10)
Segue o padrão do template: definir/criticar/planner E2E = Opus · blocos = pin barato
(`TB_BLOCK_MODEL`, sonnet — a spec mexe em máquina de estados crítica, não é volume trivial) ·
coletor = Haiku (determinístico onde der + Claude in Chrome pra visual + conversacional guiado,
incluindo rodar o MESMO roteiro contra o Qwen via `AI_MODEL` no ambiente de dev pra provar robustez
sob modelo fraco — é o produto sendo testado, não a campanha) · juiz da rodada = Sonnet · selo do
marco = **Fable, instruído explicitamente a ser supercrítico contra a lista P1-P10** (nenhuma
aprovação parcial — qualquer P vivo = nota não pode fechar 10/10).

### Política de exits (r10)
Mesma do topo do doc: sem cap, Fable sela, no-progress força troca de ângulo. Acréscimo: **nenhuma
rodada pode declarar 10/10 se o dossiê não incluir a sonda adversarial contra CADA P1-P10** — dossiê
incompleto = rodada inválida, não *pass* por omissão.

### 🎯 Encerramento oficial da campanha (armado via `/goal` nativo, 2026-07-13) — DUAS ETAPAS
O Kairo armou o hook `/goal` da sessão com a condição abaixo (verbatim, resumida). A campanha SÓ
encerra (libera o Stop hook) quando AMBAS as etapas passarem — nenhum atalho, nenhuma aprovação
parcial:

- **ETAPA A — Selo de produção (o que já estava em andamento).** Loop verificação em código real:
  planner (Opus) escreve o roteiro E2E → coletor (Haiku, determinístico + Claude in Chrome +
  conversacional) monta o dossiê → juiz da rodada (Sonnet) pontua → quando achar que bateu o teto,
  escala pro **Fable**, que lê o MESMO dossiê e só sela quando genuinamente 10/10 "pronto pra
  produção" (supercrítico contra P1-P10, sem aprovação parcial). Enquanto não for 10/10: achados
  viram itens novos → crítico → nova onda → nova verificação. Sem cap de rodadas.
- **ETAPA B — Suíte adversarial de 10 cenários fictícios (SÓ começa depois da Etapa A fechar).**
  O **Fable** (não o Kairo, não esta sessão) autora 10 cenários FICTÍCIOS de conversa cobrindo a
  jornada (variações de perfil/objeção/modelo fraco/ambiguidade — a composição exata é decisão do
  Fable como autor). Pra CADA cenário: o **Haiku pilota a conversa ao vivo via `claude-in-chrome`**
  (nunca Playwright/autopilot proibido) e monta o dossiê (prints + transcript + console/network).
  O **Fable relê cada dossiê como crítico da jornada** (mesmo rigor supercrítico da Etapa A) e
  pontua. Achado num cenário → vira item → conserto → **revalida TODOS os 10** de novo (não só o
  que falhou — regressão cruzada é sempre possível). **Só encerra quando o Fable der 10/10 nos 10
  cenários simultaneamente.**
- **Sem atalho:** nenhuma etapa pode ser pulada nem fundida; o veredito é sempre do Fable lendo
  evidência real (prints/dossiê), nunca self-report do executor nem desta sessão orquestradora.

### r10 — LEDGER
| Rodada | Blocos lançados | Integrado | Determinístico | Score Fable | Achados novos |
|---|---|---|---|---|---|
| 10.0 (crítico) | — | — | — | — | ✅ 8 buracos reais achados (2 estruturais + 4 precisão + 2 regressão r9); D1/D2/D4 resolvidos pelo Kairo (`AskUserQuestion`); itens reescritos, execução vira onda 1 (4 blocos) + onda 2 (2 blocos, sequencial) |
| 10.1 (onda 1) | r10-1-funil-reveal · r10-1-sanitizer-invariantes · r10-1-topicpicker-clarify · r10-1-web-reengage | ✅ 4/4 na base `integ/consorcio-r10` (`a70c9108`, pushado) | test:unit 3391/3391 · test:integration 320/325 (5 skip) · eval real (Camada 3) verde | — (verificação r10.1 ainda não rodou) | Ver "Gate da onda 1" abaixo — 3 causas-raiz reais achadas e corrigidas no próprio gate (não achados pra próxima rodada, já fechados) |

### Gate da onda 1 — o que quebrou e por quê (achado DURANTE a integração, corrigido na hora)

O gate do `merge-wave.sh` (host, sem container v2) reprovou os 4 blocos simultaneamente na
primeira tentativa — sintoma clássico de falha de AMBIENTE, não de código. Diagnosticado e
corrigido em 3 camadas, todas com causa-raiz provada (nunca `--no-verify`/skip):

1. **`merge-wave.sh` não reconhecia a convenção local-dev v2** (volume por-workspace, projeto
   migrou nessa mesma manhã) — só sabia detectar o volume único v1. **Corrigido NA FONTE da skill
   global** `todo-blocks` (`merge-wave.sh`, detecção v2 via `docker exec` no container já rodando,
   retrocompatível com v1). Commit em `~/.claude` (repo separado da skill).
2. **`.env.local` do worktree incompleto** (mesmo gap histórico de
   `project_aja_worktree_env_bootstrap`, agora também na v2): `ADMIN_*`/`BETTER_AUTH_SECRET`/
   `IDENTITY_ENC_KEY`/`BEVI_*`/`ANTHROPIC_API_KEY` ausentes/placeholder — backfill do clone
   principal. `DATABASE_URL` também apontava pra porta v1 morta (`localhost:5433`) — corrigido pro
   DNS OrbStack do pg shared (`aja-shared-pg.orb.local:5432`, alcançável do HOST, confirmado).
3. **Bugs reais de integração entre blocos** (não conflito textual — conflito de COMPORTAMENTO):
   - `qualify-state.fix-301-clarify.test.ts` + `artifact-guard.test.ts`: fixtures não conheciam o
     gate novo `reco-consent` (FIX-297) nem a ordem nova credit-antes-de-identify (FIX-296) —
     `nextGate()` parava num lugar diferente do que os testes assumiam. Também achado um gap real
     em `gateAwaitingReply`: não tratava `contractClosed` como terminal universal — corrigido em
     código (não só teste).
   - **O achado mais importante:** a decisão original do bloco topicpicker-clarify (ADR) reusava a
     intent `expressing_doubt` pro short-circuito de "usuário confuso" (FIX-301), "sem intent
     nova". Isso quebrou o FIX-266 (r9) — "deixa eu pensar aqui" é `expressing_doubt` POR DESIGN
     (hesitação sobre decisão que a pessoa entende) e passou a ser hijackado pelo short-circuito,
     atropelando a recuperação de tool-error. **Corrigido adicionando a intent `confused`** (nova,
     genuína, `turn-analyzer.ts`+`qualify-state.ts`), semanticamente distinta de `expressing_doubt`.
     Reforço em código (não só prompt): `isExactnessOrCriteriaQuestion` (mesmo regex do FIX-282/293)
     blinda contra o analyzer LLM confundir "por que essa e não outra?" com confusão genuína.
   - `gate-reengage-poll.integration.test.ts`: fixtures simulavam "stuck em identify" sem setar
     `qualifyAnswers.creditMax` — o worker RECALCULA o gate no disparo (não confia no `pendingGate`
     salvo), então caía em "credit" sob a ordem nova. Corrigido setando o campo nos 2 cenários.
   ADRs atualizados com adendo (`docs/decisoes/blocos/2026-07-12-bloco-r10-1-*.md`) — "palavra nova
   vence", evidência > estimativa prévia, decisão original registrada e corrigida, não apagada.
