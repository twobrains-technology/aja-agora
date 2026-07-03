# Decisão — Dinâmica de atendimento de mesa: visibilidade, reatribuição e encerramento

> 2026-07-03 · Kairo · Status: **aceita (provisória)**
> Design (como): [`../design/specs/2026-07-03-mesa-visibilidade-reatribuicao-design.md`](../design/specs/2026-07-03-mesa-visibilidade-reatribuicao-design.md) ·
> Fluxo as-built: [`../referencia/mesa-de-operacao-fluxo.md`](../referencia/mesa-de-operacao-fluxo.md) ·
> Raias (fonte): `src/lib/admin/lead-stages.ts`

## Contexto

Na mesa de operação, depois que um atendente dá claim ("Vou atender"), o front não mostrava **quem
assumiu**, e o dialog de transbordo dava um 409 seco sem deixar reatribuir nem encerrar. Além disso,
um mesa handoff, uma vez em `em_andamento`, **nunca fechava** (os status `concluido`/`cancelado` do
enum não eram setados por nada).

## Decisão

1. **Visibilidade:** o card do kanban e o painel de detalhe mostram o **atendente responsável** pelo caso.
2. **Redistribuir = reatribuir a um atendente ESPECÍFICO** (dropdown de atendentes ativos) — **não**
   re-broadcast à mesa. O dono muda direto; antigo e novo são notificados por WhatsApp.
3. **Encerrar atendimento** fecha o handoff (`status = concluido`, `closed_at`) **e move o card do lead
   pra `fechado_ganho`** (ganho). Isso também fecha o gap do handoff que nunca terminava.

## Consequências

- Requer estender os GET de lead/contato (join do handoff+atendente) e criar 2 endpoints admin
  (`reassign`, `close`). Sem migration (reusa colunas de `mesa_handoffs`).
- O encerramento passa a ser um gatilho de transição de raia (mesa → `fechado_ganho`), somando aos
  gatilhos existentes (FIX-123/126).

## Provisório — a revisitar

As **raias do kanban** (`na_administradora → aguardando_pagamento → fechado_ganho`) serão **azeitadas
com o cliente** (o Kairo conduz). O mapeamento "encerrar → `fechado_ganho`" é o **atual**, mas sujeito
a mudança — **não cravar em `jornada-canonica.md`** ainda; todo este desenho será revisitado.
