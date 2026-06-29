# Away — Lançar 3 features da jornada (documentos, fechamento Trilho B, chat-mesa) via todo-blocks

- **Início:** 2026-06-28 15:35 · **Sessão:** aja-agora/develop
- **Critério de pronto:** 3 blocos especificados (cards FIX-NN + _bloco.md + _prompt.md) + base `integ/` criada + onda 1 disparada no Superset + (quando os blocos terminarem) integrados na base com gate verde (quarentena os que falharem). NÃO levar pra develop (decisão D1).
- **Status:** EM ANDAMENTO — develop DESBLOQUEADA/verde (D7); 2 blocos travaram, re-lançando (D8)

## Objetivo
Lançar como blocos paralelos (todo-blocks) as 3 features alinhadas nesta sessão:
1. **Gestão de documentos do cliente** — S3 nosso (bucket dedicado+SSE-KMS) + tabela `client_documents` + aba Documentos no Kanban + despacho desacoplado. Design: `docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md`.
2. **Fechamento via Trilho B** — `BeviSelfContractProposalGateway implements ProposalGateway`, env `PROPOSAL_GATEWAY=selfcontract`, KYC steps + waitingForUniqueCode no self-contract-client; reusa a proposta de descoberta. Desbloqueia o fechamento (Trilho A travado pela AGX).
3. **Chat da mesa no Kanban → WhatsApp oficial** — `sendTemplate` (HSM), controle de janela 24h (`lastInboundAt`), chat bidirecional no lead-detail-panel, fluxo template-quando-janela-fechada. WhatsApp já é Meta Cloud oficial.

## Decisões

### D1 · 15:35 — develop=NÃO, onda=paralelo-com-stub (pergunta dispensada → fallback recomendada)
- **Contexto:** todo-blocks pergunta "levar a base pra develop?" e estratégia de onda. Kairo saiu; AskUserQuestion dispensada no Notch (sem resposta).
- **Decidi:** (a) NÃO levar pra develop — integro na base `integ/` e deixo pra revisão (3 features grandes, não-validadas E2E, com dependências externas). (b) Onda única paralela: fechamento-B consome o despacho de documentos via STUB com `TODO(bloco-a)` (nível 3); docs↔chat-mesa tocam schema/lead-detail em regiões diferentes (nível 2, merge mecânico).
- **Alternativas:** levar pra develop (arriscado sem revisão); faseado (serial, mais lento).
- **Reversibilidade:** fácil (a base não vai pra develop sem o Kairo).
- **Evidência:** fallback anti-trava do to-saindo §3.1.

### D2 · 15:42 — push da develop pro origin (necessário: Superset forka do remoto)
- **Contexto:** o `setup-base` faz `git fetch origin` e o Superset forka de **origin/develop**, que estava 13 commits atrás (revert FIX-79, matching, designs, blocos). Sem push, os agentes trabalhariam em código velho e sem os blocos.
- **Decidi:** `git push origin develop` (fast-forward limpo: 13 ahead / 0 behind; sem PII no diff). Resolve também o "push que não chegou".
- **Alternativas:** não pushar e torcer pra base carregar os commits locais (NÃO funciona — Superset forka do remoto).
- **Reversibilidade:** difícil (push), mas dev-safe (não-prod, deploy dev é o fluxo normal). to-saindo §4 libera push de develop dev-safe.
- **Evidência:** `2807722a..6b1ff837 develop -> develop`.

## ⚠️ PENDENTE-KAIRO

### ✅ RESOLVIDO · 15:42 — push da develop (era PENDENTE) → feito em D2.

### ⚠️ PENDENTE-KAIRO · 15:35 — dependências externas das 3 features (código será implementado; o externo fica pra você)
- **Documentos:** bucket S3 dedicado + KMS key + policy de acesso mínimo (IaC, dev/prod). Molde: `aja-administradora-docs`. O bloco implementa o código (usa MinIO local em dev); a provisão prod é tua.
- **Chat-mesa:** template HSM precisa ser CRIADO/APROVADO na Meta Business pra reabrir janela. O bloco implementa `sendTemplate` + a lógica; o template aprovado é externo.
- **Fechamento B:** validar ao vivo o step de upload de doc do self-contract (portal CONEXIA/documentsToken) — o bloco implementa contra o cookbook + stub do despacho de docs; ajuste pós-validação.

### D3 · 15:58 — LANÇAMENTO PAUSADO: outra sessão Claude editando o working tree principal (race)
- **Contexto:** preparei os 3 blocos (bloco-a/b/c, FIX-82..89) e criei a base `integ/jornada-pos-descoberta`. No dry-run apareceram 4 blocos PRÉ-EXISTENTES no `todo/` (backlog do inbox qa-noturno: funil, artifacts[SEGURADO/Bernardo], infra-teste, chat-render) usando FIX-82..94 → **colisão** com os meus. Ao diagnosticar, descobri que **OUTRA sessão Claude renumerou os antigos** (→ bloco-e/f/g/h, FIX-90..102) no MESMO working tree principal (mudanças staged não-commitadas, timestamp 15:54), + 2 `done/` modificados. `ps` confirma várias instâncias `claude --dangerously-skip-permissions` ativas.
- **Decidi:** PAUSAR o lançamento. NÃO commitar/lançar competindo no working tree (risco de corromper o trabalho da outra sessão). NÃO toquei as mudanças staged dela (não fiz restore/reset). Registro sem commitar pra não mexer no git/index enquanto ela atua.
- **Alternativas:** lançar mesmo assim (race → corrupção possível); reverter as mudanças dela (apagaria trabalho que não é meu — proibido).
- **Reversibilidade:** n/a (não executei a ação de risco).
- **Estado preparado e pronto pra retomar:** 3 blocos especificados (cards+manifestos+prompts, commitados em 6b1ff837/cb74a11b, no remoto); base `integ/jornada-pos-descoberta` criada (worktree `~/.superset/worktrees/ac2f26b2-.../integ/jornada-pos-descoberta`). Pós-renumeração da outra sessão NÃO há colisão (meus 82-89, antigos 90-102).

## ⚠️ PENDENTE-KAIRO · 15:58 — sessões Claude concorrentes no working tree principal
- **O que é:** ao menos 2 sessões editando `/Users/kairo/code/aja-agora` (a minha + a que renumerou os blocos do inbox). Não sei se você abriu a outra de propósito (organizar o backlog do inbox em paralelo) ou se é resíduo.
- **Por que não segui:** lançar a onda exige commitar o `todo/`, que carregaria as mudanças staged da outra sessão — competir no git/working tree compartilhado é blast-radius alto.
- **Como destrava (escolha uma):** (a) você confirma que a outra sessão terminou → eu commito o estado coerente (já sem colisão) e lanço os 3 blocos meus; (b) você diz qual sessão deve lançar o quê (evita lançar 2x); (c) isolar: cada feature num worktree próprio antes de lançar.

## Linha do tempo
- 15:35 — to-saindo + todo-blocks ativados; mapas concluídos; diário criado.
- 15:42 — D2: push da develop (sync remoto, fast-forward).
- 15:50 — 3 blocos especificados (FIX-82..89) + base `integ/jornada-pos-descoberta` criada; dry-run OK (6 workspaces onda-1 visíveis).
- 15:58 — D3: detectada colisão FIX-NN + outra sessão renumerando os antigos no working tree principal → **lançamento PAUSADO** (race). Aguardando o Kairo.

### D4 · 16:10 — destravado (Kairo: opção a) → commit coerente + 3 blocos lançados
- **Contexto:** Kairo confirmou que a outra sessão terminou (mudanças staged-e-paradas). Liberou commitar e lançar só os 3 meus (NÃO o bloco-f-artifacts, SEGURADO/Bernardo; NÃO os antigos e/g/h).
- **Decidi:** `git add -A` + commit `a06ab52a` (absorve renumeração dos antigos + meus 3 blocos, sem colisão) + push develop. Atualizei a base via `merge --ff-only origin/develop`. Lancei só os 3 meus com `launch-blocks --block` (3x, pois o script aceita 1 filtro por vez).
- **Evidência:** commit `a06ab52a`; workspaces criados: feat-documentos-cliente-s3 `26738398`, feat-chat-mesa-whatsapp `1a4da40c`, feat-fechamento-trilho-b `6e1fdc84` (todos `open` forçado).
- **PENDENTE-KAIRO de sessões concorrentes:** RESOLVIDO (Kairo confirmou).

## Linha do tempo (cont.)
- 16:10 — D4: commit a06ab52a + push develop + base atualizada + 3 workspaces lançados e abertos no Superset. Agentes implementando (forka de integ/jornada-pos-descoberta).

## Próximo passo (orquestrador — notch me re-invoca; NÃO agendo wakeup)
Os 3 agentes rodam ~20-60min, depois push + tag `block-done/<branch>`. Quando retomar:
```
cd /Users/kairo/.superset/worktrees/ac2f26b2-a2ba-4148-96b8-47b55f0dd5ad/integ/jornada-pos-descoberta
merge-wave.sh poll  --wave 1 --block bloco-a-documentos-cliente --block bloco-b-chat-mesa-whatsapp --block bloco-c-fechamento-trilho-b   # repetir até all_terminal
merge-wave.sh merge --wave 1 --target integ/jornada-pos-descoberta   # gate por bloco; quarentena o que reprovar
```
⚠️ Escopar poll/merge SÓ aos 3 meus (--block) — os antigos e/g/h NÃO foram lançados; sem filtro o poll espera por eles pra sempre.
Finalização: `finish-wave.sh jornada-pos-descoberta` (SEM --to-develop — decisão D1: base fica pra revisão do Kairo).

### D6 · 18:00 — BLOQUEIO: develop quebrada + onda travada pelo drizzle meta (blast-radius, não mexi)
- **Contexto:** retomei (Kairo: "resolva tudo, se vire, qa-autonomo assim que mergeado"). Achei: o notch/outra sessão integrou meu chat-mesa direto na develop (`09b30d63`), mas `test:unit` está VERMELHO (12 falhas: `last_inbound_at` não existe). O chat-mesa adicionou a coluna no schema SEM migration — porque `db:generate` está quebrado (collision: snapshots `0011/0012/0013` com mesmo id `d12d60bd`). Caos pré-existente (FIX-81/bloco-g/FIX-100).
- **Decidi NÃO executar** (blast-radius): (a) consertar o meta do drizzle (regenerar cadeia de snapshots — erro corrompe TODAS as migrations); (b) `db:push`/ALTER manual (❌ regra de migrations); (c) reverter o chat-mesa da develop (race com o notch + reverte feature). Nenhum caminho seguro desbloqueia sem o Kairo.
- **Diagnóstico + correção encaminhada:** card `docs/correcoes/inbox/2026-06-28-develop-quebrada-drizzle-meta-bloqueia-onda.md`.
- **Impacto:** a onda INTEIRA está bloqueada — documentos (tabela client_documents) e fechamento também precisam de migration que não gera. O app/DB de dev está sem a coluna → qa-autonomo não roda verde.

## ⚠️ PENDENTE-KAIRO · 18:00 — desbloquear migrations (drizzle meta) antes de integrar a onda / rodar qa-autonomo
- **O que é:** `db:generate` quebrado (snapshots 0011-0013 id duplicado) bloqueia TODA mudança de schema. develop vermelha (chat-mesa). É o escopo do bloco-g/FIX-100 (NÃO lançado por mim — backlog inbox).
- **Como destrava (escolha):** (a) consertar/regenerar o meta do drizzle (você ou autoriza eu a mexer); (b) priorizar/lançar o bloco-g-infra-teste (FIX-100) que trata do migrate-guard/drift; (c) reverter o merge do chat-mesa da develop (volta a 0027, verde) e re-integrar quando o drizzle voltar.
- **Por que não fiz:** migrations = blast-radius; mexer no meta sozinho à noite pode corromper tudo. Diagnóstico e caminho prontos.

### D7 · 18:15 — DESBLOQUEIO: develop verde (migration 0028 à mão + window.ts)
- **Decidi (autorizado pelo Kairo):** o conserto do meta (reconstruir 14 snapshots) é grande/blast-radius, MAS descobri o padrão real do projeto: as migrations 0014-0027 são TODAS escritas À MÃO (a própria 0027 documenta: "db:generate quebrado; migrate usa journal+sql"). Então escrevi a **migration 0028 à mão** (last_inbound_at) + entry no journal — dentro do padrão, NÃO mexi nos snapshots corrompidos.
- **Validação:** criei DB temp fresco → `db:migrate` aplicou 0000-0028 limpo (✓) → renomeei o temp pra aja_agora (o DB de dev estava sujo via push, __drizzle_migrations dessincronizado). Reescrevi `window.ts` (require→import ESM, db singleton, `eq()` — o agente do chat-mesa tinha escrito com require de alias + API drizzle errada) e `window.test.ts`. **Suíte verde: 1939 testes.** Commit `9e1b7711`.
- **Reversibilidade:** o conserto do meta (snapshots) NÃO foi feito — segue PENDENTE-KAIRO/bloco-g (db:generate continua quebrado; migrate funciona).

### D8 · 18:18 — documentos + fechamento TRAVARAM (re-lançando com prompt corrigido)
- **Contexto:** após ~2h, os blocos documentos (0 trabalho) e fechamento (só o ADR) NÃO produziram código nem tag/branch — travaram cedo (provável keep-alive do notch). E ambos mudam schema → quebrariam a develop igual ao chat-mesa (db:generate quebrado).
- **Decidi:** corrigir o atrito na FONTE — os _prompt.md dos blocos diziam "migrations via drizzle-kit" (errado; o generate está quebrado). Troquei pela instrução de **migration à mão** (padrão do projeto: escrever .sql + journal entry, validar com db:migrate + test:unit). Re-lançar os 2.
- **Keep-alive:** dos re-lançados é do notch app (não meu controle). Se re-travarem, é o notch/ambiente.

## Lição de FLOW (a registrar quando destravar)
todo-blocks/launch NÃO verifica se `db:generate` roda ANTES de lançar blocos que mudam schema → blocos sobem incompletos (sem migration) e quebram a develop ao integrar. Melhoria: gate de `db:generate` limpo no launch-blocks/merge-wave pra blocos com mudança de schema.

## Relatório final
- **Resultado vs critério de pronto:** BLOQUEADO/PARCIAL. Feito: 3 blocos especificados (FIX-82-89) + base criada + onda lançada; chat-mesa integrado na develop pelo notch (mas quebra os testes); documentos+fechamento ainda rodando. NÃO feito: develop verde, integração limpa da onda, qa-autonomo — TUDO travado pelo drizzle meta (blast-radius).
- **Revisar primeiro:** D6 + card `develop-quebrada-drizzle-meta-bloqueia-onda` (decisão crítica). D3/D4 (race de sessões).
- **Próximos passos (após desbloquear o drizzle):** gerar migrations 0028 (last_inbound_at) + 0029 (client_documents) etc; `test:unit` verde; poll→merge dos 3 (escopado --block); só então qa-autonomo. PENDENTE-KAIRO externos: bucket+KMS (docs), template Meta HSM (chat-mesa), step-doc do B ao vivo (fechamento).
- **Status:** BLOQUEADO (aguardando decisão do Kairo sobre o drizzle meta).

## Re-lançamento (D8 cont.) · 18:25
- Deletei os 2 workspaces travados + re-lancei com prompts corrigidos (migration à mão):
  - feat-documentos-cliente-s3 → b2ca89aa-b20d-4bd1-b14b-2a3cf9d1a7b1
  - feat-fechamento-trilho-b → 6370ac62-11c2-4c52-b74f-d0a13310eae9
- Keep-alive dos agentes = notch app. Quando terminarem (push + tag block-done), integrar
  (escopado --block) e — ATENÇÃO — conferir/completar a migration à mão de cada um (client_documents
  no documentos), senão re-quebram a develop como o chat-mesa. Só então qa-autonomo.

### D9 · 18:40 — modelo errado nas sessões Superset → onda de revisão (Opus)
- **Contexto:** Kairo apontou que TODAS as sessões Superset rodaram com modelo errado (bate com os bugs bobos do chat-mesa: require de alias, API drizzle inventada, migration esquecida). Investiguei: preset `claude` roda `claude` SEM --model (herda o default do Claude Code), não-editável via CLI (só app). Default atual = opus[1m]. Sem override no projeto/worktrees/env.
- **Decidi (com Kairo):** ele já REMOVEU o agent/preset errado no Superset (fonte corrigida → opus[1m]). Paro os 2 re-lançados (modelo errado) — FEITO (deletados). Lanço uma onda todo-blocks de REVISÃO+correção de tudo que entrou com modelo errado, agora com Opus.
- **Escopo (Kairo):** TUDO que entrou na develop com modelo errado (não só a onda jornada).
- **Reversibilidade:** média (correções vão pra base de revisão, gate antes da develop).

### D10 · 19:05 — onda de REVISÃO disparada (5 blocos, Opus, escopados)
- **Contexto:** modelo errado nas sessões Superset (D9). Fonte corrigida pelo Kairo (removeu o agent errado → default opus[1m]). Lancei a onda de auditoria adversarial.
- **Partição (decisão técnica):** 5 blocos por área funcional — A agente-núcleo, B jornada-Bevi, C mesa-kanban, D whatsapp-chat, E fundação-UI (único dono de schema/drizzle; absorve PENDENTE-REV-E dos outros + reconstrói o meta do Drizzle / bloco-g-FIX-100).
- **Mecânica:** base `integ/revisao-modelo-errado` (ws 5b1b0710) forkada da develop verde. `launch-blocks` NÃO acumula múltiplos `--block` (usa o último) e os blocos pendentes a/b/c/e/g/h são onda:1 → lancei os 5 rev-* UM A UM com `--block` pra não tocar os pendentes.
- **Workspaces:** rev-agente-nucleo 8e862b3f · rev-jornada-bevi 0bd1c934 · rev-mesa-kanban 0cc43df1 · rev-whatsapp-chat a4dc8fae · rev-fundacao-ui 9b9e82e5. Todos `open`.
- **Prompt:** cada revisor (Opus) roda checklist adversarial (imports/alias-require, APIs de lib inventadas via context7, lógica, regras CLAUDE.md, testes, segurança), TDD strict por bug, push da branch rev/*. NÃO PR/merge/deploy.
- **Próximo (orquestrador/notch):** `merge-wave.sh poll --wave 1 --block bloco-rev-{a..e}` até all_terminal → `merge --target integ/revisao-modelo-errado` (gate por bloco) → decisão de levar pra develop (PENDENTE: perguntar ao Kairo no fim) → qa-autonomo.
- **Reversibilidade:** média (correções vão pra base com gate; develop só recebe merge final aprovado).

### D11 · 19:15 — Kairo autorizou develop + qa-autonomo (autônomo)
- **Decidi (Kairo):** finish-wave `--to-develop` = SIM; rodar qa-autonomo assim que a revisão integrar — sem nova pergunta.
- **Mecânica do poll:** merge-wave `--block` não acumula e os blocos pendentes (a/b/c/e/g/h) são onda:1 → orquestro a conclusão por `git ls-remote --tags origin | grep block-done/rev-*` (5 tags = pronto) e faço `merge --block` individual por bloco.
- **Estado 19:15:** 2/5 terminaram (rev-jornada-bevi, rev-whatsapp-chat) — rápido demais, inspecionando qualidade. Faltam rev-agente-nucleo, rev-mesa-kanban, rev-fundacao-ui.

### D12 · 00:10 — onda de revisão INTEGRADA na develop (gate verde)
- **Merge:** os 5 rev-* no working tree principal (tem node_modules → gate roda de verdade; a base do Superset não tem, e o gate auto-detectado puxava typecheck whole-repo já vermelho).
- **Conflito** (esperado) em `route.ts` do chat do operador: mesa-kanban × whatsapp-chat ambos corrigiram o waId. Resolvido pela versão **mesa-kanban** (limpa: Response.json + conv.waId + requireRole); descartada a do whatsapp-chat (NextResponse sem import → quebraria). Adaptei o teste `send-to-waid` à versão vencedora (mock requireRole + db.select).
- **Gate:** `test:unit` 1981 verde; suíte completa em **série** 2156 verde. Em paralelo, 1 flaky (`resolve.integration`) por contaminação de DB entre workers → card no inbox (`2026-06-29-testes-integracao-contaminam-em-paralelo.md`), não-bloqueante (código correto, arquivo intocado pela revisão).
- **Resultado:** ~24 bugs reais corrigidos (2 de segurança: CRUD admin-only; HARD_RULES no bundle/500 prod; sendTemplate HSM return morto; waId; normalizePhoneBR DDD 55; meta do Drizzle reconstruído = FIX-100; muita ortografia PT-BR).
- **Próximo:** limpar workspaces (5 rev + base) + qa-autonomo.
