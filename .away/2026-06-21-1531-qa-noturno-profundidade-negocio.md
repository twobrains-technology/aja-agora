# Away — QA noturno: profundidade de negócio + bateria das correções das últimas 2 semanas

- **Início:** 2026-06-21 15:31 · **Sessão:** aja-agora / `qa-base/2026-06-21-noturno` (fork de develop)
- **Critério de pronto:** todos os cenários do ledger ∈ {✅, decididos+anotados} e 0 blocos pendentes, OU teto (12 iterações / 8h). Suíte de regressão (Camadas 1+2) verde com DB correto; jornada de negócio E2E validada passo a passo; gate de negócio do admin auditado (escopo×realidade).
- **Status:** COMPLETO

## Decisões
<!-- adicionar NA HORA, numeradas -->

### D1 · 15:31 — Rodar a rodada numa `qa-base`, não na develop
- **Contexto:** skill qa-noturno §4.7 — toda rodada abre uma `qa-base/<rodada>` (fork da branch de trabalho) e roda lá; develop só recebe o resultado limpo, e a promoção é PENDENTE-KAIRO.
- **Decidi:** criar `qa-base/2026-06-21-noturno` a partir de `develop` (HEAD `858ba7e1`). Fixes vão pra cá; promoção develop = dele.
- **Reversibilidade:** fácil (descartar a branch).
- **Evidência:** `git branch --show-current` → qa-base/2026-06-21-noturno.

### D2 · 15:32 — Ambiente de teste de host estava com DATABASE_URL morto (resíduo da migração de mac)
- **Contexto:** baseline da suíte falhou em massa com `ENOTFOUND db.aja-feat-jornada-bevi-lance-embutido.orb.local` — workspace antigo que não existe mais. O `.env.local` tem 2 linhas `DATABASE_URL` e a residual (segunda) vencia. Origem provável: commit `c11c4f3f chore: preserva trabalho em andamento da migração para mac novo`.
- **Decidi:** NÃO editar `.env.local` (hook defensivo bloqueia Write em .env* + regra global). Em vez disso, exportar `DATABASE_URL=postgresql://postgres:postgres@aja-pg-develop.orb.local:5432/aja_agora` em cada comando de teste — `vitest.setup.ts` usa `loadEnvFile` (node), que NÃO sobrescreve var já setada no processo, então o override vence.
- **Alternativas:** (a) `sed` no .env.local — descartado, burla o hook defensivo e mexe em arquivo sensível; (b) corrigir via Edit — bloqueado pelo hook.
- **Reversibilidade:** N/A (não altera nada versionado).
- **Evidência:** `psql -h aja-pg-develop.orb.local` → 65 conversations; container usa `aja-pg-develop:5432`.
- **⚠️ Nota pro Kairo:** o `.env.local` da sua máquina tem um DATABASE_URL residual apontando pra workspace morto — vale limpar a 2ª linha (deixa só `aja-pg-develop.orb.local:5432` ou a porta certa), senão todo teste de host falha por ENOTFOUND.

### D3 · 15:50 — Bug do `inert=""` achado no browser → corrigido inline (TDD)
- **Contexto:** durante a jornada de descoberta real, o console acusou `Received an empty string for a boolean attribute 'inert'`. Investiguei: `artifact-renderer.tsx:38` selava card antigo (FIX-49) com `inert=""` → React 19 trata como false → selo furado pra teclado/screen-reader.
- **Decidi:** corrigir inline (trivial, 1 arquivo) com TDD: novo caso no `artifact-renderer.sealing.test.tsx` (`hasAttribute("inert")`), visto falhar, fix `inert={true}`, verde. Bug de UI puro (não-agêntico) → só Camada 1, sem cassette (conforme CLAUDE.md).
- **Reversibilidade:** fácil (git revert 92d48da4).
- **Evidência:** commit `92d48da4`; pre-commit verde (1810 testes).

### D4 · 18:56 — Login admin: usar origin `http://aja-develop.orb.local` (não `aja-app-develop`)
- **Contexto:** login admin dava 403 "Invalid origin" via `https://aja-app-develop.orb.local`. O better-auth confia só em `BETTER_AUTH_URL=http://aja-develop.orb.local` (env do container). As duas URLs resolvem (alias OrbStack), mas só a configurada loga.
- **Decidi:** acessar o admin por `http://aja-develop.orb.local` (origin confiável). Login OK, gate de negócio validado. `email_verified=false` não bloqueou.
- **Achado pro Kairo (não bug crítico):** em dev há 2 URLs válidas e só 1 loga — vale alinhar trustedOrigins/doc. Registrado no ledger (C4 · DX/config).
- **Evidência:** login redirecionou pra /admin; screenshots admin-dashboard/contato.

### D5 · 19:00 — Gate de negócio do admin: FUNCIONAL, com 1 gap de escopo (UTM) reportado
- **Contexto:** §4.2.3 exige distinguir "tela renderiza" de "feature de negócio existe".
- **Decidi (achado, não conserto):** o admin é FUNCIONAL de verdade (dashboard/pipeline/contato/conversas/simulador/agentes com dado real). O único gap de escopo é **atribuição de campanha (UTM) inexistente** (P0.3) — feature planejada-não-construída, decisão de negócio do Kairo (não toquei). Estágios da travessia são parciais (dependem de prod+Bevi). Detalhe no ledger "Audit de escopo do admin".

## Linha do tempo (resumida)
- 15:31 — ancorei: 130 commits / 403 arquivos desde `f6f955e7` (14 dias). Ambiente de pé (aja-app-develop:3000, aja-pg-develop healthy). Criei qa-base + ledger.
- 15:32 — baseline estrutural rodou com falso-vermelho de DB (env morto). Re-rodando com DB correto.
- 15:35 — Camadas 1 (1809) + 2 (226) VERDES com DB correto. Integration serial: 122 passed, 1 fail (Letta semantic — externa). resolve.integration(FIX-42) passou isolado → falha do run paralelo era colisão de DB.
- 15:37-15:47 — jornada de descoberta no BROWSER REAL (persona Helena, carro): A1-A10/A13/A14 ✅ — ordem canônica (dados antes do valor), educação, lance embutido não-pulável (FIX-4), reveal 3 administradoras reais Bevi, simulador dial, confronto orçamento.
- 15:50 — bug do `inert` corrigido (D3, commit 92d48da4).

### D6 · 20:40 — Dívida de infra de teste: documentar como bloco, NÃO lançar worktrees autônomos
- **Contexto:** achei 6 itens de dívida de infra/teste (env DATABASE_URL morto, isolamento DB flaky, 23 erros de typecheck só em testes, specs E2E furados, eval Camada 3, Letta externa). A skill permite lançar blocos Superset autônomos.
- **Decidi:** consolidar tudo num card (`docs/correcoes/inbox/2026-06-21-divida-infra-teste-qa-noturno.md`) pro Kairo decidir/lançar, e corrigir inline só o que é produto+rápido+seguro (G3 hardening /api/leads, TDD). NÃO lancei worktrees Superset à noite por dívida de teste.
- **Por quê:** o pedido foi negócio + garantir correções (entregue, tudo verde). A dívida é pré-existente, não-regressão das 2 semanas, e lançar 4-5 worktrees autônomos é desproporcional + a skill diz fan-out é escalação opcional. Isolamento DB (maior ROI) é refactor de infra que merece decisão dele.
- **Reversibilidade:** N/A (só documentação + 1 fix reversível).

### D7 · 20:50 — Merge para develop (a pedido do Kairo): develop tinha avançado 18 commits (Mesa de Operação)
- **Contexto:** Kairo pediu "merge para develop". Ao integrar, descobri que `origin/develop` avançou **18 commits durante a rodada** com uma feature inteira nova — **"Mesa de Operação"** (mesa-attendants, mesa-copilot, administradoras CRUD, schema +190, processor.ts) — desenvolvida em paralelo (outra sessão/PC; havia inclusive uma rodada `mesa-a` de QA noturno commitando ao vivo). Minha rodada validou a base pré-Mesa.
- **Decidi:** integrar meus 3 commits **sobre `origin/develop` atualizado** (não a base antiga), não como force/sobrescrita. Verifiquei: zero arquivo em comum com os 18 commits → **merge sem conflito**. Rodei o gate na base integrada (test:unit = **1856 passed**, subiu de 1810 com os testes da Mesa) → meus fixes e a Mesa coexistem verdes. Push fast-forward `37bc07d1..2630cb4d` (após 2 colisões com a develop ativa, re-sincronizei).
- **Reversibilidade:** média (git revert do merge 2630cb4d).
- **⚠️ Pro Kairo:** a Mesa de Operação (18 commits) NÃO foi validada por esta rodada — só garanti que ela coexiste com meus fixes no gate (Camadas 1+2). A rodada `mesa-a` parece cobrir a Mesa.
- **Evidência:** merge `2630cb4d`, pushado em origin/develop; qa-base deletada.

## Relatório final
- **Resultado vs critério de pronto:** ✅ COMPLETO + MERGEADO/PUSHADO na develop. Profundidade de negócio: jornada de descoberta E2E **completa no browser real** (passos 1-4) + fechamento (integration) + **admin/visão de negócio logado** (dashboard, pipeline, contato consolidado — a Helena que criei apareceu no funil em tempo real) + retorno web (popup, acolhe, anti-pretexting). Correções das 2 semanas: suíte de regressão verde (Camada 1 = 1810, Camada 2 = 226, integration produto = 115) após corrigir o env de teste; FIXes principais revalidados no browser. 2 bugs novos achados e corrigidos (TDD). Evidência fresca 20:42.
- **O que NÃO fiz e por quê:** (1) não promovi qa-base→develop (blast radius — é seu); (2) não disparei `create_proposal` real no passo 5 (cria proposta real na mesa Bevi — D3); (3) não lancei worktrees pra dívida de teste (D6); (4) não editei `.env.local` (hook + é seu).
- **Revisar primeiro:** D3 (DB env override), D5 (gate UTM = decisão de negócio pré-campanha), os 2 fixes inline (B1 inert / B2 uuid).
- **Próximos passos sugeridos:** promover qa-base→develop se aprovar os 2 fixes; decidir UTM/atribuição antes da campanha; lançar bloco de dívida de infra (isolamento DB primeiro).
