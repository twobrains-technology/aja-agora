---
id: FIX-123
titulo: "Transbordo automático ao lead entrar na fase (acoplar ao worker de raia)"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-mesa-transbordo-auto
arquivos: [src/lib/workers/proposal-status-poll.ts, src/lib/mesa/handoff.ts]
rodada: 2026-07-01 — auditoria código×jornada (Mapa em docs/jornada/jornada-canonica.md)
---
## Origem
Auditoria código×jornada 2026-07-01, **divergência D14** (Mapa da jornada canônica —
`docs/jornada/jornada-canonica.md:144,239`). A jornada canônica é a **voz do operador**
(regra de produto inviolável, `CLAUDE.md`), não inspiração.

> **Regra da jornada (Parte 2, EDIÇÃO #6 / Mapa D14):** "Ao o lead **entrar na fase**, o
> sistema **transborda automaticamente** (sem clique)." A entrada automática na raia **já
> existe** (worker FIX-44), mas está **desacoplada** do transbordo — este ainda depende de
> clique manual do admin no kanban.

## Cenário exato
- **Onde:** worker de polling do desfecho da proposta (`proposal-status-poll.ts`) +
  registro de transbordo (`mesa/handoff.ts`).
- **Passos que expõem a divergência:**
  1. Lead com proposta ativa; a Mesa (back office da Conexia) move o status na Bevi.
  2. O worker (`runPollCycle` → `reconcileProposalStage`) consulta o status REAL, mapeia
     `approveWaitingForUniqueCode` → raia `na_administradora` e aplica a transição
     (`proposal-status-poll.ts:47-63`, coberto por `proposal-status-poll.integration.test.ts:90`).
  3. **O lead entra em `na_administradora` — mas NENHUM `mesa_handoffs` é criado.** O caso
     fica invisível pra Mesa até um admin abrir o kanban e clicar no botão de transbordo.
- **Dados usados:** qualquer proposta de teste de homologação (contas canônicas
  Kairo/Mirella) cujo status Bevi avance pra `na_administradora`.

## Esperado × Atual
- **Esperado:** ao o worker mover o lead pra `na_administradora` (raia(s) que disparam o
  transbordo — ver DECISÃO abaixo), o sistema **dispara o transbordo automaticamente** —
  cria o handoff e faz o broadcast do dossiê aos atendentes de mesa, sem clique. **Paridade
  com o web:** o handoff de chat de vendas em `proxy.ts` já dispara auto no sinal de
  interesse (broadcast a todos + claim atômico, `proxy.ts:234-263`) — a mesa deve espelhar
  esse comportamento, não continuar manual.
- **Atual:** transbordo é **100% manual** — só o botão do kanban aciona o fluxo.

## Root cause (INVESTIGADO — provado no código atual)
Re-verificado no código atual (o gap **persiste**; FIX-113/114/115 mexeram em outros pontos):

1. **`reconcileProposalStage` só transiciona a raia — nunca transborda.**
   `src/lib/workers/proposal-status-poll.ts:47-63` chama `transitionLeadStage(row.leadId,
   stage, { type: "system" })` e retorna. Importa `transitionLeadStage`
   (`proposal-status-poll.ts:20`) mas **NÃO importa nem chama `createMesaHandoff`**.
   `grep createMesaHandoff` no worker = zero.
2. **`createMesaHandoff` tem um único caller — a rota manual.**
   `grep -rn createMesaHandoff src/` (excluindo testes) → só
   `src/app/api/admin/leads/[id]/transbordo/route.ts:36` (o botão do kanban) e a própria
   definição em `src/lib/mesa/handoff.ts:105`. A automação nunca o invoca.
3. **O gatilho é declaradamente manual (DEC-B).** `src/lib/mesa/handoff.ts:1-2` — "Mesa de
   operação — registro do transbordo (FIX-64) … DEC-B (gatilho manual)"; e
   `src/app/api/admin/leads/[id]/transbordo/route.ts:6` — "Transbordo **manual** de um lead
   do kanban … Gatilho é o botão no card (DEC-B)".

Conclusão: a máquina de raia (worker FIX-44) e o registro de transbordo (FIX-64) existem,
mas vivem em silos — falta o acoplamento que a jornada exige. `createMesaHandoff` já é
**idempotente** (`handoff.ts:118-128`: `handoff_ativo_existe` não cria segundo registro),
então re-polls do mesmo lead não duplicam handoff — o acoplamento é seguro por construção.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Após `transitionLeadStage` aplicar uma raia que DISPARA transbordo (ver DECISÃO), invocar o fluxo de transbordo automático (create + broadcast do FIX-124) com `actor: system` | `src/lib/workers/proposal-status-poll.ts` (`reconcileProposalStage`, após a transição em ~:60-62) |
| Expor um ponto de disparo do transbordo reusável pela automação (sem `createdBy` de admin), apoiado na idempotência de `createMesaHandoff`; sem atendente escolhido → estado "sem dono" (claim do FIX-125/126) | `src/lib/mesa/handoff.ts` |
| Só disparar quando `applied === true` (raia REALMENTE mudou nesta reconciliação) — evita reprocessar a cada poll do mesmo status | `src/lib/workers/proposal-status-poll.ts` (`reconcileProposalStage` já computa `applied`) |
| Falha do transbordo/broadcast é best-effort e logada — NÃO derruba o ciclo de polling nem a transição de raia (mesmo contrato do `try/catch` de `runPollCycle`, worker :117-126) | `src/lib/workers/proposal-status-poll.ts` |

### DECISÃO pendente — quais transições disparam (produto/jornada, confirmar com o Kairo)
Não cravar no escuro. A jornada diz "ao entrar **na fase**", mas "a fase" precisa virar
regra binária de raia. Opções:
- **(A, recomendado)** disparar só ao entrar em `na_administradora` — é a fase onde o caso
  fica com a administradora e a Mesa precisa agir; alinha com o texto D14/D15 ("caso enviado
  a todos os atendentes").
- **(B)** disparar já em `em_negociacao` — antecipa a Mesa antes da proposta ir pra
  administradora.
- **(C)** conjunto configurável de raias-gatilho (env/config), default = `na_administradora`.

`STAGE_ORDER` relevante: `… em_negociacao → proposta_enviada → na_administradora …`
(`src/lib/admin/lead-stages.ts`). O broadcast em si é o FIX-124 (D15); o claim/lock é
FIX-125/126 (D16/D17) — este card entrega **só o gatilho automático** (D14). Ordem interna
do bloco: FIX-125 (base "sem dono") → **FIX-123 (este)** → FIX-124 → FIX-126
(`_bloco.md:29-38`).

## Regressão exigida
Trigger de código puro (worker determinístico → cria handoff), **sem comportamento de
LLM** neste item → regressão é **integration/unit**, não cassette de agente. (O broadcast
via WhatsApp é o FIX-124, com sua própria cobertura; o outbound é best-effort e mockado.)

- **Integration (novo caso em `src/lib/workers/proposal-status-poll.integration.test.ts`,
  ao lado do teste D14 existente em :90):**
  1. **Ver FALHAR primeiro (TDD strict):** seed de lead `proposta_enviada` + proposta cujo
     status Bevi mapeia pra `na_administradora`; rodar `reconcileProposalStage`; **assert
     que existe UM `mesa_handoffs` ativo pro lead** (`status ∈ {aberto, em_andamento}`).
     Hoje falha — nenhum handoff é criado.
  2. **Idempotência:** re-rodar `reconcileProposalStage` com o mesmo status **não cria um
     segundo** `mesa_handoffs` (reusa `handoff_ativo_existe`, `handoff.ts:118-128`).
  3. **Não-gatilho:** transição pra uma raia que NÃO dispara (ex.: `proposta_enviada`, ou
     `aguardando_pagamento` conforme a DECISÃO) **não cria** handoff.
  4. **Isolamento de falha:** com o broadcast/outbound falhando (mock rejeita), a transição
     de raia e o ciclo **seguem** (raia aplicada, ciclo não lança) — best-effort.
- **Structural (unit, ao lado do worker):** assert que `reconcileProposalStage` invoca o
  disparo de transbordo **só quando `applied === true`** e **só** para a(s) raia(s)-gatilho
  decidida(s) — congela a regra de quais transições transbordam contra regressão de config.

**REGRA de aceite:** paridade com o comportamento já correto do web — o handoff dispara
**automaticamente** na entrada da fase (como `proxy.ts` faz no sinal de interesse), não por
clique. Enquanto o disparo depender de botão, o critério não passa.
