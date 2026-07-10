# VEREDITO r6 — Verificador independente (Fable) · JUNÇÃO r1..r6 na DEVELOP · 2026-07-10

Método: condução adaptativa própria via `POST /api/chat` em `http://aja-develop.orb.local`
(develop `b7948f88` ⊇ `f7cabaa0`, container montando o working tree limpo, app Ready),
**1 conversa longa ao vivo (B-Mario)** cobrindo os 3 cenários do mandato + fecho completo,
leitura dos diffs FIX-262..265 no fonte, `tool-io`/`turn-trace`/logs novos do
`aja-app-develop`, meta e `bevi_proposals` inspecionados DIRETO no pg, testes r6
re-executados no container (44/44 ✓). **Nenhuma nota depende de self-report.**
1 proposta real criada na Bevi (`6a5148f4…` BANCO DO BRASIL) — e o guard impediu a 2ª.

## Nota final: **7/10** (mínimo das dimensões) — subiu de 5. A ESPIRAL MORREU. Ainda NÃO é matador pra prod (voz/recuperação seguram o teto)

| D | Dimensão | r3 | r4 | r5 | **r6** | Resumo |
|---|---|---|---|---|---|---|
| D1 | Motor/agulha | 8 | 8 | 7 | **8** | Núcleo intacto; snapshot what-if exploratório vetado em CÓDIGO (`[snapshot-whatif]`, integração ✓); dial/embedded ancorados na oferta confirmada AO VIVO; gap menor: menção por parcela/prazo não resolve (só creditValue) |
| D2 | Cards | 6 | 8 | 7 | **8** | Coerência payload×fio PROVADA ao vivo: pós-confirmação textual da ITAÚ, embedded_bid/dial/scarcity/decision/contract_form TODOS ITAÚ 92.902 (r5: tudo ÂNCORA stale); real_offer com rawCreditValue ✓; dial dup cross-turn morto ao vivo ✓; resta: topic_picker genérico por marca (não pelas 2 cotas ITAÚ) e texto picotado no turno da decisão |
| D3 | Funil/ordem | 4 | 5 | 5 | **8** | Funil completo até o fecho de novo ✓; contestações: 0–2 tool-calls/turno (r5: 34/593s); tool-error 2× ao vivo → fallback determinístico, NUNCA negação; cap nunca sequer aproximado (máx 6 = reveal legítimo); resta: turnos de contestação lentos (72–112s até o fallback) e recuperação enlatada |
| D4 | Voz/cadência | 6 | 6 | 5 | **7** | Acentos íntegros INCLUSIVE no fecho ("A ITAÚ não tem…", "Parabéns") ✓; copy WhatsApp honesta ✓; MAS educação do embutido 2× no MESMO turno persiste, "reserva" vivo no gate de lance, frases duplicadas no turno da decisão, fallback idêntico repetido 2× seguidas |
| D5 | Compliance | 5 | 6 | 5 | **9** | Aviso de troca nomeia a marca CERTA ao vivo (ITAÚ confirmada só por TEXTO) ✓; agente NUNCA negou a proposta registrada ✓; 2ª proposta de marca ≠ BLOQUEADA em código (0.25s, sem gateway) ✓; "vou te mandar" só porque ENFILEIROU (log `outbound_queued_pending_template` casa com a copy) ✓; guard do sentinela agora INSTRUTIVO ("PROIBIDO negar…") ✓ |
| D6 | Fecho WhatsApp/assinatura | 9 | 8* | 8 | **9** | Fecho completo de novo: real_offer → offer-confirm → signature_handoff (uselink real) + document_upload + Parabéns; copy do WhatsApp condicional certa pro estado real do envio |

**FINAL = MIN = 7/10.**

---

## Os 4 matadores do r5 — status com evidência ao vivo

### 1. FIX-262 — tool-error mudo + cap de tool-calls: **CORRIGIDO**

- **tool-error DISPAROU AO VIVO 2×** (contestações 2 e 3, conv `c645d1f6…`): o modelo chamou
  `search_groups` em closing (fora do toolset) → log estruturado
  `outcome:"tool_error"` com texto instrutivo ("Model tried to call unavailable tool
  'search_groups'. Available tools: …") em vez do `output:null` mudo do r5 → console
  `[tool-error-recovery] guard: … fallback determinístico assume o turno` → o usuário
  recebeu EXATAMENTE `buildToolErrorRecoveryFallback` ("as opções que já apareceram aqui
  pra você continuam valendo…") — **zero negação, zero contract_form reaberto**.
- **Loop morto**: turn-trace da sessão inteira — máx `toolCount:6` (o reveal legítimo);
  turnos de contestação com 0–2 calls (r5: 34 calls/593s no mesmo cenário). Cap duro
  (`TOOL_CALL_HARD_CAP=12` + AbortController) verificado no fonte + integração
  ("turno nunca ultrapassa o cap… mesmo com o modelo em loop") ✓ no container — não foi
  exercitado ao vivo porque nenhum turno chegou perto (o que é o próprio sucesso).
- Senão (não rebaixa o status): o turno com tool-error levou **112s e 72s** até o fallback
  (latência do modelo antes da tool-call; o abort corta o relay, não o tempo), e o
  `turn-trace` registra `finishReason:"ok"` em vez de `tool-error-recovered` (o log
  dedicado compensa).

### 2. FIX-263 — re-âncora textual + anti-refazer em código: **CORRIGIDO**

- **Re-âncora textual ao vivo 3×**: `[ancora-fechamento] FIX-263` pra ÂNCORA → CANOPUS →
  ITAÚ (groupIds exatos das cotas exibidas), inclusive no caso que quebrava o FIX-251
  (2 ITAÚ exibidas — desambiguada por "a de 92 mil" → `…379e`).
- **O seam real aconteceu e o aviso nomeou a marca CERTA**: confirmei ITAÚ só por TEXTO
  (3×), catálogo de fechamento sem ITAÚ → *"A **ITAÚ** não tem grupo disponível nessa
  faixa agora — a opção equivalente é a BANCO DO BRASIL, com parcela de R$ 2.984,40"*
  (r5: nomeava "ÂNCORA", errada). Todo o fio (dial/scarcity/decision/form) já era ITAÚ.
- **Anti-refazer em código provado**: com proposta BB registrada e meta ainda ITAÚ,
  disparei `contract-submit` direto → bloqueio determinístico em **0.25s**, sem chamada
  Bevi: *"Você já tem uma proposta registrada com a BANCO DO BRASIL — não dá pra abrir
  uma segunda com outra administradora por aqui. Quer que eu confira o status…"*.
  `bevi_proposals` da conversa: **1 linha só**. Nas 3 contestações o agente nunca negou
  a proposta registrada nem reabriu form de outra marca.
- Observação de produto (não defeito): a re-âncora dispara em menção meramente
  EXPLORATÓRIA ("me explica a ÂNCORA"), não só em confirmação — aqui foi benigno
  (coerência downstream), mas significa "fechar" fecha no último grupo discutido.

### 3. FIX-264 — resolveOfferByMention v2: **CORRIGIDO**

Reproduzi os 3 padrões que negavam no r5, na mesma conversa, com tabela rica
(2× RODOBENS 90k, ÂNCORA 90k, BB 90k, CANOPUS 110k, 2× ITAÚ):
1. Comparação de 2 marcas ("Compara a RODOBENS com a ITAÚ") → sem negação; ofereceu
   comparativo + topic_picker (23.7s, 2 calls). O sentinela `placeholder` caiu no guard
   INSTRUTIVO novo, e o modelo se recuperou.
2. Nome único + valor EMPATADO ("a ÂNCORA de 90 mil" com 3 outras cotas de 90k) →
   **resolveu** (get_group_details no groupId certo, números exatos: 90.000/117m/1.073,52).
3. Menção negada ("Deixa a Rodobens pra lá. Me fala da de 110 mil") → **resolveu**
   CANOPUS 110k (simulate_quota no groupId certo, re-âncora logada).
Cenário 3 do mandato: "quero a ITAÚ" (2 exibidas) → picker, sem negação; "a de 92 mil"
→ ITAÚ 92.902 exata. Gap menor: menção por PARCELA ("a da parcela de 1.213,85") não
resolve — o resolver só casa creditValue.

### 4. FIX-265 — menores: **CORRIGIDO no escopo declarado**

- Acento no fecho: `normalizeAdministradoraName` no `partnerOfferToRealOffer` (código +
  teste); ao vivo o aviso disse "ITAÚ" com acento e o fecho BB saiu íntegro ("Parabéns",
  "está", "conquista"). Não vi um real_offer ITAÚ ao vivo (catálogo trouxe BB), então a
  prova live do trilho específico ficou indireta.
- Copy WhatsApp condicional: **provado ao vivo** — envio ENFILEIRADO
  (`outbound_queued_pending_template` 2×) e a copy disse "assim que a janela abrir, eu
  te mando" (r5 mentia "acabei de te mandar").
- Dial dup cross-turn: **provado ao vivo** — clique "Quero ver!" + afirmativo seguinte
  ("quero seguir e fechar") NÃO re-emitiu o dial; avançou pra scarcity+decision.
- Snapshot what-if exploratório: guard em código (`isExploratoryWhatIf` + log
  `[snapshot-whatif]`) + teste de integração; não reproduzível deliberadamente ao vivo.

## Regressões novas? **Nenhuma observada.** Residuais que persistem (fora do escopo r6):
- "reserva" na copy do gate de lance ("Você teria uma reserva pra dar um lance…").
- Educação do lance embutido 2× no mesmo turno (definição repetida em sequência).
- Texto picotado no turno da decisão ("Então deixa eu confirmar com você:" 2×,
  "Boa, Mario!" 2× — frases costuradas sem espaçamento: "com você:Ah, e um detalhe").

## O que falta pro teto (10/10 matador pra prod)
1. **Recuperação do tool-error usar a menção antes do fallback**: o fallback enlatado
   pede "me diz o nome da administradora" logo depois de o usuário TER DITO o nome —
   e repete idêntico 2× seguidas. Rodar `resolveOfferByMention` no caminho de recuperação
   (e variar a copy na 2ª ocorrência) transformaria contenção em resolução.
2. **Latência dos turnos contidos**: 72–112s até o fallback (o abort corta o relay, não a
   espera). Detectar a 1ª tool-error e responder de imediato já cortaria pra ~5s.
3. **Resolver por parcela/prazo**: "a da parcela de 1.213,85" é única e não resolve;
   estender o match a monthlyPayment/termMonths mata a última classe de menção órfã.
4. Voz: educação do embutido 1×, varrer "reserva", espaçamento entre frases costuradas
   do turno de decisão; `finishReason` fiel no turn-trace dos turnos contidos.
5. Exercitar o cap (>12 calls) e um real_offer ITAÚ ao vivo em QA dirigido — os dois só
   têm prova por teste/código nesta rodada.

## TL;DR
**7/10** (r2 3 → r3 4 → r4 4→5 → r5 5 → **r6 7**). **A espiral/loop MORREU**: os 3
padrões de negação do r5 agora resolvem determinístico (groupIds exatos no tool-io), o
tool-error disparou 2× ao vivo e caiu no fallback que reafirma (nunca nega), máx 6
tool-calls num turno na sessão inteira (r5: 34/593s), o aviso de troca nomeou a marca
certa pra confirmação 100% textual, e a 2ª proposta de marca divergente foi BLOQUEADA em
código a 0.25s com 1 proposta só no banco. A troca de ângulo (contenção em código)
pagou: os 4 matadores estão CORRIGIDOS. O que segura o 7: recuperação enlatada e lenta
(72–112s, pede o nome que o usuário acabou de dar), menção por parcela não resolve, e a
voz ainda carrega os residuais ("reserva", educação 2×, texto picotado) — nada disso é
espiral, é acabamento.
