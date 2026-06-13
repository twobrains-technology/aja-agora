# Away — migrate-guard escaneia só migrations PENDENTES (elimina flag destrutiva permanente em prod)

- **Início:** 2026-06-13 10:54 · **Sessão:** aja-agora/develop
- **Critério de pronto:** (a) teste Camada 1 verde: destrutiva histórica já aplicada NÃO dispara, destrutiva pendente dispara, fallback conservador quando DB inacessível; (b) suíte pre-commit verde; (c) imagem nova com guard corrigido bootando em dev e prod COM a flag ainda presente (transição segura); (d) flag `ALLOW_DESTRUCTIVE_MIGRATION` removida do secret+TD de prod e prod bootando sem ela (log: guard prossegue, 0 pendentes); (e) pushed develop→main.
- **Status:** COMPLETO

## Contexto do objetivo

Hoje cedo subi o prod do aja-agora e descobri que o `migrate-guard.mjs` re-escaneia TODAS as migrations a cada boot (não consulta o DB) → aborta em prod ao achar destrutivas históricas (0003/0008/0009/0013/0020), forçando `ALLOW_DESTRUCTIVE_MIGRATION=true` permanente no secret prod. Isso desativa o gate de boot pra destrutivas FUTURAS (só o CI cobre). O Kairo saiu pedindo "se der pra resolver resolva e sobe para prod e dev". Fix: o guard consulta `drizzle.__drizzle_migrations` (count de aplicadas) e escaneia só as pendentes — destrutivas já aplicadas deixam de disparar, destrutivas NOVAS continuam barradas. Confirmado: tabela existe, 24 aplicadas = 24 no journal → 0 pendentes.

## Decisões
<!-- adicionar NA HORA -->

### D1 · 10:54 — Abordagem count-based (não hash-based) pra detectar pendentes
- **Contexto:** o guard precisa saber quais migrations já foram aplicadas pra escanear só as pendentes. Drizzle registra 1 row por migration aplicada em `drizzle.__drizzle_migrations`, em ordem.
- **Decidi:** `count(*)` na tabela = nº aplicadas (M); pendentes = entries do journal (ordenadas por idx) a partir de M. Sem replicar o hash interno do Drizzle.
- **Alternativas:** (a) hash-based (replicar SHA do Drizzle por arquivo) — frágil, quebra entre versões; (b) deixar a flag permanente — perde o gate, não resolve.
- **Reversibilidade:** fácil (git revert + re-adicionar flag).
- **Evidência:** `SELECT count(*)` = 24 = journal.entries.length no dev → 0 pendentes (a ser commitado).

### D2 · 10:54 — Fallback conservador quando o DB/tabela não responde
- **Contexto:** primeiro boot (tabela não existe) ou DB indisponível no momento do guard.
- **Decidi:** se a query de count falhar, cair no comportamento ATUAL (escaneia tudo → exige flag). Sinal > silêncio, igual ao design original.
- **Alternativas:** assumir 0 aplicadas (escaneia tudo — mesmo efeito) vs assumir todas aplicadas (perigoso — pularia destrutiva nova). Escolhi o conservador.
- **Reversibilidade:** fácil.
- **Evidência:** a ser coberto por teste (appliedCount=null → todos os tags).

### D3 · 10:54 — Cutover em 2 fases (imagem nova primeiro, remover flag depois)
- **Contexto:** mexer no boot de PROD enquanto o Kairo está fora exige a menor janela de risco.
- **Decidi:** (1) push do guard corrigido → imagem nova deploya em prod COM a flag ainda presente (valida que a imagem nova boota); (2) só então remover a flag do secret+TD → redeploy → validar boot sem flag. Se qualquer passo falhar, re-adiciono a flag (revert) e marco PENDENTE-KAIRO.
- **Rede de segurança:** o service prod tem `deploymentCircuitBreaker rollback=true` — task que falha no boot faz rollback automático pra TD anterior.
- **Reversibilidade:** média (2 deploys; revert = re-adicionar flag + TD anterior).

### D4 · 11:10 — Entrypoint do guard via nome do script (não `import.meta.url`)
- **Contexto:** refatorei o guard com `if (import.meta.url === pathToFileURL(process.argv[1])) main()`. Funciona no `.mjs` (ESM) e nos testes, MAS o runtime usa o **bundle CJS** (esbuild `--format=cjs`), onde `import.meta.url` vira um shim que NÃO bate com argv[1] → `main()` nunca roda → guard vira **no-op silencioso** (não aplica migrations, não detecta destrutivas). Confirmado: `node migrate-guard.bundle.cjs` sem DATABASE_URL saiu 0 sem erro. Prod bootou só porque o schema já estava aplicado — migrations futuras NÃO rodariam.
- **Decidi:** detectar entrypoint por `/migrate-guard(\.bundle)?\.(mjs|cjs)$/.test(process.argv[1])` — funciona em ESM e no bundle CJS; teste (vitest) não casa o nome → não roda main.
- **Bug que EU introduzi** na refatoração (D1); o guard original chamava `applyMigrations()` no top-level. Pego por teste novo que roda o BUNDLE (`node ...bundle.cjs` sem env → exit≠0 + "DATABASE_URL não definida").
- **Reversibilidade:** fácil (commit incremental).

## Linha do tempo
- 10:54 — objetivo capturado, diário criado, schema `__drizzle_migrations` confirmado (24 aplicadas). Começando TDD do guard.
- 10:59 — guard refatorado (funções puras exportáveis + consulta DB + guard de entrypoint). Teste Camada 1 `tests/regression/migrate-guard.test.ts` 7/7 verde. Bundle esbuild compila (445kb).
- 11:00 — **validação contra DB dev real**: 24 aplicadas = 24 journal → 0 pendentes → VEREDITO "PROSSEGUIRIA ✓" sem flag. Confirma que destrutivas históricas não disparam mais.
- 11:01 — commit `test+fix:` + diário, pushed develop→main (build 27468888025).
- 11:04 — build OK, prod re-deployou com a imagem nova (digest sha-35c47b7 confirmado). **MAS** boot não mostrou "[migrate-guard] aplicando" → descoberto o bug do entrypoint no bundle CJS (D4): main() era no-op. Prod bootou só porque schema já aplicado.
- 11:17 — fix do entrypoint (D4): casa pelo nome do script. Teste do bundle 8/8 verde, suíte 1643 verde. Bundle confirmado: `node ...bundle.cjs` sem env → aborta corretamente. Commit `test+fix:`, pushed develop→main (build 27469256955).

## Linha do tempo (cont.)
- 14:20 — build2 (fix entrypoint) deployou. Boot do prod E dev mostrou o guard CORRIGIDO rodando: `[migrate-guard] aplicando` + `OK — schema atualizado`, sem bloco de destrutivos (0 pendentes). Fase 1 validada de verdade.
- 14:28 — **Fase 2**: removida a flag `ALLOW_DESTRUCTIVE_MIGRATION` do secret prod + TD:4 sincronizada → redeploy → prod bootou SEM a flag, guard prosseguiu (não abortou). Objetivo atingido.
- 14:30 — smoke: ajaagora.com.br 200, dev 200; services COMPLETED 1/1 (prod TD:4, dev TD:6); flag confirmada fora do secret.

## Relatório final
- **Resultado vs critério de pronto:** ✅ PASSOU em todos os itens.
  - (a) teste Camada 1 `tests/regression/migrate-guard.test.ts` 8/8 verde (histórica aplicada não dispara; pendente dispara; fallback conservador; bundle CJS roda main).
  - (b) suíte pre-commit 1643 verde.
  - (c) imagem nova bootando em dev e prod (logs do guard 14:20).
  - (d) flag removida do secret+TD prod; prod boota sem ela (log 14:28, sem ABORTADO).
  - (e) pushed develop→main (commits `02cf688`/fix guard, `df04a81`/fix entrypoint; merges `35c47b7`,`8934422`).
- **O que NÃO fiz e por quê:**
  - **Propagar o fix pro template `tb-aws-platform/templates/scripts/migrate-guard.mjs`** — é outro repo (plataforma, do Kairo) e PR lá é "publicar pra fora". É ⚠️ PENDENTE-KAIRO (abaixo). O fix beneficia todo app Drizzle com destrutiva histórica.
  - **WhatsApp prod** — segue PENDENTE-KAIRO (precisa das credenciais do número novo).
- **Revisar primeiro:**
  - **D4** (bug que eu introduzi e corrigi): o guard de entrypoint via `import.meta.url` virava no-op no bundle CJS. Pego porque o boot não logava o guard. Corrigido (entrypoint por nome do script) + teste que roda o bundle. É a decisão mais discutível — vale o teu olhar no diff.
  - **D1/D2** (count-based + fallback): destrutiva histórica deixa de disparar; **primeiro boot de ambiente NOVO** (tabela `__drizzle_migrations` ainda não existe) cai no fallback conservador e AINDA exige a flag — by design. Se criar staging/prod novo, lembra disso.
- **Próximos passos sugeridos:**
  - Portar o fix pro template tb-aws-platform (PENDENTE-KAIRO).
  - Conferir se o fpma (mesmo padrão Letta) tem a precedência cega do letta-client (follow-up do trabalho anterior, hoje cedo).

### ⚠️ PENDENTE-KAIRO · 14:30 — portar fix do migrate-guard pro template tb-aws-platform
- **O que é:** o `scripts/migrate-guard.mjs` veio do template `tb-aws-platform`. O fix (escanear só pendentes + entrypoint por nome) deveria ir pro template pra todo app Drizzle herdar.
- **Por que não fiz:** PR em repo de plataforma = publicar pra fora; é decisão tua (és o dono do template).
- **Como destrava:** "porta o migrate-guard pro tb-aws-platform" — eu abro o PR com o mesmo diff (2 commits aqui: count-based + entrypoint-por-nome).

### ⚠️ PENDENTE-KAIRO · 14:30 — WhatsApp prod (número novo)
- **O que é:** prod nasceu web-only; falta o número/WABA de produção pro WhatsApp.
- **Por que não fiz:** preciso do token + phone_number_id do número novo (só tu tens).
- **Como destrava:** me passa as credenciais → configuro webhook (`https://ajaagora.com.br/api/webhook/whatsapp`, verify token já no secret) + `update-env`.
