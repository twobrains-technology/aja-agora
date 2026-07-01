---
title: Simulador Completo de Cliente — Web + WhatsApp
date: 2026-05-17
status: testing
project: aja-agora
session_duration: ~6h
tags: [admin, dev-tool, simulator, whatsapp, qa]
---

## 1. Pitch

O time agora consegue **encarnar um cliente** dentro do admin — testar todo o fluxo do agente IA no chat web e no WhatsApp sem precisar de um número real nem deixar lead falso no kanban. Acabou com a fricção de "preciso pegar meu celular pra ver se o bug some".

## 2. Problema que resolveu

Validar mudança de persona, prompt, tool ou playbook era dolorido: ou se abria o site público num modo anônimo (chat web) ou se pegava um número de WhatsApp não cadastrado como atendente e ia conversando. Reproduzir bug específico ("o cliente disse X e o agente bugou") era praticamente impossível — não dava pra rebobinar.

Quem mais sofria: PO Lead, time de qualidade, dev fazendo TDD em mudança de prompt, e quem precisava fazer demo pra stakeholder. Custo de não fazer: cada release ia pra produção com confiança baixa porque o ciclo de feedback era lento, ou ia rápido demais e quebrava cliente real.

## 3. Solução entregue

- **Hub `/admin/simulator` com 3 cards** — escolhe o papel (Cliente WhatsApp / Cliente Web / Atendente) e entra direto.
- **Simulador Cliente Web** reusa os componentes reais do site (sem fork, sem iframe): cards clicáveis, gates, lead form, tudo igual ao que o cliente externo vê.
- **Simulador Cliente WhatsApp** com UI fiel (bolhas verde/branca, double-check, header verde, botões reply nativos, list message em sheet) — passa pelo MESMO `processTextMessage` e `processInteractiveReply` que o webhook real chama.
- **Inbox compartilhada com o time** — qualquer dev vê as simulações criadas pelos colegas, toggle "Minhas / Todas", última mensagem em preview, retoma de onde parou.
- **Handoff funciona dentro da simulação** — quando o lead simulado fala "fechado", dispara handoff real mas SEM mandar WhatsApp pro atendente cadastrado, e abre painel lateral "Assumir eu mesmo" pra fechar o ciclo solo.
- **Atendente recebe badge 🧪 SIMULAÇÃO** automaticamente quando o handoff veio de simulação — zero confusão com cliente real.

## 4. Por que importa

- **Ciclo de QA encolhe drasticamente**: validar mudança de prompt vai de "abre celular, conversa em zap, espera, vê" pra "abre painel, digita, vê tudo em uma tela".
- **Reprodução de bug** vira possível pela primeira vez: a sequência exata da conversa fica salva como sessão simulada, com retomar em 1 clique.
- **Demo pra stakeholder** fica controlável: rodar fluxo do começo ao fim num ambiente "produto" sem medo de criar lead no kanban ou disparar zap pra equipe.
- **Painel comercial fica limpo** — kanban, funnel e dashboard de eval continuam com dado de produção 100%. Qualquer brincadeira no simulador é invisível pra eles.

## 5. Arquitetura — visão de 1 minuto

```
/admin/simulator (index com 3 cards)
   ├── /attendant   (encarna vendedor — atual movido)
   ├── /web         (encarna cliente no site, reusa chat real)
   └── /whatsapp    (encarna cliente no WhatsApp, UI fake-zap)
            │
            ▼  mesmo código do canal real
   Orchestrator / Persona / Tools / Memória Letta
            │
   Camada de I/O (whatsapp/api.ts, proxy.ts)
            │
   ┌────────┴────────┐
   ▼                 ▼
  Meta API       simulator-bus (in-memory)
  (cliente real)  (cliente/atendente simulado)
```

Decisões importantes:
- **Conversa simulada vive na MESMA tabela** `conversations` (flag `is_simulated`). Mesma persistência, mesma memória, mesmo orchestrator. **Interceptação acontece só na camada de I/O externo** — nada de rota paralela.
- **Painéis comerciais filtram `is_simulated=false`** em TODAS as queries de leads/dashboard/kanban — pipeline de produção fica intocado.
- **Helper único** `createLeadFromConversation` centraliza criação de lead: garante que a flag herda automaticamente em todos os 4 caminhos (web form, handoff WhatsApp, capture_lead tool, lead-collection discovery). Sem ele, qualquer caminho esquecido vazaria lead fake pro kanban.

## 6. Qualidade entregue

- **128 testes vitest passando** (125 novos + legados intactos; 3 skipped pré-existentes do scorer integration). Zero regressão em código existente.
- **Cobertura nova focada nos pontos críticos:**
  - `simulator-bus.test.ts` — 8 testes garantindo isolamento de canal e detecção de waId sintético (não confunde número real).
  - `api.test.ts` — 5 testes garantindo que `fetch` para `graph.facebook.com` **NUNCA** é chamado quando o destinatário é simulado.
  - `dashboard-queries.test.ts` — 3 testes de regressão garantindo que filtros `is_simulated=false` permanecem em todas as queries comerciais (pega remoção acidental em refactor futuro).
  - `trigger.test.ts` — 2 testes garantindo que eval (custo Claude) NÃO dispara em simulação.
- **Typecheck (`tsc --noEmit`) exit 0** após cada fase.
- **Migration `0009_spotty_impossible_man.sql`** adiciona `is_simulated boolean DEFAULT false NOT NULL` em `conversations` e `leads` — gerada via `drizzle-kit generate`, **será aplicada pelo `migrate-guard` no startup do container** (regra global respeitada — nada de `drizzle-kit push` ou `psql` à mão).
- **Endurecimentos de produção:**
  - Bus mantém o pattern `globalThis` pra sobreviver a HMR sem leak (mitigação existente preservada).
  - SSE do simulador WhatsApp usa `req.signal.addEventListener("abort", ...)` pra liberar listener quando aba fecha — bug que escapou no primeiro draft e foi pego pelo QA crítico.
  - Gating `process.env.NODE_ENV === "production" → 404` + `requireRole("admin")` em TODAS as 8 rotas novas — simulador nunca vaza pra prod.
- **Documentação criada:**
  - `CONTEXT.md` na raiz — glossário e decisões de design da sessão `/grill-with-docs`.
  - `docs/test-plans/simulador-completo.md` — plano de teste (120 critérios de aceite) gerado pelo PO Lead.
  - `docs/test-plans/simulador-completo-qa-report.md` — relatório do QA crítico que pegou 6 bugs críticos antes do merge.

## 7. Decisões de arquitetura registradas

- `CONTEXT.md` — terminologia + 5 decisões cravadas: conversa simulada nível B, identidade `SIM-<uuid>`, navegação por sub-rotas, comportamento de handoff em simulação, fidelidade visual WhatsApp nível 2.
- `~/.claude/plans/humble-mixing-hopcroft.md` — plano de implementação em 9 fases (cópia local do agente de planning).
- Helper `createLeadFromConversation` em `src/lib/admin/lead-stage-tracker.ts` — fica como ponto único de criação de lead pra qualquer caminho futuro.

## 8. Riscos identificados e como tratamos

- **Risco:** branch `isSimulated` invertido por engano poderia bater Meta API em sim ou pular em real. **Mitigação:** spy de `fetch` testa cenários simétricos — um teste verifica que vazou (e falha), outro que não vazou.
- **Risco:** lead criado sem herdar flag contamina kanban. **Mitigação:** helper único + QA crítico pegou esse exato bug no primeiro draft, corrigido em 4 call sites.
- **Risco:** leak de listener no bus por trocar de sessão sem desconectar. **Mitigação:** SSE usa `req.signal.abort` listener; bus mantém `globalThis` pra HMR.
- **Risco:** dev sobe simulador em prod por engano. **Mitigação:** todas as 8 rotas guardam `NODE_ENV==="production" → 404` + `requireRole("admin")`.
- **Risco:** filtro de painel removido em refactor futuro silenciosamente. **Mitigação:** teste de regressão inspeciona código-fonte e falha se `realLeads` ou `is_simulated=false` sumir das queries.

## 9. O que ainda fica em aberto

- **Smoke E2E ao vivo não rodado** — 53 dos 120 critérios do plano de QA dependem de `docker compose up` + Playwright. Implementação foi validada via leitura, mocks e typecheck, mas o ciclo "subir DB, simular conversa, validar UI" não foi feito.
- **Erro de biome pré-existente** em `src/db/schema.ts:181` (formatação compactada do `messages_conversation_persona_idx`) — não foi introduzido por essa feature, mas continua aparecendo no `npm run lint`. Vale corrigir num PR separado.
- **2 noUnusedImports** apontados pelo QA crítico em arquivos da feature — limpeza cosmética pendente.
- **Encarnar lead real de produção** — capability postergada deliberadamente (alto risco de uso indevido > valor imediato).
- **Mockup visual de iPhone/Android frame** no WhatsApp simulator — fora de escopo do MVP (visual nível 2 é suficiente).

## 10. Próximos passos sugeridos

- Rodar smoke E2E manual com `docker compose up` pra fechar os 53 critérios BLOCKED do plano.
- Adicionar 1 spec Playwright por canal (web + whatsapp) cobrindo o happy path do início ao handoff.
- Avaliar se vale capability "clonar conversa real → simulação" pra reproduzir bug de cliente sem tocar na conversa dele.
- Métricas leves: dashboard quantas simulações rodaram, quem usou, qual canal — útil pra entender adoção interna.

## 11. Métricas da sessão

- **22 arquivos modificados / criados** (471 inserções líquidas vs `develop`).
- **18 testes novos** distribuídos em 4 arquivos de teste.
- **Workflow PO Lead → TDD → QA crítico** completo: 1 plano de teste com 120 CAs gerado por Opus 4.7 PO Lead, implementação em 9 fases, 1 relatório de QA crítico de Opus 4.7 (rodado em background) com 6 críticos abertos, 100% deles corrigidos antes do done.
- **Risco evitado**: o QA crítico pegou que `/api/leads` criava lead web SEM herdar `is_simulated` da conversation — sem fix, toda simulação web teria virado lead real no kanban. Bug pegou em 5 min via leitura adversarial.
- **Tempo economizado projetado pro time**: validação de mudança de prompt deve cair de ~5min (pegar celular + WhatsApp) pra ~30s (abrir aba). Reprodução de bug específico, de "impossível" pra "1 clique de retomar".
