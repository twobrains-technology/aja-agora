# Ledger — QA do dono: conversa de consórcio (web) — 2026-07-11

Rodada disparada por `qa-dono-produto`. Escopo: garantir a conversa com o agente "perfeita",
fiel ao handoff `agente-vendas-consorcio` + mockup. Ambiente: `http://aja-develop.orb.local`
(container `aja-app-develop`, `next dev`, working tree montado — hot reload). Método:
achados do Kairo (prints) → correção com TDD → coletor Haiku (dossiê) + Fable (critérios) → juiz.

## Achados do dono (Kairo) — os 3 que dispararam a rodada

| # | Achado | Tipo | Correção | Regressão | Status |
|---|---|---|---|---|---|
| CK-1 | Duas perguntas no mesmo balão (motivo + "posso te fazer 3 perguntinhas?") | DEFEITO | FIX-274 (consent removido → sem colisão) + beat do motivo (turno próprio) + prompt endurecido (máx 1 pergunta) | `qualify-state.fix-274`, `system-prompt.fix-274-ordem-sem-consent` | ✅ CORRIGIDO (validado ao vivo: 1 pergunta no passo do carro) |
| CK-2 | Dúvida de consórcio ("Entender mais antes") cedo demais | DEFEITO | FIX-274 (botão removido; explicação só no `experience` pós-busca, D1) | idem | ✅ CORRIGIDO (validado ao vivo: sem "Entender mais antes") |
| CK-3 | Funil TRAVA (agente reage e não avança; loop de "vamos/bora") | DEFEITO bloqueante | FIX-273 (raiz do auto-consent, superado) + FIX-274 (consent fora = superfície some) + **FIX-275** (resíduo: motivo="cansei..." classificado `expressing_doubt` suprimia o `identify`) | `qualify-state.fix-275-motivo-nao-trava` (+ prova no log: `[gate-skip] gate=identify intent=expressing_doubt`) | ✅ CORRIGIDO — **validado ao vivo**: motivo → card de CPF DIRETO (sem "vamos"), com espelho do motivo ("quando o carro dá trabalho, atrapalha tudo") |

## Correções (código) — todas com TDD, `pnpm test:unit` = 3255 verde

- **FIX-274** — remoção completa do gate `consent` (13 pontos de produção: `nextGate`, cards
  web/WhatsApp, handlers `route.ts`/`interactive-handlers.ts`, directives, tipos) + beat do
  motivo (`shouldAskMotive`, não-bloqueante via `motivationAsked`). Jornada nova: `name →
  desire[carro] → desire[motivo] → identify → credit → search → experience → …`.
- **FIX-275** — pós-beat, o `identify` dispara mesmo com intent `expressing_doubt`/`off_topic`
  (o motivo é queixa, mas é a resposta esperada); só `asking_question` explícito segura.
- **DV-5 (prompt)** — `system-prompt.ts` alinhado: "máx 1 pergunta por mensagem" (era "não mais
  de 2") + ordem de coleta sem consent (era experience→consent→…).

## Achados adicionais do Fable (critérios de aceite: `scratchpad/criterios-aceite-conversa.md`)

40 critérios (CA-1..CA-40). Divergências código × handoff a decidir (NÃO corrigidas — decisão do Kairo):

| Ref | Achado | Classificação |
|---|---|---|
| DV-4 | **Escassez é PLACEBO** (`scarcity-payload.ts`: N 1–6 por hash do groupId), mas o card diz "restam apenas N" | ⚠️ TENSÃO — decisão do Kairo (ADR 2026-07-09) × risco de confiança/compliance. Re-selar antes de prod? |
| DV-8 | Terminologia reservar/contratar inconsistente ("quero reservar agora" × FIX-256 baniu "reserva" pré-contratação) | 🔴 a verificar (possível compliance) |
| DV-1 | Badges de dúvida ("o que é lance?") do handoff não existem | MELHORIA / ONDA 2 |
| DV-2/DV-3 | Ordem scarcity→proposta→decisão × código; "recomendação" não é beat separado; prova social "indicaria pra minha família" ausente | MELHORIA / decisão |
| DV-6 | Mockup pede valor ANTES do CPF; código = identify antes (FIX-53) | NÃO-BUG (decisão vigente) |

Dúvidas abertas: verbalização do guardrail D6; `referenceMonth` da curva (heurística, não Bevi
confirmado — juiz não crava "número certo"); decision_prompt fica ou sai; placebo da escassez.

## Rodada 2 — QA completo até a proposta (2026-07-11, conta CONTA1)

Coletor Haiku, conta de teste real (CONTA1, homolog). Conversa `f6c5aec0`. Jornada COMPLETA
ponta-a-ponta, **sem travar, sem erro**:
`name → desire[motivo] → identify → credit → search/reveal (recommendation_card + comparison_table
+ simulation_result, busca real Bevi ~60s) → [avanço direto "Seguir com ITAÚ"] → contract_form →
real_offer → signature_handoff + document_upload → fecho`.

- ✅ FIX-274/275 RECONFIRMADOS (log: `[gate-skip] gate=identify` no motivo → `gate=identify` dispara).
- ✅ Reveal com dados REAIS: ITAÚ carta R$ 150.000, parcela R$ 3.549,75, 50 meses, 6 contemplados/mês,
  lance médio R$ 102.135. Aviso de ajuste presente ("Ajustamos essa carta de R$ 120.000 pra sua
  faixa de ~R$ 150.000") — CDC art. 30.
- ✅ Compliance: "Não é compromisso de contratação"; selo "0% de juros"; "Ver minha proposta" (PDF,
  não "assinatura" — DES-1); fecho sem "reservado/garantido"; disclaimer de estimativa no cenário
  com lance.
- ✅ Proposta co-branded + 4 chips (Sem juros / Fiscalizado BACEN / LGPD / Acompanhamento).
- ✅ Fecho: "Parabéns!" + pedido de "oi" no WhatsApp + especialista de cadastros. Variante honesta
  dev ("assim que a janela abrir, eu te mando" — FIX-265, sem template aprovado). Zero emoji.

**NÃO validado nesta rodada (o avanço direto "Seguir" pulou o caminho consultivo):** gates
`experience`/`timeframe`/`lance`, card `embedded_bid`, `two_paths`, agulha `contemplation_dial` e a
**suavização da escassez (DV-4)**. Precisam de uma rodada que explore o caminho consultivo (não
clicar "Seguir" no reveal).

**Achado — recomendação favorece carta MAIOR que o pedido (raiz confirmada, PRÉ-EXISTENTE):**
recomendou ITAÚ R$ 150.000 (parcela R$ 3.549) sobre BB R$ 120.000 exato (parcela R$ 2.161), acima
do pedido de 120k. Raiz: `recommend_groups` exige `budget` mensal (`ai-sdk.ts:295`) que o usuário
NUNCA informa → o LLM **inventa** o budget; `monthlyFitScore` (peso 0.4, o maior) premia parcela em
70-100% do budget (`recommendation.ts:20-33`) → budget inventado alto puxa a carta de parcela
maior. É o achado conhecido do "budget inventado" (rodada 2026-07-01, risco CDC —
[[project_aja_tela_recomendacao_dados_reais]]) se manifestando como recomendação acima do pedido.
**Não corrigido** (decisão de produto/algoritmo, fora do escopo desta rodada). Candidato a card/bloco
próprio: obter o budget do usuário (ou derivar do valor do bem) em vez de inventar.

## Rodada 3 — consultiva (validar escassez/agulha ao vivo): BLOQUEADA por pilotagem

Coletor Haiku, conversa `8084188f` (onix). Objetivo: explorar o caminho consultivo (sem clicar
"Seguir") pra validar `experience`/`embedded_bid`/agulha/**escassez suavizada (DV-4)** ao vivo.
**Travou no form de CPF** — o Haiku não conseguiu submeter (`form_input` em form React não gruda
o valor no estado). **Confirmado no log que é PILOTAGEM, não bug:** a conversa parou em
`gate=identify` e NUNCA disparou `search_groups`; a rodada 2 (creta) submeteu o MESMO form e
funcionou (search → reveal → contrato). Régua: ação que não chegou ao backend = pilotagem.

**Consequência:** ⚠️ **escassez suavizada (DV-4) e agulha = TELA-NÃO-VALIDADA ao vivo** nesta
rodada. DV-4 fica coberta por unit (`scarcity.test.tsx`: mostra "Um dos grupos mais procurados",
sem "restam apenas N") — aceito para um componente de apresentação simples. Limitação do coletor
Haiku pilotando form React; re-validar quando houver coletor com pilotagem de form confiável.

## Doc atualizada
- `docs/jornada/jornada-canonica.md` — nova seção "Refino 2026-07-11" (consent removido, motivo
  em turno próprio, máx 1 pergunta).
- `docs/qa/roteiro-qa.md` — ordem de gates atualizada (FIX-274).
