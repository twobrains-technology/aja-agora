# Jornada Canônica — Aja Agora

> **REGRA, não referência.** Fonte: `jornada.docx` do cliente + refino do Kairo (2026-06-30).
> Toda divergência entre código e este fluxo é **defeito do código**, não interpretação.
> Contexto/decisões: [`CONTEXT.md`](./CONTEXT.md). Original: [`jornada.docx`](./jornada.docx).
> **Lema:** *"Seu objetivo primeiro. O melhor consórcio depois."*
>
> **📍 Enriquecido pela auditoria código×jornada de 2026-07-01** (evidência `file:line` no
> [Mapa de divergências](#mapa-de-divergências--auditoria-2026-07-01) no fim). A auditoria
> confirmou 24 divergências, refutou 5 falsos-positivos e abriu 2 **tensões** (ver seção
> [Tensões abertas](#tensões-abertas--não-é-fix-cego)). ⚠️ **Ressalva ao dogma "divergência =
> defeito do código":** vale para bug de implementação; NÃO vale para P1 e P5, onde a jornada
> conflita com uma decisão técnica/ADR e a correção é **recalibrar com o stakeholder**, não
> mudar o código no escuro.

## Como ler (Fase de cada cenário)

| Marca | Significado | O QA autônomo faz |
|---|---|---|
| 🟢 **vivo** | comportamento canônico que DEVE funcionar hoje | **testa** — falha se quebrar |
| ⚪ **futuro** | planejado, ainda não é MVP | **não testa** (pendente, não falha) |
| 🔴 **diverge** | o código faz DIFERENTE do canônico hoje — **precisa editar** | testa como regressão **após** o fix; é a lista de edições da próxima sessão |
| ⚠️ **tensão** | a jornada contradiz uma ADR/decisão técnica — **recalibrar com o stakeholder**, não "corrigir o código" cego | não testa como bug; é decisão de produto |

**Paridade Web ↔ WhatsApp (regra-mãe):** a jornada é **a mesma** nos dois canais — mesmos
passos, mesma ordem, mesmas regras. Só muda a **dinâmica de interface**: a web tem componentes
interativos (agulha arrastável, botões, cards); o WhatsApp usa **botões nativos + conversa +
marcos textuais** (ex.: a agulha vira "3 / 6 / 12 meses" por texto). Nenhum passo existe num
canal e não no outro. **⚠️ A auditoria achou 6 quebras de paridade silenciosas** (fix aplicado
só num canal): D5, D11, D13, D18, D19, D22 no mapa.

---

## Regras de plataforma (cross-cutting — valem em toda a jornada)

| # | Regra | Estado |
|---|---|---|
| P1 | **Trilho A é o PRIMÁRIO** (API de Parceiro Bevi/UXVision). **Trilho B (self-contract) é FALLBACK.** | ⚠️ **TENSÃO (T1)** — a descoberta roda 100% no B (`adapters/index.ts:26-33`) e uma **ADR** (`2026-06-28`) decide EXPLICITAMENTE o oposto (B descobre, A fecha), porque o A é pobre (8 campos) e está **travado ao vivo** (400 productId/AGX). Não "inverter" cego → recalibrar. Ver D1. |
| P2 | **Tradução de contrato A↔B:** A fala **PT** (`objetivo`, `tipoSimulacao`, `lanceEmbutido`); B fala **EN** (`objective`, `simulationType`, `embeddedPercentage`). O fallback precisa **traduzir params + shape** (A ~10 × B ~68 campos). | 🔴 a divergência de dialeto é real (`self-contract-client.ts:76-84` EN × `proposal-gateway.ts:16-22` PT), mas a camada de tradução **não existe** porque não há fallback (depende de T1). Ponto de partida: `discovery-session.ts:15-23` (`prefsFromMeta`, só params). Ver D2. |
| P3 | **Sweep de busca:** **2 objetivos (`contemplacao_rapida` + `investimento`) × com/sem lance embutido** (~4 buscas) → une+dedup → IA recomenda pelo objetivo real. | 🔴 o sweep atual varre **faixa de VALOR** (`bevi-self-contract-adapter.ts:83-97,280-340`, spread `[0.7,1,1.3]`), objetivo/embutido **únicos** (`discovery-session.ts:21`), e é **opt-in** (default off, `ai-sdk.ts:291-302`). `recommend_groups` nem usa o sweep. Ver D3. |
| P4 | **Componente de valor = só a AGULHA do valor do bem.** | ✅ **RESOLVIDO no web (FIX-115)**: o gate credit emite `kind:'slider'` → a agulha simples (`value-picker.tsx`); `plan-estimate-picker` virou compat de msgs antigas. 🔴 **falta o WhatsApp** (ainda manda faixas em lista, D5). Ver D4/D6. |
| P5 | **Lance embutido DERRUBA a parcela pós-contemplação** (amortiza o saldo). Sempre mostrar **parcela atual + parcela pós**. | ⚠️ **TENSÃO (T2)** — `contemplation-dial.ts:116` usa só `− ownCashValue` (não inclui `embeddedBidValue`), travado por 3 testes + `CONTEXT` D18/C4 + `system-prompt.ts:222`, que decidem o OPOSTO ("embutido reduz crédito, não dívida"). Contradição jornada×CONTEXT não resolvida → aval do stakeholder. Ver D9. |
| P6 | **Identidade (CPF+telefone) coletada ANTES da busca.** Sem identidade não há descoberta real. | ✅ **RESOLVIDO (FIX-114)**: `tool-policy.ts:30` só expõe `search_groups`/discovery se `identityCollected===true`. Recuperação defensiva do erro é hardening opcional (D8). Ver D7. |
| P7 | **PROIBIDO dado mockado em runtime** — toda oferta/número vem da Bevi (A ou B). | 🟢 confirmado (mock deletado; sem caminho de runtime servindo fictício). |

---

## PARTE 1 — Chat / Agente (self-service, web e WhatsApp)

### Passo 1 · Entender a necessidade
**Narrativa:** o usuário chega, diz o que quer conquistar e como se chama. O agente ecoa o objetivo.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Pergunta o bem: **Imóvel / Carro / Moto** por botão | botões | botões nativos | 🟢 |
| Pergunta o **nome** ("Como posso te chamar?") e captura em 1 turno | texto | texto | 🟢 |
| Ecoa o objetivo ("…um [carro/imóvel] de cerca de X") | texto | texto | 🟢 |
| **Só 3 categorias** (moto substitui "serviços") — mesma decisão da landing | 3 chips | 3 botões | 🔴 **web tem 4** (`web/adapter.ts:177` expõe "Outros"/serviços) × WhatsApp 3 (`formatter.ts:806`) × landing 3 (`hero.tsx:19`). Ver D21. |

### Passo 2 · Entender o cliente
**Narrativa:** descobre experiência prévia, educa se preciso, coleta o **valor do bem** (só o valor) e a intenção de lance.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| "Já participou de consórcio?" (first/returning/doubts) | botão | botão | 🟢 |
| Se não/tem dúvida → **educação** (sem juros, taxa de adm, sorteio/lance) + "pode continuar" | texto+botão | texto+botão | 🟢 |
| **Valor do bem** — **só o valor**, sem prazo, sem parcela, sem intents | **agulha simples** | conversa ("uns 80 mil") | 🔴 (P4) — web usa `plan-estimate-picker` (valor+prazo+intenção+lance, `web/adapter.ts:87`); WhatsApp usa **lista de faixas** (`formatter.ts:494`), não conversa. Ver D4/D5. |
| **NÃO** aparece o componente multi-slider | — | — | 🔴 deletar `plan-estimate-picker.tsx` (não o `value-picker`). Ver D6. |
| Prazo de contemplação **não** é perguntado na entrada (FIX-103) | — | — | 🟢 **o GATE `timeframe` foi removido** (provado por `qualify-state.fix-103.test.ts`). ⚠️ O prazo ainda vaza pelo `plan-estimate-picker` (slider `targetMonth`), mas isso É o 🔴 P4 acima — a linha do gate está correta. |
| Lance: "Pretende dar um lance?" **Sim/Não/Talvez** | botão | botão | 🟢 |
| **Educação de lance embutido** pra QUALQUER resposta (Sim/Não/Talvez) | texto | texto | 🟢 web (`route.ts:917`) / 🔴 **WhatsApp pula** pra no/maybe (`interactive-handlers.ts:357`). FIX-92 corrigiu só web. Ver D19. |

### Passo 3 · Identidade (gate antes da busca)
**Narrativa:** pra buscar de verdade na Bevi, precisa de **CPF + telefone**. Coletado aqui, antes da descoberta.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Coleta **CPF + telefone** antes de qualquer `search_groups` | card de identidade | conversa (telefone = o WhatsApp; pede CPF) | 🟢 estrutura / 🔴 ordem (P6) |
| Nunca dispara a busca sem identidade (sem "dificuldade técnica") | — | — | 🔴 (P6) — furo estrutural em `tool-policy.ts:129-135` (LLM free-run) + falta handler de recuperação do `IdentityNotCollectedError` (`ai-sdk.ts:967-983` re-lança sem recuperar). Coberto por FIX-114. Ver D7/D8. |

### Passo 4 · Buscar alternativas
**Narrativa:** com identidade + valor + lance, o sistema faz o **sweep** e traz o máximo de cartas.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Busca via **Trilho A**; se A cair, **fallback Trilho B** (traduzido) | igual | igual | ⚠️ T1 / 🔴 P2 (ver regras) |
| **Sweep**: 2 objetivos × com/sem embutido → une+dedup → **vários registros** | igual | igual | 🔴 (P3) — hoje sweep por valor. Ver D3. |
| Retorna **≥ 1 carta real** (nunca mock); se faixa vazia, busca a mais próxima | igual | igual | 🟢 (parte) — a busca da mais próxima é **via prompt** (`system-prompt.ts:26,486`), não determinística. É hardening, não bug (auditoria refutou como divergência). |
| Agente **não narra o mecanismo** ("deixa eu buscar / usar a ferramenta") | 1 frase natural | 1 frase | 🔴 (meta-narrativa) — só prompt+regressão, **sem filtro runtime** (`assistant-tools.validate_against_rules` é do admin, não do agente). Um leak esporádico é possível. Ver D23. |

### Passo 5 · Avaliar, simular e definir
**Narrativa:** mostra a **recomendada primeiro** + outras 2; o simulador de contemplação deixa o
usuário ver a parcela em 3/6/12 meses; **com lance embutido, mostra a parcela CAINDO
pós-contemplação** — o diferencial da nossa inteligência.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Card **"Plano recomendado"** em destaque + **"Outras opções"** (2, carrossel) | cards | card + "ver outras" | 🟢 |
| Resumo por oferta: carta · parcela · prazo · administradora · lance/embutido · liquidez | card | texto | 🟢 |
| **Simulador de contemplação** (3/6/12 meses): recalcula ao vivo | **agulha arrastável** | marcos por conversa (loop what-if) | 🟢 |
| **Lance embutido → parcela PÓS-contemplação CAI** — mostra **parcela atual + parcela pós** | card | texto | ⚠️ **T2** — `contemplation-dial.ts:116` só o dinheiro (`ownCashValue`) abate; o embutido não amortiza. **CONTRADIZ** `CONTEXT` D18/C4. Ex. BB: código mostra R$ 9.828,92 onde a jornada quer ~R$ 5.238. Ver D9. |
| Ressalva discreta de "estimativa" (CDC art. 30/37) | texto | texto | 🟢 |
| **Card de decisão**: "Contratar agora" · "Ver outras opções" · "Falar com especialista" | botões | botões | 🟢 |
| "Tenho interesse" pós-reveal = **avanço direto** ao contract (sem card de decisão extra, FIX-38) | 🟢 (`route.ts:485`) | 🔴 **WhatsApp intercala** card de decisão no 1º interesse (`interactive-handlers.ts:580`) | Ver D18. |
| "Ver outras opções" = comparativo **determinístico** das ofertas reais | 🟢 (`buildOtherOptions`, `route.ts:521`) | 🔴 **WhatsApp** `decision_outras` sem handler → texto livre (`interactive-handlers.ts:99-124`) | Ver D22. |

> **Cálculo pós-contemplação (P5, modelo da jornada — EM TENSÃO):** no mês-alvo `N`, o lance
> **total (embutido + dinheiro)** amortizaria o saldo → `saldoApós = parcela × mesesRestantes −
> lanceTotal`; `parcelaPós = saldoApós / mesesRestantes`. **⚠️ O `CONTEXT` D18/C4 decide o
> oposto** ("embutido reduz o crédito líquido, não a dívida") e o código segue o CONTEXT. Qual
> modelo é financeiramente correto é **decisão do stakeholder** (T2) — não corrigir cego.

### Passo 6 · Contratar
**Narrativa:** coleta dados + documentos, salva do nosso lado e aciona a Bevi pro fluxo de documentos e finalização da proposta.

| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| Confirma a oferta escolhida (oferta REAL, re-simula se TTL venceu) | card | texto | 🟢 |
| Coleta/upload de **documentos** → **salva do nosso lado** | upload no chat | upload/redirect | 🔴 hoje é **pass-through pra CONEXIA** (`conexia-docs-client.ts`), sem persistência nossa. Coberto por bloco-a. No WhatsApp o upload inbound está **quebrado** (webhook ignora imagem, `route.ts:124-125`). Ver D12/D13. |
| Envia à Bevi **Trilho A**: fluxo de documentos + finalização + **PDF da proposta** | — | — | 🔴 **Trilho A travado** ao vivo (400 productId/AGX, `bevi-api-adapter.ts:143-152`) → nenhum fechamento completa. Contornado pelo bloco-c (fechar via Trilho B). Ver D10. |
| ⚠️ Assinatura self-service **NÃO** aqui (DES-1) — proposta pronta; assinatura é da mesa | — | — | ⚪ web cumpre (`signature-handoff.tsx`) / 🔴 **WhatsApp ainda promete "assinatura"** (`formatter.ts:1106`, `contract-summary.ts:46`). Ver D11. |

### Passo 7 · Confirmação + handoff pro WhatsApp oficial
| Cenário de aceitação | Web | WhatsApp | Fase |
|---|---|---|---|
| "Parabéns! Mais perto da sua conquista" | texto | texto | 🟢 |
| Resumo da contratação por **WhatsApp/e-mail** | — | — | 🟢 (WhatsApp only, D5 do CONTEXT) |
| Opt-in de continuidade pós-reveal | opt-in | opt-in | 🟢 (opt-in existe) — auditoria **confirmou OK**; o "número oficial / adiciona nosso número" é sabor descritivo, o verde escopa ao opt-in que existe. |

---

## PARTE 2 — Mesa de operação (back-office, pós-contratação)

**Narrativa:** o cliente contratou; a partir daqui a **mesa** assume. O lead anda no Kanban; ao
chegar na fase de atendimento, o caso é **oferecido a todos os atendentes** e quem **clicar "vou
atender" assume**; o atendente entra manualmente na administradora **guiado pelo copiloto**.

### Kanban (raias)
`novo → engajado → qualificado → em_negociacao → proposta_enviada → na_administradora → em_atendimento → aguardando_pagamento → fechado_ganho / perdido` — 🟢 implementado (`lib/admin/lead-stages.ts:8-18`). A raia `em_atendimento` (FIX-126) existe no enum, tem label/cor no Kanban (`kanban-column.tsx`) e é alcançada de verdade via claim — validado por E2E de tela em 2026-07-01 (ver Cobertura QA).

### Transbordo auto-broadcast + claim (FECHADO — FIX-123..126, D14-D17)
| Cenário de aceitação | Fase |
|---|---|
| Ao o lead **entrar na fase**, o sistema **transborda automaticamente** (sem clique) | 🟢 worker FIX-44 dispara o transbordo automático em `na_administradora` (integration + isolamento de falha, FIX-170). Botão manual (`transbordo/route.ts`) continua disponível como caminho alternativo (idempotente). |
| O caso é **enviado a TODOS os atendentes** (broadcast) com botão **"Vou atender"** | 🟢 `broadcastCaseToAttendants` (`outbound.ts`) manda `sendReplyButtons` a todos os atendentes de mesa ativos — validado por E2E de tela (2 sessões reais, 2026-07-01). |
| O **primeiro que clica "Vou atender" ASSUME** (claim/lock); os demais "já foi assumido" | 🟢 `mesa_attendant_id` nullable + claim atômico (`UPDATE ... WHERE mesa_attendant_id IS NULL`) em `claimMesaHandoff`. Depth gate: 200 claims concorrentes (8×25) sempre 1 vencedor. E2E de tela (corrida real, 2 browser contexts) confirma visualmente vencedor×perdedor sem erro. |
| Ao assumir, o lead **muda de fase** | 🟢 `claimMesaHandoff` move `na_administradora → em_atendimento` (forward-only, `lead_events`). |
| Dados sensíveis (CPF, documentos) **não** trafegam no WhatsApp — ficam no painel | 🟢 confirmado por E2E de tela 2026-07-01: painel controlado (`ContactDetailPanel`) mostra o CPF **mascarado** (`***.***.NNN-NN`); dossiê/copiloto da mesa nunca mostram o CPF (cru ou mascarado). |

### Copiloto da mesa (guia o atendente)
| Cenário de aceitação | Fase |
|---|---|
| Mensagem do atendente (WhatsApp) cai no **mesa-copilot**, nunca no agente de vendas | 🟢 |
| O copiloto carrega o **PDF/manual da administradora** (do cadastro) como fonte da verdade | 🟢 |
| Responde "como faço X na tela da administradora?" com **passo a passo** | 🟢 |
| Não expõe mecanismo/erro técnico; não fala com o cliente final | 🟢 |

> **Cobertura QA — Frente 3 (mesa de operação), 2026-07-01** (`.qa-loop/2026-07-01-0236-ledger.md`).
> A onda `divergencias-jornada` (FIX-123..126) fechou D14-D17 — todos validados ✅ no nível certo:
> - **D14 (transbordo automático):** ✅ integration (worker `na_administradora` → cria handoff sem dono) + idempotência + não-gatilho + **isolamento de falha behavioral** (FIX-170, mutation-verified).
> - **D15 (broadcast a todos + "Vou atender"):** ✅ structural + integration (`sendReplyButtons` a todos ativos, id `mesa_claim:<handoffId>`).
> - **D16 (claim atômico, 1º assume):** ✅ integration de corrida + **depth gate stress 8 atendentes × 25 rodadas = 200 claims → sempre 1 vencedor**.
> - **D17 (claim move a raia `na_administradora → em_atendimento`):** ✅ integration (forward-only + lead_events).
> - **Copiloto só ao dono / não vaza:** ✅ integration + cassette FIX-124. **PII (CPF) não trafega:** ✅ (dossiê whitelist).
> - **Golden path E2E (kanban → broadcast → handoff sem dono no DB):** ✅ browser (FIX-171 — spec reescrita do single-select removido; rodada verde no container).

---

## Tensões abertas — NÃO é fix cego

> A auditoria de 2026-07-01 achou 2 casos onde a jornada contradiz uma decisão técnica/ADR
> vigente. Aqui a regra "divergência = defeito do código" **não se aplica** — é decisão de
> produto/stakeholder. **PENDENTE-KAIRO/Bernardo** antes de qualquer implementação.

- **T1 — Trilho A primário na descoberta (P1).** A jornada pede A primário + B fallback. A **ADR
  `docs/decisoes/blocos/2026-06-28-trilho-b-descoberta-trilho-a-fechamento.md`** decide o oposto (B
  descobre porque tem os ~68 campos ricos; A fecha), e o **Trilho A está travado ao vivo** (400
  "Proposta não pertence ao Bevi Consórcio", productId/AGX desvinculado — PENDENTE-KAIRO). Provável
  **desvio de entendimento do stakeholder**: registrar nos "Desvios" do `CONTEXT.md` e recalibrar.
  Inverter cego = quebrar a descoberta rica por um trilho pobre e bloqueado.
- **T2 — Lance embutido amortiza dívida OU reduz crédito? (P5).** A jornada (linhas do Passo 5)
  pede que o embutido **amortize o saldo** (parcela pós cai). O `CONTEXT` D18/C4 + o código
  (`contemplation-dial.ts`) + `system-prompt.ts:222` dizem o oposto: o embutido **reduz o crédito
  líquido, não a dívida**. É uma questão de **modelagem financeira do produto** — só o stakeholder
  (Bernardo) decide qual está certo. Enquanto aberto, os dois docs se contradizem; qualquer sessão
  que "corrigir" um lado reabre o outro.
- **(Hipótese não confirmada)** O 2º root-cause do FIX-114 ("`identityCollected=true` mas
  `getIdentity=null`") **não é reproduzível por código** (`conversation/identity.ts:113-126` é
  atômico). O furo confirmado do P6 é o LLM free-run (D7). Não cravar o 2º como fato.

---

## Lista consolidada de EDIÇÕES (o que diverge do código — para a próxima sessão)

> Priorizada por severidade. `file:line` e detalhe no [Mapa de divergências](#mapa-de-divergências--auditoria-2026-07-01).
> Coluna "cobertura" = bloco/inbox que já ataca (ou "novo" = precisa card).

| Sev | Edição | Cobertura |
|---|---|---|
| ✅ | ~~P4 web (D4/D6)~~ — **RESOLVIDO** por FIX-115 (agulha no gate credit) | done |
| ✅ | ~~P6 gate (D7)~~ — **RESOLVIDO** por FIX-114 (`search_groups` gateado na identidade) | done |
| **P0** | **Passo 6** — Trilho A travado; fechar via Trilho B (D10) | bloco-c (FIX-88/89) |
| **⚠️** | **T2/P5** — decisão do stakeholder sobre o modelo do lance embutido (D9) | **PENDENTE-Bernardo** |
| **P1** | **D5** — WhatsApp valor por conversa (não lista de faixas) | novo (WhatsApp) |
| **P1** | **D11** — WhatsApp para de prometer "assinatura" (paridade DES-1) | novo |
| **P1** | **D12** — persistir documentos do nosso lado (não só pass-through) | bloco-a (FIX-82) |
| **P1** | **D13** — upload de documento inbound no WhatsApp (webhook ignora mídia) | novo (WhatsApp) |
| **P1** | **D14-16** — transbordo automático + broadcast + claim/lock (reaproveitar `proxy.ts`) | novo (mesa) |
| **P1** | **D18** — WhatsApp "Tenho interesse" = avanço direto (FIX-38) | novo (WhatsApp) |
| **P1** | **D19** — WhatsApp educação de lance embutido pra no/maybe (FIX-92 só web) | novo (WhatsApp) |
| **⚠️** | **T1/P1/P2/D1-D3** — sweep 2 objetivos + Trilho A primário + tradução A↔B | **PENDENTE-Kairo (recalibrar)** |
| **P2** | **D17** — claim move a raia (+ decidir raia "em atendimento") | novo (mesa) |
| **P2** | **D21** — welcome do chat web com 3 categorias (tirar "Outros") | novo |
| **P2** | **D22** — WhatsApp "Ver outras opções" determinístico | novo (WhatsApp) |
| **P2** | **D23** — (opcional) filtro runtime de meta-narrativa/frases proibidas | novo |
| **P2** | **D24** — corrigir cross-ref morta de teste (`meta-narrative.test.ts` → `behavior-guards.test.ts`) | trivial |

> Cada 🔴 vira **cenário de regressão** depois de corrigido; o QA autônomo persegue os 🟢 (e os
> 🔴 já corrigidos) até o verde. As **tensões (T1/T2)** não são bug — não entram no QA como falha.

---

## Mapa de divergências — auditoria 2026-07-01

> 24 confirmadas (verificadas adversarialmente) + 2 tensões. `Sev` P0>P1>P2. `Cobertura` = onde
> já é atacado. Este é o insumo direto para montar a onda de correção (fonte da Fase C).
>
> **⚠️ Atualização 2026-07-01 (pós-integração de FIX-113/114/115 na develop — a auditoria rodou
> no código ANTES deles):** **D4, D6, D7 RESOLVIDOS** (FIX-115 pôs a agulha simples no gate
> credit; FIX-114 gateou `search_groups` na identidade). **D8 MITIGADO** (a causa foi tapada; só
> resta hardening defensivo). As demais 21 persistem — verificadas no código atual (`6c2967d4`).

| ID | Regra/Passo | Sev | O que diverge (gap) | Evidência `file:line` | Cobertura |
|---|---|---|---|---|---|
| D1 | P1 descoberta | ⚠️T1 | descoberta 100% Trilho B; sem A→B. Conflita com ADR 2026-06-28 | `adapters/index.ts:26-33,64-85`; `ai-sdk.ts:958-961`; ADR `2026-06-28:28` | recalibrar |
| D2 | P2 tradução | P1 | sem camada de tradução de shape A↔B (só params em `prefsFromMeta`) | `self-contract-client.ts:76-84`; `proposal-gateway.ts:16-22`; `discovery-session.ts:15-23` | depende T1 |
| D3 | P3 sweep | P1 | sweep varre VALOR, não objetivo×embutido; opt-in; `recommend` não usa | `bevi-self-contract-adapter.ts:83-97,280-340`; `ai-sdk.ts:291-302`; `recommendation.ts:179,194` | recalibrar |
| D4 | P4 web | ✅ | **RESOLVIDO (FIX-115)**: gate credit emite `kind:"slider"` (agulha simples) | `web/adapter.ts:89`; `gate-renderer.tsx:49` | FIX-115 (done) |
| D5 | P4 WhatsApp | P1 | gate credit no WhatsApp manda lista de faixas, não conversa | `whatsapp/adapter.ts:50-53`; `formatter.ts:494`; `qualify-config.ts:8-11` | **novo** |
| D6 | P4 alvo | ✅ | **RESOLVIDO (FIX-115)**: `value-picker.tsx` (agulha) é o componente vivo do gate; `plan-estimate-picker` virou compat de msgs antigas | `gate-renderer.tsx:41,49` | FIX-115 (done) |
| D7 | P6 gate | ✅ | **RESOLVIDO (FIX-114)**: `tool-policy.ts:30` só expõe DISCOVERY se `identityCollected===true` | `tool-policy.ts:14-30` | FIX-114 (done) |
| D8 | P6 recuperação | P2↓ | **MITIGADO (FIX-114)**: D7 tapou o gatilho — a tool não é exposta sem identidade. Recuperação defensiva (catch→re-emitir gate) ainda ausente | `ai-sdk.ts:967-983` | hardening opcional |
| D9 | P5 embutido | ⚠️T2 | `contemplation-dial.ts:116` só `− ownCashValue`; contradiz jornada. CONTRADIZ CONTEXT D18/C4 | `contemplation-dial.ts:113-118`; `.oferta-real.test.ts:71-75`; `CONTEXT.md:186-188` | PENDENTE-Bernardo |
| D10 | Passo 6 Trilho A | **P0** | Trilho A travado (400 productId/AGX) → fechamento não completa; jornada marcava 🟢 | `bevi-api-adapter.ts:143-152`; `fulfillment.ts:90-97` | bloco-c |
| D11 | Passo 6 DES-1 | P1 | WhatsApp ainda promete "assinatura" (só web cumpre DES-1) | `formatter.ts:1101-1108`; `contract-summary.ts:46`; `signature-handoff.tsx:18-34` | novo |
| D12 | Passo 6 upload | P1 | upload é pass-through pra CONEXIA, sem persistência nossa | `fulfillment.ts:202-227`; `conexia-docs-client.ts:112-136`; `chat/document/route.ts:36-43` | bloco-a |
| D13 | Passo 6 upload WA | P1 | webhook WhatsApp ignora imagem/documento; copy promete "manda aqui" | `webhook/whatsapp/route.ts:94-126`; `formatter.ts:1111-1116` | novo |
| D14 | Mesa transbordo (a) | P1 | entrada automática na raia existe (worker) mas desacoplada do transbordo (manual) | `transbordo/route.ts:6`; `handoff.ts:1-2`; `proposal-status-poll.integration.test.ts:92` | novo |
| D15 | Mesa transbordo (b) | P1 | sem broadcast a todos; `getMesaAttendantList` existe; padrão em `proxy.ts` | `mesa-transbordo-dialog.tsx`; `mesa/outbound.ts:112-115`; `mesa/routing.ts:32-42`; `proxy.ts:234-263` | novo |
| D16 | Mesa transbordo (c) | P1 | sem claim/lock atômico; `mesa_attendant_id` NOT NULL | `handoff.ts:118-128`; `schema.ts:671-673`; `proxy.ts:343` | novo |
| D17 | Mesa transbordo (d) | P2 | claim não move raia; raia "em atendimento" inexistente | `handoff.ts:105-147`; `transbordo/route.ts:36-76`; `schema.ts:38-48` | novo |
| D18 | Passo 5 paridade | P1 | WhatsApp intercala card de decisão no 1º "Tenho interesse" (não acompanhou FIX-38) | `interactive-handlers.ts:580-595`; `route.ts:485-499` | novo |
| D19 | Passo 2 paridade | P1 | WhatsApp pula educação de lance embutido p/ no/maybe (FIX-92 só web) | `interactive-handlers.ts:353-358`; `route.ts:917-928`; `qualify-state.ts:71-77` | novo |
| D20 | Passo 2 canal | P1 | assimetria coleta de valor web×WhatsApp (superset de D4/D5) | `web/adapter.ts:80-90`; `formatter.ts:494-521`; `qualify-state.ts:57-65` | FIX-115(web) |
| D21 | Passo 1 welcome | P2 | chat web tem 4ª categoria ("Outros"); WhatsApp/landing/jornada têm 3 | `web/adapter.ts:177-181`; `formatter.ts:806-826`; `hero.tsx:19-23` | novo |
| D22 | Passo 5 paridade | P2 | WhatsApp `decision_outras` sem handler determinístico → texto livre | `decision-prompt.tsx:28-35`; `route.ts:521-548`; `interactive-handlers.ts:99-124` | novo |
| D23 | Passo 4 meta-narrativa | P2 | sem filtro runtime de frases proibidas; só prompt+regressão | `agent-trajectory.test.ts:216-247`; sem sanitizer em `lib/agent`/`lib/chat`/`api/chat` | novo (opcional) |
| D24 | Cross (teste) | P2 | cross-ref morta: `system-prompt.meta-narrative.test.ts` não existe | `agent-trajectory.test.ts` (comentário); `behavior-guards.test.ts:48-96` | trivial |
| T1 | P1/P2/P3 | ⚠️ | jornada×ADR: A primário vs B descobre. **recalibrar** | ver D1-D3 | PENDENTE-Kairo |
| T2 | P5 | ⚠️ | jornada×CONTEXT: embutido amortiza dívida vs reduz crédito. **decisão Bernardo** | ver D9 | PENDENTE-Bernardo |

> **Refutadas na auditoria (NÃO mexer — a jornada está certa):** "busca a mais próxima" (Passo 4,
> coberta por prompt); linha do gate `timeframe` (Passo 2, consistente — o vazamento é o P4);
> educação de lance embutido no picker web (degradação cosmética, não ausência); handoff Passo 7
> (opt-in 🟢 deliberado); FIX-113 turno-mudo no web (a cadeia causal do guard não procede no web).

---

## Cobertura de QA — Frente 1 (Descoberta + Qualificação + Identidade, Passos 1-4)

> Foto atual da validação autônoma da onda `divergencias-jornada` (4c8a81c5). Histórico do run:
> `.qa-loop/2026-07-01-0236-ledger.md`. Última validação: **2026-07-01**.

| Passo / cenário | Fase | Status | Como validado |
|---|---|---|---|
| P1 · welcome web = 3 categorias (Imóvel/Carro/Moto), sem "Outros" | 🟢 (era 🔴 D21) | ✅ PASS | **bug residual do FIX-121 achado** (EmptyState/message-list tinha 2ª cópia com 4) → **FIX-130** (fonte única) + confirmado no browser real |
| P1 · footer landing = 3 categorias de entrada | 🟢 (D21) | ✅ PASS | **bug achado no browser** (footer com "Serviços") → **FIX-131** (removido, decisão Kairo) |
| P1 · paridade welcome web = WhatsApp = landing | 🟢 | ✅ PASS | structural (welcome-options.test) + browser |
| P2 · WhatsApp valor por conversa ("uns 80 mil"), sem lista de faixas | 🟢 (era 🔴 D5) | ✅ PASS | FIX-120: código credit→null + cassette + parser 15/15 adversarial |
| P2 · prazo NÃO perguntado na entrada | 🟢 | ✅ PASS | FIX-103 (cassette + qualify-state) |
| P2 · educação lance embutido pra Sim/Não/Talvez nos 2 canais | 🟢 (era 🔴 D19) | ✅ PASS | FIX-118: fireGate lance-embutido no ramo no/maybe + cassette |
| P2 · componente de valor = agulha simples (não multi-slider) | 🟢 (D4/D6) | ✅ PASS | FIX-115: gate-renderer credit→ValuePicker |
| P3 · identidade (CPF+telefone) antes da busca | 🟢 | ✅ PASS | gate identify precede credit (FIX-114) |
| P3 · search_groups NUNCA sem identidade (sem "dificuldade técnica") | 🟢 (era 🔴 D7/P6) | ✅ PASS | FIX-114: allowedTools + adapter lança IdentityNotCollectedError; detectores no cassette |
| P4 · retorna ≥1 carta REAL da Bevi (nunca mock) | 🟢 (P7) | ✅ PASS | **AO VIVO** homologação: auto 80k→24 grupos reais, imóvel 250k→22 |
| T1 (sweep/trilhos) · T2 (embutido amortiza) | ⚠️ tensão | — | NÃO testado como bug (decisão stakeholder — PENDENTE Kairo/Bernardo) |

**Resultado Frente 1: 10/10 cenários vivos ✅ + 2 bugs residuais achados e corrigidos (FIX-130, FIX-131).**

## Cobertura de QA — Frente 2 (Recomendação + Simulador + Fechamento, Passos 5-7)

> Foto do último teste por cenário. Histórico/detalhe no ledger de run
> (`.qa-loop/2026-07-01-...-ledger-frente2-recomendacao-fechamento.md`). Última validação: **2026-07-01**.

| Cenário | Passo | Status | Nível |
|---|---|---|---|
| Card recomendado + Outras opções (carrossel) | P5 | ✅ PASS | struct (formatter.card-recomendada + other-options) |
| Resumo por oferta (carta·parcela·prazo·adm·lance·liquidez) | P5 | ✅ PASS | struct (formatter.real-offer) |
| Simulador contemplação 3/6/12 recalcula | P5 | ✅ PASS | property/component (contemplation-dial) + formatter.simulador |
| Card de decisão (3 botões) | P5 | ✅ PASS | struct (decision_${intent}; outras=determinístico) |
| Ressalva CDC "estimativa" | P5 | ✅ PASS | struct (formatter.simulador) |
| **FIX-117/D18** WhatsApp "Tenho interesse" = avanço direto (paridade FIX-38) | P5 | ✅ PASS | integ+cassette + code-review (dispatch→buildAdvanceToContract) |
| **FIX-119/D22** WhatsApp "Ver outras" (decision_outras) determinístico | P5 | ✅ PASS | integ+cassette + code-review (→buildOtherOptions, model-free) |
| Confirma oferta escolhida (re-simula TTL) | P6 | ✅ PASS | integ (contract-capture) |
| **FIX-122/D13** upload doc inbound WhatsApp | P6 | ✅ PASS | integ+cassette + code-review (webhook image/document→handleDocumentInbound) |
| **FIX-116/D11** WhatsApp NÃO promete "assinatura" (DES-1) | P6 | ✅ PASS | struct+cassette + code-review (0 copy runtime /assinatura\|assinar/i) |
| Parabéns + resumo WA/email + opt-in | P7 | ✅ PASS | struct (whatsapp-optin + signature-handoff) |
| **T2** lance embutido amortiza dívida×crédito | P5 | ⚠️ NÃO TESTADO | tensão — decisão Bernardo (não é bug) |

- Full onda `divergencias-jornada` (216 arquivos / 2194 testes): ✅ verde. Zero regressão introduzida.
- Validação no nível certo (§5): fixes WhatsApp são determinísticos → unit+cassette+code-review.
  E2E ao vivo do funil foi **bloqueado upstream** (Passo 1 nome / Passo 3 identidade — FRENTE-1/cross-cutting),
  não alcançou o reveal; ver ledger + `docs/correcoes/inbox/2026-07-01-crossfrente-agente-mudo-captura-nome.md`.
