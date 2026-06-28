# Away — Lançar 3 features da jornada (documentos, fechamento Trilho B, chat-mesa) via todo-blocks

- **Início:** 2026-06-28 15:35 · **Sessão:** aja-agora/develop
- **Critério de pronto:** 3 blocos especificados (cards FIX-NN + _bloco.md + _prompt.md) + base `integ/` criada + onda 1 disparada no Superset + (quando os blocos terminarem) integrados na base com gate verde (quarentena os que falharem). NÃO levar pra develop (decisão D1).
- **Status:** EM ANDAMENTO

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

## Relatório final (preencher ao encerrar)
- **Resultado vs critério de pronto:** PARCIAL — 3 blocos especificados + base criada + onda 1 lançada (3 workspaces rodando). Falta: integração na base (poll→merge) quando os agentes terminarem.
- **Revisar primeiro:** D3/D4 (race de sessões concorrentes — resolvido com aval do Kairo) e os specs dos 3 blocos antes do merge.
- **Próximos passos:** poll→merge dos 3; revisar a base integ/jornada-pos-descoberta; decidir levar pra develop. PENDENTE-KAIRO externos: bucket+KMS (docs), template Meta HSM (chat-mesa), step-doc do B ao vivo (fechamento).
