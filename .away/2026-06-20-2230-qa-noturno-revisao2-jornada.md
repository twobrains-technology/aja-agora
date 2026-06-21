# Away — QA noturno: validar revisão 2 da jornada (FIX-52..60) e deixar tudo verde

- **Início:** 2026-06-20 22:30 · **Sessão:** aja-agora / branch `qa/noturno-2026-06-20` (a partir de `develop`)
- **Critério de pronto:** Todos os cenários do ledger ∈ {✅, ⚠️ bloqueado-Kairo}, nenhum bloco de correção pendente, suíte (typecheck + test:unit Camadas 1+2) verde com evidência fresca, e a superfície de mudança dos FIX-52..60 validada contra a jornada canônica. Merge `qa/noturno-*` → develop fica PENDENTE-KAIRO.
- **Status:** EM ANDAMENTO

## Decisões

### D1 · 22:30 — Branch de trabalho `qa/noturno-2026-06-20` (não commitar na develop)
- **Contexto:** sessão começou na `develop`, que é a branch default/compartilhada do projeto. QA noturno precisa commitar testes de regressão + fixes, mas develop é blast radius alto.
- **Decidi:** criar `qa/noturno-2026-06-20` a partir da develop limpa; todo trabalho (regressões, fixes, ledger, diário) commita aqui. Merge develop ← qa/noturno = PENDENTE-KAIRO.
- **Alternativas:** commitar direto na develop (rejeitado: regra global "if on default branch, branch first" + blast radius); usar worktree Superset (desnecessário, ambiente local já é da develop e está de pé).
- **Reversibilidade:** fácil (branch descartável).
- **Evidência:** `git branch --show-current` → qa/noturno-2026-06-20.

### D2 · 22:32 — Âncora = revisão 2 da jornada (FIX-52..60)
- **Contexto:** os últimos merges na develop são os blocos A/B/C da revisão 2 da jornada (`jornada2_revisão.docx` do Bernardo). Commits de `cdd6d148` até `d87548bc`.
- **Decidi:** validar a superfície de mudança desses 9 fixes, cada um mapeado a cenário(s) verificável(is) da jornada canônica, no nível de teste certo (determinístico > cassette > E2E browser).
- **Alternativas:** validar app inteiro (rejeitado: anti-padrão, loop sem foco).
- **Reversibilidade:** n/a (decisão de escopo).
- **Evidência:** `docs/correcoes/2026-06-19-jornada2-revisao.md` + git log.

### D3 · 00:02 — DATABASE_URL de teste via override inline (não editar .env.local)
- **Contexto:** `.env.local` apontava `DATABASE_URL` pra `db.aja-feat-jornada-bevi-lance-embutido.orb.local` (worktree morta) → 3 testes de DB falhavam (ENOTFOUND). Hook bloqueia edição de `.env*`.
- **Decidi:** exportar `DATABASE_URL=postgresql://postgres:postgres@aja-pg-develop.orb.local:5432/aja_agora` inline em cada comando de teste. `vitest.setup.ts` usa `loadEnvFile` que NÃO sobrescreve var já setada → o override ganha sem tocar no arquivo.
- **Alternativas:** editar `.env.local` (bloqueado por hook + é config local não-versionada de outro contexto).
- **Reversibilidade:** fácil (é só env de sessão). Config do meu ambiente, não bug de produto.
- **Evidência:** com env certo, 2/3 fails sumiram; restaram só os 2 testes órfãos reais (D-fix FIX-53).

### D4 · 00:30 — docker restart do app (cache stale Turbopack)
- **Contexto:** após editar `system-prompt.ts`, o container passou a dar `Parsing ecmascript source code failed` em `system-prompt.ts` → 500 em toda rota que importa o agent → 20 E2E falharam. Código íntegro (tsc + 1792 unit passam).
- **Decidi:** `docker restart aja-app-develop` (lição [[project_turbopack_virtiofs_stale]]). Resolveu o parsing; rotas voltaram a 200.
- **Reversibilidade:** n/a (restart de container local, autorizado).
- **Evidência:** pós-restart `✓ Ready`, landing 200, /api/leads passou a responder 404 (validação correta) em vez de 500-parsing.

### D5 · 00:35 — E2E de lead-capture/resume: não consertar agora (fora do escopo v2)
- **Contexto:** 10+ E2E falham, mas são testes furados (ec-names-unicode não cria conversation → endpoint corretamente dá 404) + flaky LLM-dependentes + timing. Features FIX-43/49/51, NÃO a revisão 2.
- **Decidi:** documentar como achado (card `inbox/2026-06-21-e2e-lead-capture-furados.md`) e NÃO consertar — é saneamento de E2E de outras features, mini-projeto à parte. Confirmado não-regressão da v2 (não tocam código FIX-52..60; endpoints corretos).
- **Reversibilidade:** n/a (decisão de escopo).
- **Evidência:** curl POST /api/leads sem conversation → 404; leitura do código do endpoint + dos specs.

### ⚠️ PENDENTE-KAIRO · 00:35 — 2 itens de higiene fora da revisão 2
- **T1 — `pnpm typecheck` vermelho (25 erros, TODOS em testes):** drift Next16/Node (cookies RequestCookies, `glob` de node:fs, regex es2018), fora da revisão 2. NÃO bloqueia build de prod (app no ar). Tratar em bloco dedicado de saneamento de tipos.
- **E2E lead-capture/resume furados+flaky:** ver card. Bloco dedicado de saneamento E2E.
- **Como destrava:** decisão do Kairo de priorizar/agendar esses 2 blocos (ou deixar como dívida consciente).

## Linha do tempo (resumida)
- 22:30 — Reconhecimento: branch develop limpa, ambiente local de pé (aja-app-develop + aja-pg-develop), FIX-52..60 mergeados. Criada branch de trabalho.
- 22:33 — Baseline: typecheck 🔴 (25 erros em testes, pré-existente), test:unit 2 fails reais (gates FIX-53 órfãos).
- 00:04 — Fix 2 testes órfãos de gate (commit 00ae5266). Suíte 1787 verde.
- 00:15 — E2E render da landing FIX-59/60 (commit b45bb638), 4 verde.
- 00:21 — Gap anti-fallback "atualiza a página" (FIX-52) fechado nas 3 camadas + Camada 3 LLM (commit 3de52ad2).
- 00:25 — Validada cobertura FIX-54/55/56/57/58 + regra inviolável #2 (Bevi fonte única).
- 00:35 — E2E integração: 20→17 pós-restart Turbopack; 10 fails restantes diagnosticados como furados/flaky pré-existentes (não-regressão v2).

### D6 · 01:25 — Rodada 2: corrige ordem de gates no system-prompt (achado novo, alto valor)
- **Contexto:** o system-prompt (REGRA DURA "3 gates pré-valor") afirmava experience→timeframe→lance ANTES do valor. Mas o nextGate real e o docx (passo 2: valor→prazo→lance, + FIX-53 identidade antes do valor) fazem experience→consent→identify→VALOR→timeframe→lance. Prompt descrevia a ordem invertida + exemplos BAD/GOOD ensinando o padrão errado.
- **Decidi:** corrigir inline via TDD 3 camadas (provado encadeando nextGate num teste de sequência novo). Reescrevi a REGRA DURA pra "você não dirige o funil; o orchestrator dispara cada gate na ordem", preservando a proteção anti-skip. Atualizei HARD_RULES §2.2 + 3 testes que codificavam a ordem antiga.
- **Alternativas:** mudar o nextGate/código (rejeitado — o código está CERTO, alinhado ao docx; o defeito era no prompt).
- **Reversibilidade:** média (mudança no system-prompt de produção; vai pra branch qa/noturno, Kairo revisa no merge).
- **Evidência:** commit ebfd312a; suíte 1798 verde + Camada 3 (LLM real) verde no hook.

### D7 · 01:20 — Eval jornada desatualizado (FIX-53): documentar, não corrigir inline
- **Contexto:** `tests/eval/jornada-aja-agora.eval.test.ts` GATE_SEQUENCE percorre os gates na ordem PRÉ-FIX-53 (identify por último). O harness foi construído em torno da tripwire-no-fim.
- **Decidi:** documentar como card/bloco (reescrita do harness + validação LLM cara = >15min; Camada 3 nightly não-bloqueante; ordem real já coberta na Camada 1). NÃO corrigir inline (risco de quebrar o eval sem validação cara).
- **Reversibilidade:** n/a (decisão de escopo).
- **Evidência:** card `inbox/2026-06-21-eval-jornada-gate-sequence-fix53.md`.

## Relatório final (preencher ao encerrar)
- **Resultado vs critério de pronto:** _pendente_
- **O que NÃO fiz e por quê:** _pendente_
- **Revisar primeiro:** _pendente_
- **Próximos passos sugeridos:** _pendente_
