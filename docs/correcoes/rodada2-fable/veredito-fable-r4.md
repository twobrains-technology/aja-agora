# VEREDITO r4 — Verificador independente (Fable) · JUNÇÃO r1+r2+r3+r4 na DEVELOP · 2026-07-10

Método: condução adaptativa própria via `POST /api/chat` em `http://aja-develop.orb.local`
(develop `cce9ae9f`, app recém-subido, migration 0033 confirmada no schema), 2 conversas ao
vivo (**Fluxo B** Mario até contract-submit 2×, com o repro do P0 por texto; **Fluxo A**
Madalena por TEXTO nos gates críticos até real_offer + tentativa de fecho), leitura dos diffs
FIX-251..256, `turn-trace`/`tool-io` do `aja-app-develop`, re-execução dos testes novos no
container (FIX-251 integration 1/1 ✓; contract-input + offer-mapper 44/44 ✓). **Nenhuma nota
depende de self-report.** 2 propostas reais criadas na Bevi (`6a512408…`, `6a512611…`).

## Nota final: **5/10** (mínimo das dimensões) — melhor rodada até aqui; NÃO é matador pra prod

| D | Dimensão | r2 | FINAL r3 | **r4** | Resumo |
|---|---|---|---|---|---|
| D1 | Motor/agulha | 9 | 8 | **8** | Intacto; coerção do dial provada ao vivo (LLM fabricou 90000/80m/1246 → card saiu com os reais 92.902/51m/2.182,01) |
| D2 | Cards | 4 | 6 | **8** | Os 3 cards server-side agora nos DOIS caminhos (texto E clique), payloads íntegros, `toolCount=0` provado; sobras de cadência (dial 2×, re-emissão) |
| D3 | Funil/ordem | 5 | 4 | **5** | Fechamento não morre mais em valor errado; mas espiral de NEGAÇÃO de ofertas exibidas (3×), loop do lance-embutido por texto, dial pulado |
| D4 | Voz/cadência | 6 | 6 | **6** | Acentos ✓, copy por canal ✓; truncamento "Perfeito, Madal", educação semi-duplicada, pergunta dupla no mesmo turno |
| D5 | Compliance | 6 | 5 | **6** | O furo CDC do r3 FECHOU (carta na faixa +1,9%/+5,2%, aviso renderizável); resta troca de MARCA sem explicação (parcela +37-40%) e hero +25% sem aviso no reveal |
| D6 | Fecho WhatsApp | 9 | 9 | **8*** | Não exercitável hoje — Bevi homolog com `choose_offer` 3× timeout 15s (externo); código do fecho intocado na r4, evidência do 9 da r3 mantida por inspeção |

**FINAL = MIN = 5/10.**

---

## P0 N-A (âncora stale no fechamento) → **CORRIGIDO no núcleo** ✅ (com ressalva sistêmica NOVA)

Repro ao vivo (Fluxo B, conv `eafd8882`):
1. Reveal recomenda **ITAÚ 92.902 / R$ 2.182,01 / 51m**.
2. `choose_offer` (clique) ancora **RODOBENS 90.000 / 1.218,92 / 96m** → contract_form RODOBENS.
3. Usuário rejeita POR TEXTO ("96 meses é muito tempo… quero a ITAÚ de 92.902") → form re-emitido pra ITAÚ e o log prova o fix:
   `[ancora-fechamento] FIX-251: recommendedOffer re-ancorado pra ITAÚ (creditValue=92902) — snapshot anterior divergia da administradora anunciada no fechamento`
4. `contract-submit` → proposta com **rawCreditValue 92.902** e carta real **94.707 (+1,9%)** — nunca mais o 79% acima do r3. O aviso de ajuste renderiza (rawCreditValue ≠ creditValue, `real-offer.tsx:90-104`). Integration test `runner.ancora-fechamento.integration.test.ts` verde no container.

**Ressalva sistêmica (NOVA, P1 — não é o P0 antigo):** nos DOIS fluxos o fechamento trocou a
**administradora**: confirmou ITAÚ, veio **BANCO DO BRASIL grupo 1716** (B: 94.707/R$ 2.984,40/39m
vs 2.182,01/51m confirmada = parcela **+37%**; A: 157.845/R$ 4.974/39m vs 3.549,75/50m = **+40%**).
Causa: catálogo do fechamento (Trilho A parceiro) sem ITAÚ na faixa → clamp de 20% do
`pickClosestOffer` (design documentado: faixa > marca) cai pro global best — **sem uma palavra de
explicação na copy** ("Confirmei com a BANCO DO BRASIL." e só). Pior: questionado, o agente **nega
a proposta real registrada** ("não é o que está de fato registrado — não vou validar esse número"),
promete "refazer com a ITAÚ" → re-submit → **a MESMA proposta BB, mesmo proposalId** — o loop de
promessa impossível do r3 sobrevive em forma nova (agora com o valor certo, mas com a marca errada
e parcela 37-40% maior que a confirmada, sem aviso de parcela/marca).

## Status dos demais caminhos (evidência ao vivo)

| Caminho | Status | Evidência |
|---|---|---|
| **Scarcity no caminho TEXTO** (FIX-253) | **CORRIGIDO** ✅ | Fluxo A, avanço por texto: `scarcity` N=5 ∈[1,6] + `decision_prompt` no MESMO turno com `toolsCalled=[]`, `toolCount=0` (trace `806991a5`) — `present_decision_prompt` fora do toolset, decision 100% orchestrator |
| **embedded_bid no caminho TEXTO** (FIX-253) | **CORRIGIDO** ✅ | Fluxo A, gate lance respondido por texto ("junto uns 4 mil por mês") → card server-side (150.000 / embutido 45.000 / netCredit 105.000, disclaimer "o crédito recebido diminui" ✓) |
| **Rota nome→grupo exibido** (FIX-252) | **NÃO** ❌ | A rota só corrige a âncora PÓS-simulação; o modo de falha real acontece ANTES: LLM chama `simulate_quota` com groupId sentinela `__search_needed__` (guard rejeita e PROÍBE negar — o LLM **nega mesmo assim**) e re-busca com creditMin/creditMax **STRING** → `z.number()` falha silenciosa (tool-io `output: null`, `ai-sdk.ts:289-290`) → agente negou **3×** ofertas EXIBIDAS na própria comparison_table (BB e RODOBENS). Recovery REGREDIU vs r3 (lá resolvia grupo errado; agora não resolve nenhum) |
| **Dedup educação embutido** (FIX-254) | **PARCIAL** | Clique: chips 1×, educação completa 1× (sobrou frase-resumo + parágrafo redundantes). REGRESSÃO NOVA: responder o gate lance-embutido POR TEXTO não consome o gate → re-emite card + a MESMA educação + a mesma pergunta (loop até clicar) |
| **Copy de identidade por canal** (FIX-255) | **CORRIGIDO** ✅ | 2/2 conversas web: "Me manda seu CPF e celular, só os números." — sem a mentira do WhatsApp |
| **Acento nos nomes da Bevi** (FIX-255) | **CORRIGIDO** ✅ | ITAÚ / ÂNCORA / TRADIÇÃO acentuados em cards, tabela e fala ("Confirmei com a…" saiu certa); `normalizeAdministradoraName` + `normalizeAdmin` dobra acento (matching não quebrou) |
| **creditAdjustmentNotice coerente** (FIX-255) | **CORRIGIDO em código** (não exercitado ao vivo) | Diff + teste: mensagem agora diz a verdade ("esse grupo nao permite ajuste livre… a simulacao e do valor NOMINAL"); nenhum what-if com ajuste rodou ao vivo (a espiral de negação bloqueou) |
| **Copy "reserva" pré-contratação** (FIX-256) | **CORRIGIDO no fecho** ✅ (residuais) | 3× ao vivo "Pra garantir seu lugar nesse grupo… é só um pré-cadastro". Residuais: `directives.ts:237` ("confirmar sua reserva", clique 'Tenho interesse'), `route.ts:628/648` (guards), e o LLM soltou "garante sua reserva agora" em texto livre 1× |
| **Migration 0033** | **APLICADA** ✅ | Coluna `logo_url` existe no pg develop; zero `logo_url does not exist` nos logs |

## Regressões/achados novos da r4

| # | P | Achado | Evidência |
|---|---|---|---|
| R1 | **P1** | LLM chama `search_groups` com creditMin/creditMax **string** → schema `z.number()` estrito falha SILENCIOSO (output null, sem erro pro modelo) → espiral de negação de ofertas exibidas ("Rodobens eu não tenho dado real confirmado") — 2 conversas, 3 negações | tool-io `{"creditMin": "72000"…}`/`{"creditMax": "120000"…}` → `out=null`; `ai-sdk.ts:289-290` sem `z.coerce` |
| R2 | **P1** | Fechamento troca ADMINISTRADORA sem explicação (clamp por design + catálogo fechamento ≠ descoberta): confirmou ITAÚ → "Confirmei com a BANCO DO BRASIL", parcela +37-40%, prazo diferente; agente nega a proposta registrada e promete refazer com ITAÚ (impossível) → re-serve a MESMA proposta | Fluxos A e B; `pickClosestOffer` (`partner-offer-mapper.ts:139-151`); proposalIds `6a512408`/`6a512611` |
| R3 | P2 | Gate lance-embutido respondido por TEXTO não é consumido → loop card+educação idêntica | Fluxo A, trace `41264a54` (re-emissão) |
| R4 | P2 | "Quero ver sim!" (texto) no simulator-offer PULA o dial — o simulador nunca apareceu no Fluxo A; e o turno saiu truncado no meio do nome ("Perfeito, Madal") | Fluxo A; trace `806991a5` (nenhum contemplation_dial na conversa) |
| R5 | P2 | `contemplation_dial` DUPLICADO no mesmo turno (2 tool-calls, initialTargetMonth 12 e 6); nota positiva: payload fabricado (90000/80m/1246) coagido pros números reais 2× | Fluxo B, trace `eedda87f` |
| R6 | P3 | Reação do timeframe errada ("sem pressa funciona pra parcela leve" pra resposta "6 meses"); turno morto pós-reveal (precisou de cutucada); 1× `empty-turn-fallback` (54s) | Fluxos A |
| R7 | P3 | Hero do reveal 25% ACIMA do pedido (150.000 pra "por volta de 120 mil") sem `rawCreditValue` no payload do recommendation_card → aviso de faixa do reveal não renderiza | Fluxo A, payload do card |
| — | ext | Bevi homolog: `choose_offer_bevi_consorcio` 3× timeout 15s — fecho (D6) não exercitável hoje; copy de retry honesta, mas sem saída alternativa | logs bevi-http 17:0x |

## Confirmações (não regrediu)
- Guard de grupo não-exibido vivo (rejeitou `__search_needed__` 2×) — mas a INSTRUÇÃO do erro é ignorada pelo LLM (reasoning trap: o guard manda "PROIBIDO negar", o modelo nega).
- Artifact-guard/coerção do dial: números fabricados NUNCA chegaram ao usuário (2×) ✓.
- Zero "taxa de contemplação"; parcelas com centavos; valores monetários íntegros (splitter ✓); zero léxico banido; zero emoji fora de parcimônia ✓.
- FIX-244/FIX-12: contract-submit continua guardado por revealCompleted/contractFormDispatched ✓ (fluxo real passou pelos guards).
- Lead que diz tudo numa frase pulou os gates redundantes ✓; explicação de novato correta e com papel da plataforma ✓.

## TL;DR — nota e o que falta pro teto

**5/10, melhor rodada da série (3→4→4→5). O P0 do r3 está FECHADO no que tinha de venenoso**:
âncora stale nunca mais fecha valor 79% acima — provado ao vivo com o log do FIX-251, carta real
a +1,9% do alvo e aviso renderizável; e os 3 cards server-side agora existem nos DOIS caminhos
(texto e clique), com decision 100% orchestrator (`toolCount=0`). Copy por canal, acentos,
"pré-cadastro" e migration 0033 confirmados ao vivo.

O que segura a nota são **dois P1 novos/descobertos**:
1. **Espiral de negação** — inputs de tool com número-em-string falham silenciosos (`z.number()`
   sem coerce) e o guard anti-negação é ignorado → o agente nega 3× ofertas que o usuário está
   VENDO na tabela; what-if/comparação morrem. Fix: `z.coerce.number()` + erro BARULHENTO no
   tool-result + rota determinística ANTES da tool-call (mention→groupId injetado).
2. **Seam do fechamento troca a marca em silêncio** — clamp por design fecha BB quando ITAÚ não
   existe no catálogo do fechamento, com parcela +37-40% vs a confirmada, sem explicação; e o
   agente nega a proposta real + promete um "refazer" impossível (loop). Fix: quando
   `pickClosestOffer` troca de administradora, copy determinística explicando a troca ANTES do
   cartão + proibir a promessa de refazer com marca inexistente + `check_proposal_status` expor a
   administradora registrada.

Depois: consumir gates respondidos por texto (lance-embutido/simulator-offer — mata loop e dial
pulado), `rawCreditValue` no recommendation_card (hero +25% sem aviso), dial 1×/turno, varredura
final de "reserva" (`directives.ts:237`, `route.ts:628/648`) e o truncamento "Madal".
