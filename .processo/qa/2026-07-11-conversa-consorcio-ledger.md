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

## Doc atualizada
- `docs/jornada/jornada-canonica.md` — nova seção "Refino 2026-07-11" (consent removido, motivo
  em turno próprio, máx 1 pergunta).
- `docs/qa/roteiro-qa.md` — ordem de gates atualizada (FIX-274).
