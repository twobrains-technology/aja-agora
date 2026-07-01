# Diário — QA Autônomo Frente 1 (Descoberta + Qualificação + Identidade)

**Início:** 2026-07-01 02:36 · Kairo saiu (trabalho desacompanhado; keep-alive pelo notch)

## Objetivo (1 frase verificável)
Validar adversarialmente os fixes da onda `divergencias-jornada` na área Descoberta+Qualificação+Identidade (Passos 1-4, web↔WhatsApp: FIX-121/120/118/114 + paridade), achar buracos, corrigir na faixa FIX-130..149, deixar tudo verde.

## Critério de PRONTO
Todos os cenários 🟢/regressão do ledger ∈ {✅} + nenhum bloco pendente + reverificação fresca. Teto: 12 iterações / 8h.

## Defaults assumidos (sem ambiguidade → segui)
- Branch de trabalho = atual (`qa/descoberta-qualificacao`).
- Ancoragem = onda integrada em `4c8a81c5`.
- Motor de fix = híbrido (trivial inline TDD; maior = bloco Superset na minha faixa).
- Tensões T1/T2 = NÃO testo como bug (decisão stakeholder).

## Decisões
- **02:31** Bootstrap falhou: `.env.local` de worktree nasce sem `BETTER_AUTH_SECRET`/`ADMIN_*`/`ANTHROPIC_API_KEY` (memória `project_aja_worktree_env_bootstrap`). Resolvido com helper `env-backfill.sh` (scratchpad) que exporta as chaves faltantes/vazias do clone principal no shell — sem gravar segredo em disco (respeita `block-sensitive.sh`). Stack subiu OK.
- **02:35** Baseline `test:unit` = 2194 verdes. Sem regressão nova pós-onda. Ponto de partida limpo.

## Log de eventos
- 02:36 — Ledger criado com 13 cenários da frente. Iniciando ciclo pelo nível certo (structural/parser antes de browser).
- 02:45 — **BUG achado (C1/C2) → FIX-130**: FIX-121 (D21) estava INCOMPLETO. Corrigiu `WELCOME_OPTIONS` só no `web/adapter.ts`, mas `message-list.tsx` tinha 2ª cópia local com 4 categorias ("Outros") alimentando o `EmptyState` (primeira tela do chat web). Falso-verde: teste do FIX-121 era cego à cópia. Corrigi com fonte única (`lib/chat/welcome-options.ts`); render test reproduziu o bug (4 botões→3). Commit test+fix. test:unit 2199 verde (era 2194). Cenários 1,2 ✅.
- 02:46 — Próximo: cenário 5 (parseAssetValue, backstop do FIX-120) adversarialmente.
- 02:50 — C5 ✅ parser: probe adversarial 15/15 (combinados "R$ 1,5 milhão", "R$1.000.000", "2mi"; nulls corretos p/ "meio milhão"/"trinta mil"/"80 000"/monthly).
- 02:55 — C4/C6/C7/C8/C9/C10/C11/C12 ✅ via código de produção + cassettes (agent-trajectory 324 verde): credit→null (FIX-120), fireGate lance-embutido no/maybe (FIX-118), allowedTools sem search_groups sem identidade (FIX-114), gate-renderer agulha (FIX-115), timeframe fora da entrada (FIX-103). Asserts dos cassettes são fortes (não cegos).
- 03:00 — **C13 ✅ AO VIVO**: descoberta real Bevi homologação. Provisionei identity real (contas-teste Kairo via secrets.sh, §4.2.2) — auto 80k→24 grupos REAIS (ÂNCORA), imovel 250k→22 (Banco do Brasil). Prova P7 (sem mock) + gate identity enforçado no adapter (IdentityNotCollectedError sem CPF) + default endpoint homolog (BEVI_SELFCONTRACT_BASE_URL vazio → cai no default, fix da lição empty-env). **PII limpa** (contas-teste.env removido, gitignored).
- 03:05 — **BUG 2 achado no browser real → FIX-131**: footer da landing tinha "Serviços" como 4ª porta de entrada (botão que abre o chat com seed). Produto/UX ambíguo (chip de entrada × catálogo) → perguntei ao Kairo (AskUserQuestion) → **remover** (paridade D21). TDD render, verde. Build Error do Turbopack (virtiofs stale) ao editar sob HMR → docker restart (memória turbopack-virtiofs-stale), resolveu.
- 03:10 — **FIX-130 e FIX-131 confirmados no BROWSER REAL**: footer 3 cat (sem Serviços) + welcome do chat "Me conta: o que quer conquistar?" com Imóvel/Automóvel/Moto (sem Outros). Screenshot em tests/e2e/artifacts. Console só 2 warns de perf de imagem da landing (pré-existente, fora de escopo).
- 03:12 — Todos os 15 cenários ✅. Reverificação final + encerramento.

## Relatório final (encerramento — 2026-07-01 03:15)

**Status: PRONTO.** Frente 1 (Descoberta + Qualificação + Identidade, Passos 1-4) validada de ponta a ponta.

- **15 cenários no ledger, todos ✅.** Nível certo em cada um (não só browser): structural, property (parser 15/15 adversarial), integration Bevi REAL ao vivo, cassettes (agent-trajectory 324 verde), render, browser real.
- **2 bugs residuais achados e corrigidos (faixa FIX-130..149):**
  - **FIX-130** — welcome do chat web ainda mostrava 4 categorias ("Outros"): o FIX-121 corrigiu só a cópia do adapter, o `message-list.tsx` (EmptyState = 1ª tela) tinha 2ª cópia. Fonte única. **Falso-verde do FIX-121 desmascarado.**
  - **FIX-131** — footer da landing tinha "Serviços" como 4ª porta de entrada (abre o chat). Decisão de produto perguntada ao Kairo → remover. Paridade D21.
- **Prova ao vivo (P7):** descoberta real na Bevi homologação retornou cartas REAIS (auto 80k→24 grupos ÂNCORA; imóvel 250k→22 Banco do Brasil). Gate de identidade enforçado no adapter. Nenhum mock em runtime.
- **Gate:** `pnpm test:unit` **2201 verde** (era 2194 no baseline; +7 testes de regressão meus), reverificado fresco no fim. Cassettes 324 verde.
- **Tensões (NÃO mexidas):** T1 (sweep/trilhos) e T2 (embutido amortiza) — decisão de stakeholder, **PENDENTE Kairo/Bernardo**.
- **Higiene:** PII das contas-teste limpa (contas-teste.env removido, gitignored). Screenshot de evidência em `tests/e2e/artifacts/` (gitignored).
- **Commits (branch `qa/descoberta-qualificacao`, NÃO promovidos):** `5e1600ac` FIX-130, `938d630a` FIX-131, `4c455914` docs/cobertura.

**PENDENTE-KAIRO:** promover `qa/descoberta-qualificacao` → develop (não faço sozinho — blast radius). Tensões T1/T2 aguardam decisão.
