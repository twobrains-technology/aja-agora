# Away — migrate-guard escaneia só migrations PENDENTES (elimina flag destrutiva permanente em prod)

- **Início:** 2026-06-13 10:54 · **Sessão:** aja-agora/develop
- **Critério de pronto:** (a) teste Camada 1 verde: destrutiva histórica já aplicada NÃO dispara, destrutiva pendente dispara, fallback conservador quando DB inacessível; (b) suíte pre-commit verde; (c) imagem nova com guard corrigido bootando em dev e prod COM a flag ainda presente (transição segura); (d) flag `ALLOW_DESTRUCTIVE_MIGRATION` removida do secret+TD de prod e prod bootando sem ela (log: guard prossegue, 0 pendentes); (e) pushed develop→main.
- **Status:** EM ANDAMENTO

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

## Linha do tempo
- 10:54 — objetivo capturado, diário criado, schema `__drizzle_migrations` confirmado (24 aplicadas). Começando TDD do guard.
- 10:59 — guard refatorado (funções puras exportáveis + consulta DB + guard de entrypoint). Teste Camada 1 `tests/regression/migrate-guard.test.ts` 7/7 verde. Bundle esbuild compila (445kb).
- 11:00 — **validação contra DB dev real**: 24 aplicadas = 24 journal → 0 pendentes → VEREDITO "PROSSEGUIRIA ✓" sem flag. Confirma que destrutivas históricas não disparam mais. Próximo: commit + push + cutover.

## Relatório final (preencher ao encerrar)
- **Resultado vs critério de pronto:** _pendente_
- **O que NÃO fiz e por quê:** _pendente_
- **Revisar primeiro:** _pendente_
- **Próximos passos sugeridos:** _pendente_
