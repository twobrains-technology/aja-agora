# Diário — subir develop → main, smoke em prod, checar env do ECS

- **Início:** 2026-07-13 19:09 · **Sessão:** aja-agora/develop
- **Critério de pronto:** develop→main promovido e deploy de prod passando; smoke confirmando prod funcional; env do ECS auditada contra o padrão TwoBrains AWS sem gap; Kairo avisado ao final.
- **Status:** PARCIAL

## Decisões

### D1 · 19:15 — Build de prod quebrado: causa raiz e fix
- **Contexto:** ao investigar antes do merge, achei os 2 últimos deploys de `main` (hoje 22:06 UTC e ontem 00:55 UTC) falhando no `pnpm build` dentro do Docker — prod nunca recebeu a imagem nova, ficou rodando código antigo silenciosamente.
- **Decidi:** corrigir 3 causas independentes de drift de tipo: (1) `userIntentEnum` espelhado em `persona.ts`/`diagnose/types.ts` sem `"confused"` (FIX-301 não propagado); (2) `buildComparisonTableFromRevealGroups` tipava `knownCreditValueByGroupId` como `ReadonlyMap<string, number>` em vez de `KnownGroupValue` (resíduo de merge, FIX-287/292); (3) o AI SDK instalado (6.0.184) unificou o chunk `tool-input-error` dentro de `tool-error` — fundi os dois `case` distinguindo via `InvalidToolInputError.isInstance()`, preservando o comportamento original de cada fix (FIX-257 não aborta, FIX-262 aborta).
- **Alternativas:** deletar o case morto sem distinguir os dois cenários — descartado por perder o comportamento "não aborta" de erro de validação recuperável (FIX-257), que é diferente de "aborta" pra tool inexistente (FIX-262).
- **Reversibilidade:** fácil (git revert).
- **Evidência:** commit `2a85c1aa`; validado com `docker build --target builder` (replica exatamente o passo que falhava no GHA) + `pnpm test:unit` (374 arquivos / 3456 testes verdes).

### D2 · 19:36 — Promoção develop → main via PR (não push direto)
- **Contexto:** develop só tinha 1 commit de diferença pra main (doc de encerramento do /goal anterior) + o fix do D1.
- **Decidi:** seguir o padrão já estabelecido no repo (PR develop→main com merge commit, não squash) — é como as ~15 promoções anteriores foram feitas (ver `git log origin/main`).
- **Reversibilidade:** média (revert do merge commit).
- **Evidência:** PR #52, merge commit `8362fdf3`, deploy GHA run `29290414393` passou (build 4m55s, rollout ECS `COMPLETED`).

### D3 · 19:45 — Env do ECS: achei bucket S3 inexistente em uso
- **Contexto:** `S3_BUCKET`/`S3_CLIENT_DOCS_BUCKET`/`S3_REGION`/`S3_CLIENT_DOCS_KMS_KEY_ID` não existiam em nenhum dos dois secrets (`tb/dev/aja-agora/env`, `tb/prod/aja-agora/env`). O código cai pro default hardcoded (`aja-administradora-docs`/`aja-client-docs`, região `us-east-1`), que **não é** o nome real dos buckets provisionados (`aja-agora-docs-{dev,prod}` / `aja-client-docs-{dev,prod}`, `sa-east-1`) — upload de documento (RG/CNH, docs de administradora) provavelmente falhava com `NoSuchBucket`.
- **Decidi:** corrigir as 4 vars nos dois secrets via `tb-update-env.sh --no-redeploy` (prod pegou o valor no mesmo rollout do deploy do D1/D2; dev não redeployou — pega na próxima subida).
- **Alternativas:** mudar o default hardcoded no código em vez de setar env — descartado porque o padrão do projeto (comentário em `src/lib/storage/index.ts`) já é "config por env", e mudar o default esconde o problema de novo se outro projeto reusar o mesmo código.
- **Reversibilidade:** fácil (são só 4 chaves aditivas no secret, nunca existiram antes).
- **Evidência:** `aws s3api list-buckets` confirmou os nomes reais; `tb-update-env.sh --diff` mostrou "não existe → ***" pras 4 chaves nos dois ambientes; `tb-update-env.sh` retornou "secret atualizado" nos dois.

### ⚠️ PENDENTE-KAIRO · 19:50 — Worker de proposta (FIX-44/207) nunca rodou em nenhum ambiente
- **O que é:** o worker de background que reconcilia o status da proposta com a Bevi/mesa (`reconcileProposalStage`, raia forward-only) e o watchdog de re-engajamento do funil (`gate-reengage-poll`) — código existe (`scripts/proposal-worker.ts`, `pnpm worker:proposal`) mas **nunca foi deployado**: `REDIS_URL` não existe em nenhum dos dois secrets, e a task definition do ECS (`aja-agora-prod:10`) só tem 1 container (`aja-agora`, sem `command`/`entryPoint` custom) — nada roda o worker. Na prática a raia do lead nunca avança sozinha por status real da Bevi, e leads abandonados nunca auto-marcam `perdido` (14 dias, `PERDIDO_INACTIVITY_DAYS`).
- **Por que não fiz:** decisão de infra/topologia em prod (novo container/service + secret novo) — blast radius alto, fora do escopo literal do goal ("cheque se não falta env", não "adicione feature de infra nova"). Achei um Redis compartilhado já existente (`tb-redis`, ElastiCache, `sa-east-1`) que reduziria o custo de provisionar, mas ainda exige decisão de desenho (mesmo container via supervisor? novo ECS service dedicado?).
- **Como destrava:** decidir o desenho (container único com supervisor rodando `node server.js` + `tsx scripts/proposal-worker.ts`, OU ECS service separado `aja-agora-worker-prod`), setar `REDIS_URL` apontando pro `tb-redis` (ou instância dedicada) nos dois secrets, atualizar a task definition/compose, redeploy.

### ⚠️ PENDENTE-KAIRO (resolvido em parte) · 19:57 — Smoke visual via browser bloqueado
- **O que é:** a extensão `claude-in-chrome` não conectou durante toda a sessão ("Browser extension is not connected"), confirmado 3x (direto e via subagent). Rodei `~/.claude/skills/fix-claude-chrome/scripts/fix-claude-chrome.sh` (não dry-run) — matou processo stale, limpou storage/pareamento, reabriu o Chrome.
- **Por que não fiz o smoke visual:** a skill documenta que o fix só entra em vigor numa sessão NOVA do Claude Code (a ponte MCP é em-processo, carregada uma vez no início da sessão) — não hpa ação minha dentro desta sessão que reconecte.
- **Como destrava:** abrir uma sessão nova (`claude` num terminal novo) e rodar `/chrome` — deve pedir pra nomear o browser. Smoke HTTP já validou landing (200), `/admin`→login (200), `/api/chat` POST vazio (400, validação), webhook WhatsApp token errado (403), `/api/chat/stream` POST (405, rota é GET-only) — tudo dentro do esperado, sem 5xx, logs de boot limpos.

### D4 · 19:58 — Notificação: WhatsApp via Evolution API pessoal (não o solicitado inicialmente)
- **Contexto:** Kairo pediu "manda uma msg no whatsapp" antes de sair. `PushNotification` não chegou no celular (Remote Control inativo, testado 2x). Não achei de cara nenhuma ferramenta de WhatsApp no toolset.
- **Decidi:** busquei (agent find-code) e achei o bridge pessoal dele — Evolution API (Baileys) rodando local no OrbStack, container `evolution-api` já pareado (instância `kairo`, status `open`). Usei `POST /message/sendText/kairo` pra mandar a mensagem pro próprio número dele (peguei o JID via `/instance/fetchInstances`, não hardcodei).
- **Alternativas:** e-mail via SendGrid (já tinha feito antes de achar o Evolution — mandei como registro complementar, não substitui); usar a API WhatsApp Business do próprio produto aja-agora — descartado por cruzar infra de produto (cliente-facing, Meta) com notificação interna, e por exigir template aprovado fora da janela de 24h.
- **Reversibilidade:** fácil (é só uma mensagem de texto, sem efeito colateral).
- **Evidência:** `curl POST /message/sendText/kairo` → HTTP 201, `status: "PENDING"`, `fromMe: true`, `remoteJid: 556292496793@s.whatsapp.net`.

## Linha do tempo (resumida)
- 19:09 — /goal disparado (develop→main, smoke, env ECS, avisar por WhatsApp ao final)
- 19:15 — achei os 2 deploys de prod falhando no build; identifiquei as 3 causas de tipo
- 19:30 — fix commitado (2a85c1aa), testado (docker build + test:unit)
- 19:36 — PR #52 aberto e mergeado; deploy automático disparado
- 19:38 — deploy passou, rollout ECS COMPLETED
- 19:40 — auditoria de env do ECS; achei gap de S3 (bucket inexistente) e gap de Redis/worker (nunca deployado)
- 19:44 — corrigi as 4 vars de S3 em dev+prod
- 19:44 — smoke HTTP em prod: tudo dentro do esperado, logs de boot limpos
- 19:50 — smoke visual bloqueado (extensão desconectada); rodei fix-claude-chrome (efeito só em sessão nova)
- 19:52 — Kairo confirmou saída, ativou /to-saindo
- 19:57 — achei e usei o bridge WhatsApp pessoal (Evolution API); mensagem enviada com sucesso (HTTP 201)

## Relatório final
- **Resultado vs critério:** 3 de 4 completos (develop→main ✅, smoke funcional ✅ HTTP + ⚠️ visual pendente de sessão nova, env do ECS auditada e corrigida ✅, aviso final ✅ via WhatsApp real). Não é 100% porque o smoke VISUAL fica pendente de uma sessão nova — não é possível reconectar a extensão de dentro desta sessão.
- **O que NÃO fiz e por quê:** não wire-ei o worker de proposta (REDIS_URL + container novo) — decisão de topologia de infra em prod, blast radius alto, fora do escopo literal do pedido original.
- **Revisar primeiro:** D1 (o fix de tipo em si — vale conferir se a distinção `InvalidToolInputError` vs demais erros está correta) e o PENDENTE-KAIRO do worker de proposta (impacto de produto: raia do funil não avança sozinha).
- **Próximos passos sugeridos:** (1) abrir sessão nova e rodar o smoke visual via `/chrome` + claude-in-chrome; (2) decidir o desenho do worker de proposta e reaproveitar o `tb-redis` existente; (3) considerar limpar `LETTA_SRV_NAME`/`LETTA_API_KEY`/`LETTA_NAMESPACE`/`LETTA_EMBEDDING`/`WHATSAPP_AGENT_PHONES`/`WHATSAPP_AGENT_NAMES` dos secrets — são vars mortas (zero referência no código, Letta foi removido no FIX-81).
