# Aja Agora — chão limpo, rodando local, motor no pi e testado no dev

## Problema
Mudar como o agente conversa exige engenheiro e deploy: a caixa de prompt que já existe (Langfuse, efeito ≤60s) não governa — ~22 blocos de conduta montados em código (`src/lib/agent/langgraph/nodes/converse.ts:1102-1137`, `montarSystem`, os 22 blocos em `:1106-1135`) vêm depois dela e vencem. O fluxo não está no grafo: está no `nextGate` (`src/lib/agent/qualify-state.ts:346`), nos builders de diretiva (`src/lib/agent/orchestrator/directives.ts`, ~40 builders `export function build*`) e no `src/app/api/chat/route.ts` (~2.041 linhas).
Chão sujo: 11 erros de biome; `.husky/pre-commit` foi reescrito em 16/10 para rodar teste pontual + `pnpm lint` (a suíte para a qual os scripts abaixo apontam não existe mais); 5 scripts do `package.json` (`test:unit`, `test:funil`, `test:integration`, `test:caminho-do-dinheiro`, `test:pre-commit`) e o `include` de `vitest.config.ts` (`tests/regression/**`) apontam para testes apagados (nenhum `*.integration.test.ts` no repo); banco de workspace nascendo atrás do template `aja_agora_template` (o repo tem 65 migrations, `drizzle/0000…0064`). Nada do pi integrado.

## Solução
O pi assume o turno atrás do seam existente, com a conduta numa caixa única que governa de verdade (inclusive reveal e fechamento) e o fato/invariante continuando código. Chão reprodutível, projeto rodando local conversando de verdade, resultado integrado na `develop` e testado no env dev.

## Grandes ideias
1. O corte é o seam: `runTurn` (`src/lib/agent/orchestrator/index.ts:11`), contrato `TurnInput → AsyncGenerator<TurnEvent>`. Web, WhatsApp e os 3 workers chamam só ele.
2. FATO em código, CONDUTA na caixa. Não migram para texto: `nextGate` (`src/lib/agent/qualify-state.ts:346`), trava do telefone (`converse.ts:88` — `TOOLS_QUE_REVELAM_OFERTA`; aplicada em `:490`; `desbloqueioPendente` em `:488`; gate em `converse.ts:684-693`, `blocoOfertaAguardandoTelefone`), cards server-side (`src/lib/agent/langgraph/nodes/emit-card.ts:86`, `src/lib/agent/orchestrator/server-cards.ts`), persistência (`src/lib/agent/langgraph/nodes/persist.ts:73`).
3. O pi é harness de agente DE CÓDIGO: modo de controle total obrigatório, exemplo do SDK em `/Users/kairo/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/sdk/12-full-control.ts` — `ResourceLoader` próprio, só tools customizadas, `SettingsManager.inMemory` (`dist/core/settings-manager.d.ts:213`), `ResourceLoader.systemPromptOverride` (`dist/core/resource-loader.d.ts:122`). Nunca `read`/`bash`/`edit`/`write`, nunca descoberta de AGENTS.md pelo `cwd`.
4. Paridade não se herda — o harness de 41 cenários foi apagado. Testes pontuais que fixam o seam (card, gate, persistência, nos dois canais) verdes ANTES do motor novo.
5. Durabilidade tem régua medida: o checkpointer de hoje é `MemorySaver` in-process (`src/lib/agent/langgraph/checkpointer.ts:12` importa, `:17` instancia; getter em `:16`); o estado do `interrupt` some no restart. O spike decide a régua (Q1).
6. Portão de parada: se as fases 1–3 entregarem a dor, PARE e leve o número ao dono antes de gastar a fase do motor.

## Variáveis
- RAIZ: /Users/kairo/orca/workspaces/aja-agora/refatoracao-completa-pelo-pi
- PROJETO: aja-agora
- BASE: a worktree atual (`kairogyn/refatoracao-completa-pelo-pi`); integração na `develop` é a fase 6, autorizada
- SESSÃO: obj-aja-pi · MEMÓRIA: ~/.local/share/objetivos/aja-pi-memoria.md
- MODELO: qwen3.8-flash mantido (`AI_MODEL` lido em `src/lib/llm/model-provider.ts:43`; `AI_ANALYZER_MODEL` em `:56` — não estão setados no `.env.local` de hoje, ver Q4)
- ENV DE TESTE: dev — ECR `twobrains/aja-agora/dev`, secret `tb/dev/aja-agora/env`, deploy manual via `workflow_dispatch env=dev`
- PROIBIDO: produção (`main`, `tb/prod/aja-agora/env`, `aja-agora-prod`)

## Fluxo
Fase 0 — chão limpo e reprodutível: (1) `pnpm lint` verde (`npx biome check --write .` + corrigir à mão `scripts/relatorio-custo-ia.ts:514` — a linha é o `.reduce` de `somar`; o erro de biome em si não foi confirmado, ver conferência); (2) commit/validação do `.husky/pre-commit` (já reescrito em 16/10: roda só o teste ao lado do arquivo mudado, `X.ts` → `X.*.test.ts`, + `pnpm lint`), com `HUSKY=0`; (3) remover scripts mortos do `package.json` (`test:unit`, `test:funil`, `test:integration`, `test:caminho-do-dinheiro`, `test:pre-commit`) e `tests/regression/**` do `vitest.config.ts`; (4) local reprodutível: atualizar `aja_agora_template` de um DB sadio; consertar a cadeia de migração — `scripts/migrate-guard.bundle.cjs` **não existe** no disco (só `scripts/migrate-guard.mjs`; o bundle é gerado por `pnpm db:migrate:bundle`, referenciado pelo `MIGRATE_CMD` do `Dockerfile` de produção e pelo script `db:migrate:runtime`) e o **dev não tem entrypoint de migração** (`Dockerfile.dev` não roda migration); `.env.local` pelo gateway (`LITELLM_BASE_URL`/`LITELLM_API_KEY` do vault) + `AI_MODEL`/`AI_ANALYZER_MODEL`. Gate: bootstrap limpo dá HTTP 200 e DB com 65 migrations, e um turno responde pelo gateway.
Fase 1 — provar o seam: testes pontuais de card emitido, gate que nasce no turno, persistência (`messages`/`artifacts`/`meta`), ordem do funil, nos dois canais. Gate: verdes E cada um falhando se a garantia sair.
Fase 2 — a caixa governa a CONDUTA: classificar os 22 blocos de `converse.ts:1102-1137` em FATO × CONDUTA, mover a conduta para a caixa. Gate: teste que prova que o system contém o texto da caixa e não o bloco concorrente, e que reintroduzir conduta em código fica vermelho; prova nos turnos de reveal (beat em `converse.ts:1906-1923`, sem tools `:1923`) e no segundo beat sem tools (`:1971`), e no fechamento (`converse.ts:1183`, `blocoFechamento`).
Fase 3 — campos mortos e o juiz: re-ancorar `eval/scorer.ts:185,190` (185 = `forbiddenTopics`, 190 = `voiceTone`) ANTES de remover `voiceTone`, `examples`, `forbiddenTopics`, `handoffTriggers`, `activeCampaigns`; manter `displayName`/`category`/`expertise` (`src/lib/agent/personas-repo.ts:55` → `src/lib/agent/langgraph/nodes/analyze.ts:252,264`, `src/lib/agent/orchestrator/routing.ts:114`, `src/lib/agent/orchestrator/transition.ts:41`; `src/lib/agent/turn-analyzer.ts:328`). Gate: scorer verde + grep.
▶ Portão de parada.
Fase 4 — spike do pi em controle total: sessão sem tools de código, `ResourceLoader.systemPromptOverride` vindo da caixa, uma tool customizada, contexto hidratado do banco por turno (`SessionManager.inMemory(cwd, options, entries)` — a assinatura é `inMemory(cwd?, options?, entries?, ver Q3)`), streaming por `session.subscribe`, e qual régua de durabilidade (Q1). Gate: parecer gravado com ✅/❌ por item, inclusive o que NÃO foi provado.
Fase 5 — `runTurnPi` atrás do seam (só com fase 4 aprovada), reusando tools (`toolset.ts`), cards, persistência e diretivas. Gate: testes da fase 1 verdes no motor novo.
Fase 6 — integra na `develop` e testa no dev: merge + `gh workflow run aws-ecr-deploy.yml -f env=dev`; env nova vive em DOIS lugares (secret `tb/dev/aja-agora/env` e task definition). Gate: smoke real nos dois canais com evidência.

## Definição de pronto
- [ ] `pnpm lint && pnpm -s typecheck` verdes
- [ ] hook `.husky/pre-commit` (teste pontual ao lado do arquivo + lint) commitado
- [ ] scripts mortos do `package.json` e `tests/regression/**` do `vitest.config.ts` fora
- [ ] workspace novo nasce com 65 migrations (`drizzle/0000…0064`) e a cadeia de migração resolvida (bundle/entrypoint)
- [ ] local pelo gateway com turno real respondido e evidência
- [ ] testes pontuais do seam (card, gate, persistência, funil, dois canais) verdes e mordendo (falham se a garantia sair)
- [ ] nenhum bloco de CONDUTA em `converse.ts` com reveal e fechamento mudando pela caixa
- [ ] `eval/scorer.ts:185,190` re-ancorado antes da remoção dos 5 campos
- [ ] parecer do spike gravado com ✅/❌ por item e o que não foi provado
- [ ] `runTurnPi` com paridade nos dois canais
- [ ] worktree na `develop` e dev deployado e testado com URL + evidência
- [ ] MEMÓRIA (`~/.local/share/objetivos/aja-pi-memoria.md`) com feito/aberto/travado

## Como você será avaliado
- Nota contínua: um ponto por item da Definição de pronto e por etapa do Fluxo; cada gate exige evidência (comando + saída).
- **Falha imediata:** mover invariante verificável para o texto; abrir sessão do pi com tools de código ou descoberta de AGENTS.md pelo `cwd`; declarar motor trocado sem o parecer do spike ou furar o portão de parada; quebrar paridade sem teste que prove; tocar em produção ou no `AI_MODEL`; trocar o motor com a caixa ainda não governando; inventar dado ("não achei" é resposta).
- Se causar falha sem querer: pare, registre e reporte.

## Comandos de validação
`pnpm lint && pnpm -s typecheck` · `pnpm vitest run <arquivo>.test.ts` · `~/.claude/skills/local-dev/scripts/bootstrap-workspace.sh` · `docker exec aja-app-<workspace> sh -c 'cd /app && pnpm exec drizzle-kit migrate'` · `docker exec aja-shared-pg psql -U postgres -d aja_agora_ws_<workspace> -tAc "select count(*) from drizzle.__drizzle_migrations"` (esperado 65) · `curl -s -o /dev/null -w '%{http_code}' http://aja-<workspace>.orb.local/` · `gh workflow run aws-ecr-deploy.yml -f env=dev`

## Perguntas em aberto
Q1 — Qual régua de durabilidade adotar para o checkpointer do pi (`MemorySaver` in-process hoje → some no restart) e é o dono que aprova depois do parecer da Fase 4?
Q2 — Em que caminho gravar o parecer do spike da Fase 4 (arquivo exato)?
Q3 — `SessionManager.inMemory` tem assinatura `(cwd?, options?, entries?)`: ao hidratar o contexto do banco por turno, o `entries` entra como 3º argumento (com `cwd`/`options` explícitos) ou ficamos no `SessionManager.inMemory(cwd)` do exemplo?
Q4 — De onde saem `LITELLM_BASE_URL`/`LITELLM_API_KEY`/`AI_MODEL`/`AI_ANALYZER_MODEL` do `.env.local` (chave exata no vault) — hoje nenhum deles está setado no arquivo.
Q5 — A Fase 6 integra na `develop` por merge direto na worktree ou por PR?

## Conferência de linhas (correções e o que não confirmei)
- Corrigi `converse.ts:1102-1136` → `:1102-1137` (`montarSystem` fecha o array em `:1136`, `});` em `:1137`); os 22 blocos ficam em `:1106-1135` (contagem exata: blocoIdentidade, cartaMenor, buscaVazia, formularioAberto, canal, ofertas, ofertaAguardandoTelefone, pessoa, tela, jaRespondido, abandono, vazia, opcoesNaTela, chamarEscolherCota, fechamento, retomadaPosFechamento, novato, escolha, grupoTrocado, lance, embutido, conducao = 22). ✅
- Corrigi a trava do telefone `converse.ts:93` → `:88` (`export const TOOLS_QUE_REVELAM_OFERTA`); a linha 93 é só um membro do set (`ajustar_por_parcela`). Uso em `:490`, `desbloqueioPendente` em `:488`.
- Corrigi o gate do telefone `converse.ts:668-694` → `:684-693` (`blocoOfertaAguardandoTelefone`); a linha 668 é o fim do bloco anterior (`: null;`).
- `qualify-state.ts:346` ✅ (`export function nextGate`, em `src/lib/agent/qualify-state.ts` — não em `langgraph/nodes/`). `runTurn` `orchestrator/index.ts:11` ✅. `persist.ts:73` ✅ (`persistNode`). `scorer.ts:185,190` ✅. `personas-repo.ts:55` ✅. `analyze.ts:252,264` ✅. `routing.ts:114` ✅. `transition.ts:41` ✅. `turn-analyzer.ts:328` ✅ (`listExpertisesByCategory`). `converse.ts:1183` ✅. `:1923`/`:1971` ✅ (`await executarBeat(false)`). `route.ts` ✅ (~2.041 linhas, não 2.040 exatas). `drizzle/0000…0064` = 65 migrations ✅.
- `checkpointer.ts:16` → o getter está em `:16`, mas o `MemorySaver` é importado em `:12` e instanciado em `:17` (aponto os três).
- `examples/sdk/12-full-control.ts` não existe no repo: é do pacote do pi, caminho real `/Users/kairo/.local/lib/node_modules/@earendil-works/pi-coding-agent/examples/sdk/12-full-control.ts` (usa `ResourceLoader` próprio, `SettingsManager.inMemory`, `SessionManager.inMemory(cwd)`, `tools: ["read","bash"]`, `session.subscribe`). `systemPromptOverride` é campo do `ResourceLoader` (`dist/core/resource-loader.d.ts:122`).
- `scripts/migrate-guard.bundle.cjs` não existe ✅ — mas o rascunho diz "entrypoint de dev": na verdade o dev (`Dockerfile.dev`) **não tem** entrypoint de migração; quem referencia o bundle é o `MIGRATE_CMD` do `Dockerfile` de produção e o script `db:migrate:runtime`.
- `.husky/pre-commit` já contém a regra alvo (teste pontual ao lado do arquivo + `pnpm lint`, datado 16/10). "Hook rodando suíte inexistente" descreve o estado antigo — no working tree atual o hook não roda a suíte; se já está commitado, **não confirmei** (sem `git`).
- "~50 builders de diretiva" → encontrei 40 `export function build*` em `directives.ts` (aproximação).
- **Não confirmei** (precisam de shell/DB, não disponíveis aqui): os 11 erros de biome e o erro em `relatorio-custo-ia.ts:514`; `aja_agora_template` com 34 migrations e o "31 atrás"; os 741 arquivos removidos no commit `d67ea102`; o efeito ≤60s da caixa Langfuse.