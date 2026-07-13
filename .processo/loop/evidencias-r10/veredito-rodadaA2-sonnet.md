# Veredito — Rodada 10, Etapa A, Rodada A.2 (re-verificação, ambiente corrigido)

**Juiz:** Sonnet (contexto fresco) · 2026-07-13
**Base sob julgamento:** `integ/consorcio-r10` (onda 1+2+3 integradas)
**Evidência:** 4 dossiês v2 coletados por execução direta (não delegado), ambiente corrigido
(AI_MODEL propagado + LITELLM_API_KEY órfã removida). Turnos `contaminated:true` descartados;
todo o resto tratado como evidência válida, conforme instrução.

---

## 🔴 VEREDITO: **1/10 — MATADOR PRA PROD: NÃO**

Nota final = MÍNIMO das dimensões: **Negócio 3 · Funcional 1 · Cálculo 6 · UX 1 · UI/Compliance 1 ·
E2E/integração 3.**

### Achado epistêmico mais importante desta rodada (antes do P1-P10)

O ambiente foi corrigido com sucesso (0 turnos contaminados nos golden paths, confirmado por
inspeção direta do `contaminated` field em cada um dos 21+11+10+13 turnos). **Mas a correção do
ambiente NÃO resgatou o produto.** Ao contrário da expectativa implícita no briefing desta rodada,
a evidência limpa **reproduz — e em alguns pontos AGRAVA — os achados mais graves da rodada A.1
invalidada**, agora com prova confiável em vez de suspeita de artefato. A lição "HTTP 200 não
significa turno saudável" (que motivou a invalidação da A.1) se estende: **"turno não-contaminado
não significa funil correto"** — os testes `test:unit`/`test:integration` passam (mockam o LLM) mas
não capturam a quebra real do golden-path E2E. Isso é o MESMO padrão de risco que a campanha já
tinha registrado (r9: "os testes por-bloco não capturam isso porque testam unidades isoladas, não o
fluxo E2E completo").

**Confirmação cruzada e independente:** o coletor visual (Claude in Chrome, método diferente —
browser ao vivo, não driver determinístico) achou exatamente a mesma quebra (Ponto 2 "depois": hero
nunca aparece pós-consentimento, funil pula direto para uma referência de fechamento quebrada) — e
foi descartado por `NOTA-contaminacao-visual.md` com base no dossiê coletor-A **ORIGINAL** (não-v2,
hoje sabidamente medido contra o ambiente quebrado da A.1). Essa nota está **desatualizada** e
precisa ser corrigida: o achado visual está CORROBORADO pela evidência limpa v2, não contaminado.

---

## Tabela P1-P10 (supercrítico, evidência citada)

| P | Veredito | Evidência |
|---|---|---|
| **P1** | **FAIL** | Mario: `gate:identify` **nunca aparece** como artifact tagueado em nenhum dos 11 turnos (`mario-sem-lance-v2/dossie.json` turno 5: usuário submete CPF/celular via ação, artifact retornado é `gate:credit`, não `gate:identify`) — quebra a rastreabilidade estrutural do invariante "identify é o último gate antes do search". Madalena: ordem credit→identify→search está correta (turnos 4-7-8), mas o gate credit fica em loop verbatim 3x antes de aceitar o valor (ver P4/P10 abaixo) |
| **P2** | **PASS qualificado** | Copy referencia o bem ("Quanto custa esse Corolla que você quer?", madalena turno 6) — mas com defeito gramatical recorrente "esse **um** Corolla" (artigo indefinido + demonstrativo colidindo, viola o inviolável de português correto do projeto), turnos 4, 5, 6 |
| **P3** | **FAIL SEVERO** | Nenhum dos 4 dossiês v2 contém `gate:experience`, `gate:reco-consent`, `topic_picker`, `scarcity` ou `decision_prompt` em NENHUM turno (grep exaustivo confirmado sobre o conjunto completo de `artifactTypes` únicos dos 4 dossiês). Madalena: hero (`recommendation_card`) só aparece no turno **18** (esperado ~12), coincidindo com o que deveria ser o turno de scarcity/decision — e `whatsapp_optin`+`contract_form` já dispararam prematuramente no turno 12. Mario: `two_paths` **nunca aparece** (0/11 turnos) — viola diretamente o critério PASS #2 de P0-B |
| **P4** | **FAIL** | Balões com 2+ `?` em turnos não-contaminados: madalena turnos 6 ("Quanto custa esse Corolla que você quer?E quanto custa esse um Corolla hoje?"), 11 ("Tem interesse em dar um lance pra acelerar?Em quanto tempo você quer estar com o carro novo?"); mario turnos 7, 9; probe-p7 turno 5 |
| **P5** | **FAIL** (Madalena) / PASS (Mario) | Madalena: `whatsapp_optin` dispara no turno 12, junto de um `contract_form` que NÃO é o fecho real (o fecho de verdade só ocorre nos turnos 19-20 com um SEGUNDO `contract_form`+`real_offer`) — repete e CONFIRMA o achado #3 da A.1 invalidada, agora em ambiente limpo. Mario: optin coincide corretamente com o avanço ao fechamento (turno 9) |
| **P6** | **INCONCLUSIVO** (agravado) | Sonda dedicada sob Qwen não recoletada nesta rodada (como já esperado). Mas achado NOVO: `topic_picker` não aparece **nem no golden path Madalena sob Claude/PROD**, onde é esperado (turno 10) — sugere que o card pode não estar disparando em nenhum caminho, não só sob modelo fraco |
| **P7** | **FAIL** | 2 de 3 sondas de reancoragem falham em turnos NÃO-contaminados: turno 6 (usuário confuso no gate MOTIVO é reancorado no gate CREDIT — gate errado); turno 10 (usuário confuso no gate EXPERIENCE recebe só um resumo dos dados já dados, não re-apresenta a pergunta). Único ponto que passa: blindagem "por que essa e não outra?" (turno 12, responde com critério, correto) |
| **P8** | PASS (qualificado) | Não exercitado ao vivo nesta coleta; herda o aval de `test:integration` verde reportado pela sessão coletora (não re-verificado por mim nesta rodada) |
| **P9** | PASS (qualificado) | Decisão de admissão já registrada (Qwen reprovado, piso = Haiku 4.5); não re-rodado nesta coleta v2, reusa histórico onda 2/3 conforme já avisado |
| **P10** | **FAIL SEVERO** | Frases coladas sob Claude **NATIVO** (não só Qwen/OpenAI-compat) em dezenas de instâncias, nos 4 dossiês v2: "juros.E quanto custa", "faixa:Madalena", "objetivo.Posso te mostrar", "acelerar?Em quanto tempo", "direto.Uns R$", "escolher?Uns R$", "quer?E quanto". Repete e CONFIRMA o achado #1 da A.1 em ambiente limpo — refuta definitivamente a hipótese de que era só bug de gateway |
| **Gap §4** | **NÃO MEDIDO** | Nenhum dos 4 dossiês v2 registra `error`/`tool_error` em nenhum turno (campo `error` sempre `null`) — o gap não foi observado nem classificado (weak-only vs prod-afetado) nesta coleta sob Haiku. Item da matriz consolidada segue pendente |

---

## Dimensões (nota = MÍNIMO)

| Dimensão | Nota | Justificativa |
|---|---|---|
| Negócio | 3 | Ambos os fluxos fecham ponta-a-ponta tecnicamente (0 erro HTTP, `real_offer` real da Bevi, degradação honesta quando ITAÚ indisponível). Mas a nova coreografia de consentimento (o PRÓPRIO objetivo de negócio desta rodada) está ausente — WhatsApp opt-in prematuro é risco de compliance real (contato antes de decisão) |
| Funcional | 1 | O entregável central da rodada (S2: `gate:experience`→`topic_picker`→`gate:reco-consent`→hero server-forced) não se manifesta em NENHUM golden path. `gate:identify` não estruturado em Mario. `gate:credit` em loop repetido (3x Madalena, 4x Mario) |
| Cálculo | 6 | Sem evidência de quebra nesta coleta (guardrail netCredit, degradação Bevi, aritmética do lance parecem OK); `test:unit` reportado verde cobre a maior parte; não sondado a fundo neste dossiê especificamente |
| UX | 1 | P4 falha sistemicamente; usuário confuso reancorado no gate ERRADO em 2/3 sondas; a mesma pergunta de crédito se repete verbatim várias vezes seguidas sem reconhecer a resposta anterior |
| UI/Compliance | 1 | P10 falha sistêmica sob modelo de prod; opt-in prematuro; defeito de português recorrente ("esse um Corolla"); scarcity/decision_prompt nunca observados (não dá pra confirmar formato 1-6 sem %) |
| E2E/integração | 3 | Golden paths completam sem erro HTTP e as suítes são reportadas verdes — mas o dossiê é INCOMPLETO pela própria matriz da rodada (P6/P7-Qwen, P9-desta-rodada, gap §4, visual pontos 2-5 pendentes) e, mais grave, as suítes verdes **não capturam** os defeitos reais expostos pelo E2E golden-path (mesmo padrão de risco já registrado nesta campanha) |

**MÍNIMO = 1** (Funcional/UX/UI-Compliance empatados no piso).

---

## Itens → próxima onda (severidade + evidência)

1. **[P0 CRÍTICO]** Coreografia pós-reveal (S2 completo: `gate:experience`→`topic_picker`→
   `gate:reco-consent`→hero server-forced) não dispara em nenhum dos 2 fluxos golden-path.
   Confirmado por 2 métodos independentes: driver determinístico (`madalena-junta-v2/dossie.json`,
   turnos 8-18, zero contaminados) e coleta visual ao vivo (`RESUMO-coletor-visual.md`, Ponto 2
   "depois"). Hero aparece 6 turnos atrasado (18 em vez de ~12), coincidindo com o que deveria ser
   scarcity/decision_prompt (nenhum dos dois aparece nunca). Precisa de investigação de causa-raiz
   antes de qualquer fix pontual — provável que `S2`/onda 1 (`runner.ts:939-959`, `1043`) não esteja
   de fato integrada como o merge "limpo" sugeriu.
2. **[P0 CRÍTICO]** `whatsapp_optin` dispara prematuro em Madalena (turno 12, junto de um
   `contract_form` que não é o fecho real) — repete e CONFIRMA achado #3 da A.1 em evidência limpa.
   Viola P5 diretamente. `madalena-junta-v2/dossie.json` turno 12.
3. **[P0 CRÍTICO]** `two_paths` nunca aparece no fluxo Mario (0/11 turnos) — viola o critério PASS
   explícito de P0-B. `mario-sem-lance-v2/dossie.json`.
4. **[ALTA]** `topic_picker` nunca aparece em NENHUM dos 4 dossiês v2, incluindo o golden path
   Madalena onde é esperado (turno 10) — sugere o card pode não estar disparando em nenhum caminho,
   não só sob modelo fraco (o que a P6 original assumia). Precisa sonda também sob Haiku/PROD, não só
   Qwen.
5. **[ALTA]** `gate:identify` nunca aparece como artifact estruturado no fluxo Mario — repete e
   CONFIRMA achado prévio em ambiente limpo. `mario-sem-lance-v2/dossie.json` turno 5.
6. **[ALTA]** `gate:credit` entra em loop/repetição verbatim quando a resposta do usuário não é um
   valor numérico reconhecido — Madalena 3x (turnos 4-6), Mario 4x (turnos 5,7,8,9, inclusive DEPOIS
   de `contract_form`/`whatsapp_optin` já terem disparado no turno 9). Repete e CONFIRMA achado #5 da
   A.1 ("loop 8x") em ambiente limpo.
7. **[ALTA]** Frases coladas (P10) sistêmicas sob Claude NATIVO — dezenas de instâncias nos 4
   dossiês v2. Repete e CONFIRMA achado #1 da A.1 em ambiente limpo; refuta a hipótese de que era só
   gateway OpenAI-compat. Pista já registrada (`normalizeGluedSentences` só cobre maiúscula) não
   basta — muitos casos aqui SÃO maiúscula ("juros.E") e ainda assim não foram separados.
8. **[ALTA]** P4 falha sistematicamente — mesma causa-raiz do item 6/7 (texto de confirmação de
   crédito "Uns R$ X então, é isso? Pode ajustar se quiser." sendo concatenado a outras perguntas
   sem separação).
9. **[MÉDIA]** P7 falha em 2 de 3 sondas — usuário confuso reancorado no gate ERRADO (turno 6:
   confuso no motivo vai para credit; turno 10: confuso no experience recebe só um resumo, não
   re-apresenta a pergunta). `probe-p7-prod-v2/dossie.json` turnos 6 e 10 (ambos `contaminated:false`).
10. **[MÉDIA]** Defeito de português recorrente "esse um Corolla" (viola inviolável do projeto).
    `madalena-junta-v2` turnos 4-6.
11. **[BAIXA/PROCESSO]** `NOTA-contaminacao-visual.md` precisa ser corrigida — descarta o achado
    visual do Ponto 2 com base no dossiê coletor-A ORIGINAL (hoje sabidamente medido contra ambiente
    quebrado da A.1); o achado está na verdade CORROBORADO pela evidência limpa v2.
12. **[BAIXA]** Gap §4 (`tool_error` em `present_decision_prompt`) não foi medido nesta coleta v2
    sob Haiku — nenhum turno registra erro. Segue pendente de classificação (weak-only vs
    prod-afetado).

---

## Re-coleta pendente (não é fix, é medição)

- **P6** — sonda dedicada `probe-p6-topicpicker-hallucination` sob Qwen (não coletada) **e** uma
  checagem sob Haiku/PROD, dado que nem o golden path mostrou o card.
- **P9 desta rodada** — bakeoff pós-fixes da próxima onda (reusa histórico onda 2/3 por ora).
- **P7 leg Qwen** — não coletado.
- **Visual pontos 3, 4, 5 (completo)** — continuam bloqueados, mas agora se sabe que o bloqueio é o
  MESMO bug real do item 1 (coreografia pós-reveal quebrada), não falta de credencial ou
  contaminação — só serão alcançáveis depois do item 1 corrigido.
- **Gap §4** — medição do fechamento sob Haiku (e comparação com Qwen) para classificar weak-only
  vs prod-afetado.

---

## Nota final ao orquestrador

Este veredito é **mais rigoroso, não mais leniente**, que o 2/10 da rodada A.1 invalidada — apesar
da evidência agora ser confiável. Os achados mais graves da A.1 (coreografia pós-reveal ausente,
optin prematuro, gate:credit em loop, gate:identify ausente no Mario) **não eram artefato de
ambiente**: reproduzem-se identicamente em evidência limpa. A onda 1 (`r10-1-funil-reveal`,
fusão S1+S2+D1+D2) integrou sem conflito textual e passou nos testes automatizados, mas **o
comportamento E2E real da máquina de estados não corresponde ao que os testes verificam** — mesmo
padrão de risco já registrado nesta campanha (r9: testes por-bloco isolados não capturam quebra de
fluxo E2E). Recomendo tratar isto como P0 de investigação de causa-raiz (não whack-a-mole
item-a-item) antes de formar a próxima onda — muito provável que exista UMA causa comum (ex.: um
guard/condição na tool-policy ou no `nextGate()` que está suprimindo a cadeia inteira de
`experience`→`topic_picker`→`reco-consent` silenciosamente), dado que 6 artifact types distintos
(gate:experience, gate:reco-consent, topic_picker, scarcity, decision_prompt, two_paths) estão
100% ausentes de forma coordenada nos 4 dossiês.
