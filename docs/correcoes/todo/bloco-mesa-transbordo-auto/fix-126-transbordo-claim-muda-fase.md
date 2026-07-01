---
id: FIX-126
titulo: "Transbordo: ao assumir (claim), o lead muda de fase"
status: todo
bloco: bloco-mesa-transbordo-auto
arquivos: [src/lib/mesa/handoff.ts, src/db/schema.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---

## Origem (auditoria D17 — voz do operador)
Divergência **D17** do Mapa (`docs/jornada/jornada-canonica.md:147` e linha 242). A jornada
canônica (Parte 2, EDIÇÃO #6 — transbordo auto-broadcast + claim) é a REGRA do fluxo da mesa e diz,
na voz do operador:

> Ao assumir, o lead **muda de fase** (negociação → em atendimento / na administradora).

Hoje **nem o transbordo manual move a raia** — assumir um caso não reflete nenhuma mudança de estado
no funil do kanban. O lead segue parado na raia anterior enquanto o atendente já está tocando o caso.

**REGRA de paridade:** o handoff de CHAT de vendas **já faz isto certo** — ao ser assumido, ele move a
raia (`src/lib/whatsapp/proxy.ts:312` → `transitionLeadStage(leadId, "em_negociacao", …)`); e o worker
de status Bevi já mapeia status→raia (`src/lib/workers/proposal-status-poll.ts:60`). A mesa deve ter
**a mesma paridade**: claim = transição de raia. Não é feature nova de mecânica — é acoplar a máquina
de estados que já existe (`transitionLeadStage`, `src/lib/admin/lead-transitions.ts:26`) ao ponto do
claim, exatamente como o chat de vendas já faz.

## Cenário exato (comportamento divergente hoje)
- **Fluxo:** operador (ou, pós-FIX-125, o atendente que clica "Vou atender") assume um lead na mesa.
- **Passos:** 1) lead entra em `na_administradora`/`proposta_enviada`; 2) transbordo dispara
  (`POST /api/admin/leads/[id]/transbordo`); 3) atendente assume o caso.
- **Atual:** a raia do lead **não muda** — o card do kanban continua na mesma coluna, mesmo com o
  caso já assumido e o dossiê enviado. O único efeito é uma linha em `mesa_handoffs`.
- **Esperado:** ao assumir, o lead transiciona para a fase "em atendimento" (raia própria da mesa)
  **ou** para `na_administradora` (se a decisão de design for tratar como alias) — refletindo no
  kanban que o caso está sendo tocado por um humano, com o `lead_events` correspondente registrado.

## Root cause (INVESTIGADO — provado no código atual)
1. **`createMesaHandoff` só insere, nunca transiciona** — `src/lib/mesa/handoff.ts:105-147`: a função
   resolve proposta/administradora, checa idempotência e faz **apenas** o `db.insert(mesaHandoffs)`
   (linhas 133-144), retornando `{ ok, handoff, lead, attendant, proposal }`. **Não há nenhuma
   chamada a `transitionLeadStage`** no corpo — confirmado lendo o arquivo inteiro. `leads.stage`
   nunca é tocado.
2. **A rota também não transiciona** — `src/app/api/admin/leads/[id]/transbordo/route.ts:36-76`:
   chama `createMesaHandoff` (linha 36) e, em caso de sucesso, só dispara o outbound
   `sendCaseToAttendant` (linha 70). Nenhum `transitionLeadStage` no caminho.
3. **A raia "em atendimento" não existe no enum** — `src/db/schema.ts:38-48`: `leadStageEnum` tem
   `novo, engajado, qualificado, em_negociacao, proposta_enviada, na_administradora,
   aguardando_pagamento, fechado_ganho, perdido`. **Não há "em atendimento"** — logo, mesmo que se
   quisesse mover a raia hoje, não há valor de destino para o estado que a jornada descreve.

Contraste (o caminho que JÁ está correto): `src/lib/whatsapp/proxy.ts:312` chama
`transitionLeadStage(leadId, "em_negociacao", { type: "system" }, { onlyAdvance: true })` no claim do
chat de vendas. A mesa é a exceção que ficou de fora.

## ⚠️ Decisão de design pendente (PERGUNTAR antes de implementar o enum)
"em atendimento" é **raia nova** no `leadStageEnum` ou **alias** de `na_administradora`? É decisão de
jornada/produto (impacta kanban, funil forward-only e relatório) — **não decidir sozinho**. Opções:

| Opção | Efeito | Custo |
|---|---|---|
| **A — raia nova `em_atendimento`** entre `proposta_enviada` e `na_administradora` no `STAGE_ORDER` | coluna própria no kanban; fidelidade total à jornada | migration Drizzle no enum (roda no container, nunca na mão) + nova coluna no board + revisão do mapeamento status Bevi→raia do worker (FIX-44) pra não pular a raia |
| **B — alias de `na_administradora`** (claim move pra `na_administradora`) | zero enum novo; reusa raia existente | "em atendimento" e "na administradora" ficam indistintos no funil — pode divergir da jornada |

Recomendada: **A** (fidelidade à jornada), **mas pende do aval do Kairo/Bernardo** — a jornada cita
literalmente "em atendimento" como estado distinto. Sem resposta, não mexer no enum: implementar o
acoplamento com o destino que a decisão fixar.

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Após o `INSERT` bem-sucedido do handoff (que, pós-FIX-125, é o ponto do **claim** — `UPDATE … WHERE mesa_attendant_id IS NULL`), chamar `transitionLeadStage(lead.id, <raia-decidida>, { type: "admin", id: createdBy } ?? { type: "system" }, { onlyAdvance: true })` — best-effort, mesma paridade do `proxy.ts:312`. A transição loga `lead_events` automaticamente. | `src/lib/mesa/handoff.ts` (dentro de `createMesaHandoff`, após a linha 144) |
| Se a decisão for **Opção A**: adicionar `"em_atendimento"` ao `leadStageEnum` na posição correta do funil + refletir no `STAGE_ORDER` (forward-only). Migration roda **no ambiente/container**, nunca na mão (regra de migrations). Se **Opção B**: nenhuma mudança de schema — destino é `na_administradora`. | `src/db/schema.ts:38-48` (+ `src/lib/admin/lead-stages.ts` STAGE_ORDER, se A) |

Nota: a transição é **forward-only** por default (`lead-transitions.ts:41-45`) — assumir um caso que
já está numa raia adiante é no-op seguro, não regride o funil.

## Regressão exigida
Código **não-agêntico puro** — o claim/transbordo é função de repositório + rota HTTP (não chama
`streamText`, não é comportamento da LLM). Pela regra "quando NÃO precisa cassette", **não exige
Camada 2** (trajectory). Cobre-se com structural + integration:

- **Camada 1 (structural, `src/lib/mesa/handoff.*.test.ts`):** `createMesaHandoff` referencia
  `transitionLeadStage`; `leadStageEnum` contém o valor de destino decidido (`em_atendimento` na
  Opção A) e `STAGE_ORDER` o posiciona no funil.
- **Integration (`handoff` + DB real):** dado um lead em `proposta_enviada`, ao assumir o transbordo
  o `leads.stage` passa para a raia decidida **e** um `lead_events` (`fromStage`→`toStage`,
  `actorType`) é gravado; assumir um lead já em raia adiante é **no-op** (forward-only, sem regressão);
  handoff idempotente (`handoff_ativo_existe`) **não** re-transiciona. Espelhar a asserção já feita
  pro claim do chat de vendas (`proxy.ts`) — REGRA de paridade.
