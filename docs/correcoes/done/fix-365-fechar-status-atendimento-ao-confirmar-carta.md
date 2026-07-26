---
id: FIX-365
titulo: "Provar que a mesa é notificada UMA VEZ (não duplicada) quando o lead fecha a proposta e depois avança via polling da Bevi"
status: done
severidade: media
projeto: aja-agora
arquivos:
  - src/lib/bevi/proposal-repo.ts
  - src/app/api/chat/route.ts
  - src/lib/whatsapp/contract-capture.ts
  - src/lib/bevi/fecho-pedir-oi.ts
  - src/lib/mesa/handoff.ts
  - src/lib/whatsapp/mesa/notify.ts
  - src/lib/whatsapp/workers/proposal-status-poll.ts
rodada: 2026-07-22 — campanha vendedor-matador-consorcio (goal doc .processo/loop/2026-07-22-1853-vendedor-matador-consorcio.md, ITEM 3)
commit: f48a3285
executado_em: 2026-07-22
---

## Execução (bloco-h-resume-mesa)
Confirmado por leitura de código: **nenhuma correção de negócio foi necessária** — a
ligação stage+notificação já existe (`createBeviProposal` →
`transitionLeadStage(..., "proposta_enviada")`, `sendFechoPedirOi` →
`dispatchAutoTransbordo`) e `createMesaHandoff` (`src/lib/mesa/handoff.ts:135-145`)
**já é idempotente**: antes do INSERT, checa se existe handoff ATIVO
(`aberto`/`em_andamento`) pro lead e devolve `handoff_ativo_existe` sem criar
segunda linha. `dispatchAutoTransbordo` (`src/lib/mesa/dispatch.ts`) só dispara o
broadcast WhatsApp quando o handoff foi de fato criado nesta chamada — no
segundo disparo (poll) o broadcast nem roda. O worker de polling
(`src/lib/workers/proposal-status-poll.ts:69`, não
`whatsapp/workers/...` como o card original apontava — caminho desatualizado)
só rechama o transbordo quando a raia REALMENTE mudou pra `na_administradora`
nesta reconciliação (`applied && stage === "na_administradora"`), não a cada
tick do mesmo status.

Faltava só o teste de regressão provando isso pelo fluxo real (não reimplementar
nada). Dois arquivos novos:
- `src/lib/mesa/dispatch.fix-365.integration.test.ts` — DB real (`describeIfDb`,
  skip sem `DATABASE_URL`, mesmo padrão de `handoff.integration.test.ts`):
  simula aceite (`dispatchAutoTransbordo` com lead em `proposta_enviada`) seguido
  do poll (lead avança pra `na_administradora`, `dispatchAutoTransbordo` de novo)
  e prova **exatamente 1** handoff ativo pro lead. **Não executado neste
  ambiente** (worker de bloco/onda não sobe stack de DB — convenção
  `local-dev`) — roda em CI/sessão com Postgres.
- `src/lib/mesa/dispatch.fix-365.structural.test.ts` — Camada 1 (sem DB, rodou e
  passou aqui): trava em código-fonte os 3 guards que sustentam a garantia
  (ordem check-antes-do-insert em `handoff.ts`, guard `result.ok` antes do
  broadcast em `dispatch.ts`, guard `applied && stage === "na_administradora"`
  no worker de polling).

## Palavras do operador
> "Aqui vamos fazer o seguinte e aqui já é uma feature mesmo né. Quando for notificado esse card aqui a nossa status do nosso atendimento lá tem que ser fechado já, ganho né? Deixa eu lembrar aqui o funil pra nós, ó: ele tem que ir pra administradora, ele tem que estar em nosso funil na aba de administradora, e já tem que notificar o atendente de que tem alguém para ser atendido, ou seja os atendentes da mesa, igual a gente tem lá no back-end entendeu? Já tem que notificar isso lá e considerar também como uma tarefa a ser executada aqui porque daqui a pouco a gente vai executar todas."

## Cenário exato
- **Rota/tela:** Chat web/WhatsApp, momento em que o cliente clica "Confirmo essa carta"
  (evidência em `docs/correcoes/inbox/_evidencia/2026-07-22-fechar-status-atendimento-ao-confirmar-carta.png`).
- **Passos:** 1) Cliente confirma a carta 2) Agente responde com sucesso + card "próximo passo
  é com a gente" 3) Kairo pediu, ao ver esse card, que o status do funil mude e a mesa seja
  notificada.
- **Dados usados:** N/A.

## Esperado × Atual
- **Esperado (pedido original do Kairo):** status do atendimento vira fechado/ganho, lead vai
  pra aba "administradora" do funil, atendentes da mesa são notificados.
- **Atual (CONFIRMADO POR INVESTIGAÇÃO — root cause da v1 desta spec estava ERRADO):** isso **já
  acontece hoje**. `createBeviProposal` (`proposal-repo.ts:76`) chama
  `transitionLeadStage(leadId, "proposta_enviada")` no fechamento. A mesa **já é notificada**:
  web `route.ts:1011` chama `sendFechoPedirOi` → `fecho-pedir-oi.ts:126` →
  `dispatchAutoTransbordo(leadId)` (`createMesaHandoff` + `broadcastCaseToAttendants`);
  WhatsApp faz o mesmo em `interactive-handlers.ts:265-266`. Existe ainda um SEGUNDO caminho: o
  worker `proposal-status-poll.ts:69-71` dispara `dispatchAutoTransbordo` DE NOVO quando o lead
  entra em `na_administradora` (via polling real da Bevi).

## Root cause (INVESTIGADO — o gap real é risco de notificação duplicada, não ausência de feature)
Duas checagens amplas de código (find-code) confirmaram que TODAS as peças pedidas pelo Kairo
já existem e já disparam no aceite da carta. **O único gap real:** com dois caminhos
disparando `dispatchAutoTransbordo` pro mesmo lead (aceite imediato + polling posterior quando
a Bevi processa de fato), existe risco de **notificação duplicada de mesa** se o handoff não
for idempotente entre os dois disparos.
**Decisão de produto tomada por default recomendado** (Kairo ausente, `AskUserQuestion`
dispensado 2×, ver goal doc): manter o stage `proposta_enviada` no aceite (fiel ao
processamento real da Bevi — `na_administradora` só quando ela de fato confirma via polling).
⚠️ PENDENTE-KAIRO revisar essa decisão quando puder — se ele preferir antecipar o stage no
aceite, é mudança pequena e isolada.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| NÃO implementar "conectar" nada novo — a ligação já existe | — |
| Escrever teste/checagem que prove que `dispatchAutoTransbordo`/`createMesaHandoff` roda **exatamente 1 vez** por lead no fluxo aceite→poll (idempotência do handoff já ativo) | `mesa/handoff.ts`, `proposal-status-poll.ts` |
| Se o teste encontrar duplicação real, corrigir a idempotência (ex.: checar handoff já aberto antes de criar outro) | `mesa/handoff.ts` |

## Regressão exigida
**TDD strict** (é invariante de negócio — evitar dupla notificação): teste de integração
simulando o fluxo completo (aceite da carta → `sendFechoPedirOi`/`fireContract` →
`dispatchAutoTransbordo` → depois o poll de `proposal-status-poll.ts` rodando com o lead já em
`na_administradora`) e provando que existe **exatamente 1** handoff de mesa criado, não 2.
