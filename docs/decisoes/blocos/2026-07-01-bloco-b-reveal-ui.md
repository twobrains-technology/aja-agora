# Decisões — bloco-b-reveal-ui (2026-07-01)

ADR local do bloco (frontend do refino da tela de recomendação). Segue o template
canônico `padrao-de-docs/templates/decisao.md`. Specs-âncora:
`docs/design/specs/2026-07-01-reveal-hero-seletor-cotas-design.md` + adendo B8
(CONTRATO nível 3 com bloco-a) + `2026-07-01-refino-tela-recomendacao-design.md`.

Onda paralela (bloco-a-reveal-dados = backend; este = só `.tsx` + provider). As
decisões abaixo foram tomadas contra as specs + a regra-mãe (nada fabricado em
runtime); as de UX não cobertas explicitamente foram resolvidas pela regra-mãe
(não fabricar → Lei 3), então seguidas sem travar (execução autônoma de onda,
conforme `_prompt.md`: "sem resposta em tempo razoável, siga a recomendada e
registre").

### 2026-07-01 — D1: estado client-side compartilhado do reveal via contexto por-mensagem

- **Contexto:** os três artefatos do reveal (`recommendation_card`,
  `comparison_table`, `contemplation_dial`) chegam como PARTS separadas de uma
  mensagem e são renderizados independentemente (`artifact-renderer`). Não há
  estado compartilhado. A Opção 1 exige um `selectedGroupId` comum (hero + seletor
  + dial rebindam à mesma cota).
- **Decisão:** novo contexto React `RevealSelectionProvider`/`useRevealSelection`
  (`src/components/chat/reveal-selection.tsx`), montado no `chat-message.tsx` ao
  redor dos artefatos de CADA mensagem. Extrai as cotas do reveal (hero define a
  recomendada + campos ricos; `comparison_table` define todas as cotas do seletor).
  Fora de um reveal (sem `recommendation_card` na mensagem — ex.: `comparison_table`
  isolado do "ver outras opções", ou testes de componente) o contexto é INERTE
  (`isReveal:false`) e cada componente cai no comportamento legado.
- **Alternativas descartadas:** (a) artefato composto único `reveal` — mudaria o
  contrato/emissão do backend (bloco-a) e a arquitetura de parts; (b) estado no
  `ChatProvider` global chaveado por messageId — o estado é por-turno, não global.
- **Consequências:** ✅ estado compartilhado sem mudar o shape das parts nem o
  backend; ✅ zero regressão dos cards fora do reveal (fallback inerte); ⚠️ tocou
  `chat-message.tsx` (fora do escopo_arquivos declarado, mas disjunto do bloco-a =
  backend → merge limpo).
- **Reversibilidade:** fácil (remover o provider do chat-message reverte ao legado).
- **Status:** aceita. **Evidência:** commit FIX-196 + `reveal-hero-seletor.fix-196.test.tsx`.

### 2026-07-01 — D2: cota alternativa selecionada NÃO afirma "Recomendação" nem exibe score

- **Contexto:** o CONTRATO (adendo B8) entrega por cota apenas 8 campos coagidos —
  **sem** `score`/`scoreBreakdown` (que só existem na cota recomendada, index 0).
  Ao promover uma alternativa ao hero, exibir o selo "Recomendação" + o breakdown
  "Por que esta recomendação?" seria mostrar um score que não é daquela cota.
- **Decisão:** quando a cota selecionada NÃO é a recomendada, o hero troca o selo
  para "Cota selecionada" (neutro) e **oculta** o breakdown de score. Não é escolha
  de UX aberta — é consequência direta da regra-mãe / Lei 3 (nunca apresentar sobre
  entidade não-ancorada; sem score ancorado → não fabricar um). A recomendada
  mantém selo "Recomendação" + score.
- **Alternativa descartada:** manter selo/score fixos da recomendada mesmo na
  alternativa (sugere que a alternativa é "a recomendação" e exibe score alheio —
  fabricação).
- **Status:** aceita. **Evidência:** teste "cota alternativa não afirma Recomendação
  nem exibe score" no FIX-196.

### 2026-07-01 — D3: CTA do reveal = "Seguir com <cota>" (choose_offer); legado mantém "Tenho interesse"

- **Contexto:** critério 3 da spec — "Seguir com <cota>" dispara ação ESTRUTURADA
  com o `groupId` real → contrato sem re-resolução (fim do P0). O hero legado tem
  "Tenho interesse" → `interest` (avanço no funil).
- **Decisão:** no reveal (contexto ativo) o CTA do hero vira "Seguir com
  <administradora selecionada>" e emite `{kind:"choose_offer", groupId, ofertaId?}`.
  Fora do reveal (card isolado / testes) mantém "Tenho interesse" → `interest`
  (preserva comportamento e testes existentes). Tocar um chip é só SELEÇÃO
  (client-side, sem turno); avançar é o "Seguir".
- **Status:** aceita (coberto pela spec). **Evidência:** testes de `choose_offer`
  (recomendada default + alternativa) no FIX-196.

### 2026-07-01 — D4: seletor lê `comparison_table.groups`; casa hero↔chip por id (fallback highlightBestIndex)

- **Contexto:** o hero (recomendada) e o `comparison_table` saem no MESMO turno com
  o mesmo `id` (quotaId opaco) — casável por igualdade (confirmado no runner). Mas
  a igualdade NÃO é garantida server-side (a LLM copia o id em ambas as tools).
- **Decisão:** as cotas do seletor = `comparison_table.groups`; a recomendada é
  casada por igualdade de `id`/`groupId`; se nenhuma casar, fallback para
  `highlightBestIndex ?? 0`. A recomendada herda ofertaId/quotaId/rawCreditValue do
  hero quando o group não os traz.
- **Status:** aceita. **Evidência:** `buildCotas` em `reveal-selection.tsx` + FIX-196.

### 2026-07-01 — D5: contemplação a partir de `availableSlots` coagido (>0), oculta senão; nunca %

- **Contexto:** §3.1 do refino + FIX-196 — o "36/mês" era fabricável; `taxaContemplacao`
  é fração, não contagem. O hero legado exibia `contempladosMes` OU
  `formatPercent(contemplationRate)`.
- **Decisão:** a contagem vem de `availableSlots` (coagido por bloco-a; fallback
  legado `contempladosMes`); exibe "N por mês" só quando `> 0`, senão **oculta a
  linha inteira**. Removido o ramo que exibia `contemplationRate` como %.
- **Status:** aceita. **Evidência:** testes "contemplação oculta quando
  availableSlots=0" / "visível quando >0" no FIX-196; `recommendation-card.docx-resumo`
  segue verde.

### 2026-07-01 — D6: FIX-197 estende o contrato com `rawCreditValue` (valorCarta bruto) — dependência de bloco-a

- **Contexto:** o aviso de ajuste de faixa (§3.6/§7.7) precisa de DOIS números: o
  valorCarta BRUTO (denominação da carta, ex. R$ 300k) e a faixa exibida
  (`creditValue` re-simulado, ex. ~R$ 131k). O CONTRATO do adendo B8 lista só
  `valorCarta` (mapeado à faixa exibida) — não há um campo separado para o bruto.
- **Decisão:** estender o payload com `rawCreditValue?` opcional (em
  `RecommendationCardPayload`, `GroupCardPayload`, `RealOfferPayload`), marcado
  `CONTRATO(bloco-a)`. O aviso aparece só quando `rawCreditValue` presente e ≠ da
  faixa exibida. **Extensão ALÉM do adendo B8** → bloco-a precisa coagir o
  valorCarta bruto nesse campo. Se ausente, o aviso fica DORMENTE (degradação
  graciosa; nenhuma regressão dos cards legados).
- **Risco honesto:** se bloco-a não preencher `rawCreditValue`, o FIX-197 não
  dispara em runtime (dorme). Registrado aqui e no resumo de entrega como
  dependência de contrato a alinhar no merge.
- **Status:** aceita (com dependência PENDENTE-bloco-a). **Evidência:** FIX-197 +
  `credit-adjustment-notice.fix-197.test.tsx`.

### 2026-07-01 — D7: dial rebinda no mesmo turno; em turno separado usa o payload coagido

- **Contexto:** o `contemplation_dial` é emitido em turno SEPARADO do reveal (não
  carrega id) e já é coagido server-side. A spec assume "hero + dial rebindam".
- **Decisão:** o dial consome o contexto de reveal quando presente na mesma
  mensagem (rebinda creditValue/termMonths/monthlyPayment à cota selecionada; params
  de lance só valem para a recomendada, alternativas caem na heurística do motor).
  Em turno separado (caso comum atual) usa o próprio payload coagido — robusto e sem
  regressão.
- **Status:** aceita. **Evidência:** rebind em `contemplation-dial.tsx`;
  `contemplation-dial.oferta-real` segue verde.

## PENDENTE (contrato / stakeholder)
- **bloco-a:** tratar a action `choose_offer` no route (avançar ao contrato com o
  `groupId`, sem re-resolução) + coagir server-side o payload do reveal
  (`groupId`/`ofertaId`/`quotaId`/`availableSlots`) e o **`rawCreditValue`** (D6).
- **FIX-96 (hero + 5 + "ver todas")** e **mudanças do dial ligadas a T2** seguem
  **PENDENTE-Bernardo** — fora deste bloco por decisão explícita do `_prompt.md`.
