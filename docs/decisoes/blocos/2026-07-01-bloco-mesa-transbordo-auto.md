# Decisão de Design — Transbordo auto-broadcast + claim (bloco-mesa-transbordo-auto)

**Data:** 2026-07-01
**Status:** Implementado e commitado
**Autor:** Bloco `bloco-mesa-transbordo-auto` executor
**Itens:** FIX-123 (D14), FIX-124 (D15), FIX-125 (D16), FIX-126 (D17)

---

## Contexto

A jornada canônica (Parte 2, EDIÇÃO #6 — `docs/jornada/jornada-canonica.md:141-147`) pede
que o transbordo pra mesa deixe de ser manual: ao o lead entrar na fase, o sistema transborda
**automaticamente**, faz **broadcast** a todos os atendentes com botão "Vou atender", e o
**primeiro que clica ASSUME** (claim/lock atômico); ao assumir, o lead **muda de fase**.

O padrão broadcast+claim já existe no chat de vendas (`src/lib/whatsapp/proxy.ts`,
`handoffToAgents` + claim via `handedOffUserId` nulo→reivindicado). A mesa deve **espelhar**
essa mecânica, não reinventar.

Duas decisões de produto/jornada tinham trade-off real e foram levadas ao Kairo via
`AskUserQuestion` (recomendada em 1º). Ambas confirmadas na recomendada.

---

## Decisão 1 — FIX-123 (D14): quais transições de raia disparam o transbordo automático?

**Opções:**
- **A)** Só `na_administradora`.
- **B)** `na_administradora` + `em_negociacao` (antecipa a mesa).
- **C)** Conjunto configurável via env, default `na_administradora`.

**Decisão: A — só `na_administradora`.** (confirmada pelo Kairo)

**Razão:**
- É a raia onde a proposta foi aprovada e aguarda o código único / formalização — o momento
  exato em que a mesa precisa agir (alinha com a narrativa "ao chegar na fase de atendimento").
- É a **primeira** raia pós-`proposta_enviada` que o worker de status (FIX-44) produz
  (`PROPOSAL_STATUS_TO_STAGE`: `approveWaitingForUniqueCode → na_administradora`).
- `em_negociacao` também é setado no handoff de **chat de vendas** (`proxy.ts:312`) — disparar
  o transbordo da mesa ali geraria transbordo prematuro/duplicado de casos ainda no
  self-service. Descartado.
- Config via env é superfície que ninguém mexe no MVP (YAGNI). Descartado.

**Implementação:** no `reconcileProposalStage` (worker), após `transitionLeadStage`, dispara o
transbordo automático **apenas quando `applied === true` E `stage === "na_administradora"`**.
Best-effort e logado — falha do transbordo/broadcast NÃO derruba o ciclo nem a transição de raia.

---

## Decisão 2 — FIX-126 (D17): "em atendimento" é raia nova ou alias de `na_administradora`?

**Opções:**
- **A)** Raia nova `em_atendimento` no `leadStageEnum`.
- **B)** Alias de `na_administradora` (claim não move a coluna).

**Decisão: A — raia nova `em_atendimento`, posicionada ENTRE `na_administradora` e
`aguardando_pagamento`.** (confirmada pelo Kairo)

**Razão + reconciliação de uma tensão de design real:**
- A jornada cita "em atendimento" como estado **distinto** ("ao assumir, o lead muda de fase").
  Alias (B) deixaria "em atendimento" e "na administradora" indistintos no funil → divergência
  da jornada (regra inviolável: divergência código×jornada = defeito). Descartado.
- ⚠️ **Posição importa.** O card FIX-126 sugeria `em_atendimento` *entre `proposta_enviada` e
  `na_administradora`*. Isso **quebra** quando combinado com a Decisão 1: o transbordo dispara em
  `na_administradora`, então o claim tentaria mover o lead de `na_administradora` **para trás**
  pra `em_atendimento` → a máquina forward-only (`lead-transitions.ts:41-45`) faz **no-op** →
  "assumir muda de fase" não acontece. Bug latente.
- **Correção:** posicionar `em_atendimento` **depois** de `na_administradora`. Assim o claim
  avança `na_administradora → em_atendimento` (forward, aplica) e o worker depois avança
  `em_atendimento → aguardando_pagamento` (forward, aplica). O worker **nunca produz**
  `em_atendimento` (é estado interno, sem status Bevi correspondente), então não há colisão: se
  o lead já está em `em_atendimento` e o worker re-poll o status `approveWaitingForUniqueCode`
  (→ `na_administradora`), forward-only faz no-op seguro (não regride).

**`STAGE_ORDER` / `leadStageEnum` resultante:**
```
novo → engajado → qualificado → em_negociacao → proposta_enviada →
na_administradora → em_atendimento → aguardando_pagamento → fechado_ganho / perdido
```

**Blast radius (arquivos fora do escopo_arquivos declarado, tocados por necessidade —
"erro que você vê você corrige" + "não podar paralelismo por medo de merge"):**
- `src/lib/admin/lead-stages.ts` — `STAGE_ORDER` (+ `em_atendimento`).
- `src/lib/admin/dashboard-types.ts` — `FUNNEL_STAGES` (label "Em Atendimento").
- `src/components/admin/pipeline/kanban-column.tsx` — `STAGE_LABELS` + `STAGE_DOT_COLORS`
  (têm fallback `?? stage`, mas adicionamos label/cor pra polimento).
- Migration Drizzle do enum (roda no ambiente/container — nunca na mão).

---

## Decisão 3 (implicada) — modelo de estado do claim (FIX-125/124)

Espelha `conversations.handedOffUserId` do proxy: `mesa_handoffs.mesa_attendant_id` passa a ser
**nullable** (estado "sem dono"). O broadcast (FIX-124) cria o handoff sem dono e envia a TODOS
os atendentes ativos um **botão interativo "Vou atender"** cujo id carrega o `handoffId`
(`mesa_claim:<handoffId>`). O claim é um **`UPDATE ... WHERE mesa_attendant_id IS NULL`** atômico
— **1 vencedor garantido em corrida** (o banco serializa a linha). Diferente do proxy
(`proxy.ts:511-519`, que faz find-then-update SEM guard e tem TOCTOU latente), a mesa implementa
o **guard atômico** desde o início. O perdedor recebe "caso já assumido por X".

**Dispatch do botão:** o clique "Vou atender" de um atendente de mesa chega no webhook como
`interactive.button_reply`. Adicionamos precedência de mesa no caminho **interativo**
(`processInteractiveReply`), espelhando a que já existe no caminho de texto
(`processor.ts:64`, `isMesaAttendantPhone → handleMesaCopilot`): número de atendente de mesa +
`replyId` começa com `mesa_claim:` → roteia pro `handleMesaClaim` (nunca pro funil de cliente).
Isso conserta também um gap latente (hoje o clique de um atendente cairia no
`dispatchInteractiveReply` como se fosse cliente).

---

## Ordem de execução (dependência de dados entre itens)
1. **FIX-125** — base: `mesa_attendant_id` nullable + `claimMesaHandoff` atômico.
2. **FIX-123** — acopla a transição de raia (`na_administradora`) ao disparo automático.
3. **FIX-124** — broadcast a todos + botão "Vou atender" + dispatch do claim.
4. **FIX-126** — claim move a raia (`na_administradora → em_atendimento`).
