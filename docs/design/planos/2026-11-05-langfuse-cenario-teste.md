# PRD — D-0083: cenário do Langfuse perfeito para teste

Worktree: `kairogyn/chefe-langfuse` (develop c5b1885a) · Demanda: D-0083 · Refino do dono:
"refinar o cenário do langfuse, deixar ele perfeito para teste".

## Fatos conferidos no disco (divergências do briefing, registradas)

1. **Os "perfis de morte" do mandato NÃO existem.** `voltei-sem-nada`, `silêncio-total` e
   `card-travado` não estão em `src/lib/playground/simulacao/perfis-de-cliente.ts` (são 9 perfis:
   `caminho-feliz`, `nervoso-bugado`, `recusa-telefone`, `explorador`, `quer-ver-todas`,
   `pede-atendente`, `madrugada-sem-atendente`, `objecao`, `some-e-volta` —
   `perfis-de-cliente.ts:14-136`). O mais próximo é `some-e-volta`. O briefing é retrato velho: os
   perfis de morte são trabalho novo deste plano (Bloco B).
2. **O dataset run NÃO é determinístico hoje.** O `runName` carrega timestamp:
   `gate-${sha}-${YYYYMMDDTHH:mm}` (`scripts/eval-run.ts`, função `main`, linha do
   `runName`). Dois runs com o mesmo sha de conduta produzem runs DIFERENTES — o oposto do que o
   dono pediu. O comentário de `scripts/eval/langfuse-dataset-run.ts` (`B10`, topo do arquivo) até
   declara "não é idempotente por desenho". Isso muda: Bloco A.
3. **A retomada NÃO cabe no runner atual, em parte.** `src/lib/playground/simulacao/rodar-simulacao.ts`
   roda turnos em sequência: a cada turno o cliente fala (semente/IA/roteiro — `falaDoRoteiro`,
   `rodar-simulacao.ts:75-80`) e o vendedor responde. Não há turno sem mensagem do cliente e não
   há gatilho de remarketing no runner. A régua de remarketing vive em `src/lib/remarketing/`
   (predicado puro + `remarketing_touches`, `db/schema.ts:1185-1257`) e é disparada por job —
   fora do caminho do chat. Consequência registrada:
   - **Cabe**: perfil de morte onde o LEAD volta pelo mesmo canal (`voltei-sem-nada`,
     `card-travado` — o lead reluta e volta) — padrão `some-e-volta` estendido.
   - **NÃO cabe**: `silêncio-total` no formato literal (agente retoma sozinho após silêncio —
     remarketing). O runner não executa turno vazio nem job externo. Documentado no Bloco B como
     precisa ser; nada de inventar infra.
4. **O juiz online é CÓPIA portada, não sincronizada.** `scripts/langfuse-judge-online.ts:104`
   ("texto portado de `src/lib/eval/rubric.ts`") carrega um `PROMPT_DO_JUIZ` literal separado da
   rubrica offline — `RUBRIC_SYSTEM_PROMPT` em `src/lib/eval/rubric.ts`. A rubrica v2 muda a
   fonte; a cópia precisa atualizar junto e a sincronia precisa de verificação automatizada
   (Bloco C).
5. **A rubrica está em v1.** `RUBRIC_VERSION = "v1"` (`src/lib/eval/rubric.ts:6`); as regras novas
   do Kairo (referência pelo que o cliente vê; comparação; correção sem confissão; retomada leva
   algo novo; carinho = reconhecer antes de pedir) não estão no texto do prompt do juiz.
6. **Annotation queue existe e é idempotente** (`scripts/langfuse-annotation-queue.ts`), mas pende
   só dos detectores (`numero_fora_da_cota`, `promessa_sem_fato`) — os cenários de morte não estão
   enfileirados (Bloco D).
7. **Golden set e dataset run já rodam**: 51 cenários em `scripts/eval/golden/*.json`, 13 itens de
   conversa real em `dataset-seed-real.ts` (inclui `teste-death-adjacentes`:
   `voltei-sem-conteudo`, `remarketing-identico`), runner `pnpm eval` com `--dataset-run` gravando
   scores por item + agregado (`scripts/eval-run.ts`, `scoresDoItem`).

## Problema (por que)

O cenário de teste do Langfuse está montado (B1-B15) mas não é "perfeito para teste": o dataset run
não permite comparar condutas (run id muda a cada execução), a simulação não exercita a morte do
lead (os perfis não existem), a rubrica do juiz está atrás das regras novas do dono e dessincronizada
da instância, e o Kairo não consegue testar amanhã seguindo um único runbook. Nada disso prova
venda: a régua continua sendo o banco e o runner determinístico.

## Solução

Seis blocos (um worker por bloco, arquivos disjuntos), na ordem A→(B,C)→D→E→F abaixo. O juiz
(LLM-as-judge) é hipótese; o gate é o runner determinístico. Langfuse sem envs = no-op; falha de
observabilidade nunca muda veredito. Nenhum toque em `src/lib/agent/pi/*` (território de D-0080).

## Grandes ideias

1. **Mesmo sha de conduta = mesmo run.** O `runName` perde o timestamp e vira função do sha de
   conduta (código + versão publicada da caixa). Re-run com a mesma conduta alimenta o MESMO run
   (re-run é re-entrada, não rodada nova); conduta nova → sha novo → run novo → comparação
   side-by-side na UI.
2. **Perfis de morte na simulação.** Três perfis novos exercitam a morte: lead volta sem dar nada,
   lead silencia e retorna, lead trava no card. O que o runner não executa (retomada proativa via
   régua) fica documentado como precisa ser — hipótese de extensão, não infra inventada.
3. **Rubrica v2 com as regras do dono.** Cinco regras entram no `RUBRIC_SYSTEM_PROMPT` e a versão
   sobe para `v2`; a cópia portada do juiz online é regenerada e a sincronia passa a ser testada
   por comando.
4. **Instância conferida de verdade.** Score configs e annotation queue conferidos na instância
   real; cenários de morte enfileirados para o Kairo julgar.
5. **Flake zero.** Eval duas vezes seguidas; flake se conserta no assert, nunca no prompt.

## Variáveis

- `EVAL_GIT_SHA` — sha do código sob teste, passado pelo lançador (container não tem git).
- `CAIXA_LABEL` — label da caixa de prompt em teste (default `production`).
- `LANGFUSE_BASE_URL` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` — do ambiente ou vault
  (`secrets.sh get-key pi-agentes-aja-langfuse <CHAVE>`); sem elas, dataset run é no-op.
- `E2E_TEST_CPF` / `E2E_TEST_CELULAR` — exigidas pelos cenários com dado real (sem elas o cenário
  pula; skip ≠ verde).
- `SIM_COOKIE` / `SIM_BASE_URL` — sessão admin da simulação do playground.
- `AI_MODEL` / `LITELLM_BASE_URL` — gateway do LLM (sonda do eval e juiz).
- `EVAL_VERBOSE=1` — imprime a trajetória de cada turno mesmo quando passa.
- `RUBRIC_VERSION` — constante em `src/lib/eval/rubric.ts:6`, sobe para `v2`.

## Fluxo planejar → construir → verificar

1. **Planejar** (feito neste PRD): blocos A-F com `arquivo:linha` e gate por comando.
2. **Construir** (workers, arquivos disjuntos; um bloco por worker, cwd = esta worktree):
   - **Bloco A — determinismo do dataset run** (`scripts/eval-run.ts`,
     `scripts/eval/langfuse-dataset-run.ts` + teste): (a) `runName` deixa de levar timestamp e vira
     `gate-<sha-de-conduta>` — o sha de conduta passa a incluir a versão publicada da caixa
     (`caixa_de_prompt`), não só o código: se o `shaDoCodigo` (`scripts/eval-sha.ts`) não cobre
     conduta, estender o cálculo lá (o arquivo é do bloco); (b) `DatasetRunRecorder.iniciar`
     reusa o run existente com o mesmo `runName` (GET dos runs/dataset antes do POST do item —
     os itens com mesmo `runName`+`datasetItemId` já convergem no mesmo run pela API); (c) o score
     agregado por run sobrescreve (o comentário do score registra a rodada); (d) o diff entre
     runs de shas diferentes segue comparável na UI.
   - **Bloco B — perfis de morte e retomada** (`src/lib/playground/simulacao/perfis-de-cliente.ts`
     + teste, `scripts/eval/simulacao.ts`): (a) três perfis novos:
     `voltei-sem-nada` (volta "Voltei" sem conteúdo; agente não pode repetir o mesmo pedido),
     `silencio-total` (lead para de responder e volta depois; enquanto calado, o runner registra
     turno sem fala do cliente — se a rota do chat exigir mensagem, o roteiro usa pausa de
     N turnos com retorno e o achado documenta o limite),
     `card-travado` (lead vê o card e trava: "vou analisar", sem avançar; o agente tem de levar
     algo novo, não repetir o card); (b) cada perfil com roteiro e invariantes de morte
     (máx. 1 repetição do mesmo pedido; retomada leva algo novo); (c) DOCUMENTO na saída do
     script e no runbook: a retomada proativa do agente (régua de remarketing,
     `src/lib/remarketing/`) NÃO é exercitável pelo runner de turnos — precisa de um teste e2e
     próprio (`scripts/e2e-remarketing.ts` ou similar) disparando o job da régua contra conversa
     simulada; registrado como pendência deste plano, sem infra inventada.
   - **Bloco C — rubrica v2 + sincronia do juiz** (`src/lib/eval/rubric.ts` + testes,
     `scripts/langfuse-judge-online.ts`): (a) as cinco regras do Kairo entram no
     `RUBRIC_SYSTEM_PROMPT` como âncoras explícitas por dimensão:
     *referência pelo que o cliente vê* (continuidade: retomar do que o cliente disse/viu, não do
     estado interno), *comparação* (assertividade: comparar cartas com números de tool, nunca
     devolver a escolha), *correção sem confissão* (assertividade: corrigir o próprio erro sem
     culpabilizar nem confissão de falha de sistema), *retomada leva algo novo* (continuidade:
     retomada idêntica a texto anterior é falha), *carinho = reconhecer antes de pedir*
     (naturalidade: reconhecer o que o cliente disse antes de pedir o próximo dado);
     (b) `RUBRIC_VERSION` → `v2`; (c) o `PROMPT_DO_JUIZ` do juiz online é regenerado a partir do
     v2 com o mesmo ajuste de turno único; (d) teste de sincronia: comando compara o texto das
     duas fontes (import das duas constantes) e falha se divergirem além do ajuste de turno;
     (e) o script do juiz sincroniza a rule na instância (PATCH já existe em
     `langfuse-judge-online.ts:401-444`).
   - **Bloco D — instância conferida** (`scripts/langfuse-score-configs.ts`,
     `scripts/langfuse-annotation-queue.ts`, docs): (a) conferir os score configs na instância
     real (GET antes de POST, re-run idempotente), incluindo os configs de juiz (v2) e os
     BOOLEAN dos detectores; (b) estender a annotation queue para enfileirar também os cenários
     de morte (os 3 perfis do Bloco B + os golden `golden-real-voltei-sem-conteudo`,
     `golden-real-remarketing-identico`), não só os traces com detector ativo; (c) doc do
     catálogo atualizada.
   - **Bloco E — flake zero** (sem arquivo fixo: conserta o que quebrar; relatório no
     diário): (a) `pnpm eval` duas vezes seguidas; (b) cenário flaky → conserta o ASSERT (forbid,
     trajetória), nunca o prompt; (c) se o flake for infra (429, timeout), registrar como
     inconclusivo, não como falha de conduta.
   - **Bloco F — runbook** (chefe, ao fechar):
     `docs/design/planos/2026-11-05-langfuse-cenario-teste.md` (este arquivo, seção Runbook
     abaixo) — o Kairo testa amanhã seguindo só ele.
3. **Verificar** (gates por comando, por bloco):
   - **A**: `pnpm eval -- --dataset-run` duas vezes com o mesmo sha → mesmo `datasetRunId` nos
     dois logs e o relatório `.eval/relatorio-gate-<sha>.json` igual de nome; depois mudança de
     conduta (versão nova da caixa publicada em dev) → run id diferente → os dois runs
     comparáveis side-by-side na UI.
   - **B**: `pnpm test src/lib/playground/simulacao/perfis-de-cliente.test.ts` +
     `pnpm tsx scripts/eval/simulacao.ts --perfil voltei-sem-nada --perfil card-travado --perfil
     silencio-total` → os três rodando, com as marcações de morte acionadas quando o agente falha
     e sem marcação falsa quando conduz (veredito do relatório, não do juiz).
   - **C**: `pnpm test src/lib/eval/rubric.persona-context.test.ts scripts/langfuse-judge-online.test.ts`
     verde; `pnpm eval` com um cenário de retomada (`golden-real-voltei-sem-conteudo`) → as notas
     do juiz refletem as regras novas (reasoning cita a regra); sincronia viva via o teste de
     sincronia do (d).
   - **D**: `pnpm tsx scripts/langfuse-score-configs.ts` (idempotente, HTTP 200 em cada config) +
     `pnpm tsx scripts/langfuse-annotation-queue.ts` → fila na UI com itens dos cenários de morte.
   - **E**: `pnpm eval` ×2 → placares idênticos, zero flake; relatório no diário.
   - **F**: runbook percorrido por quem não escreveu o código (leitura do chefe contra os comandos).

**Ordem de execução**: Bloco A sozinho primeiro (toca `eval-run.ts`, o gate). Depois B e C em
paralelo (disjuntos: playground/ vs rubric+juiz). Depois D (depende de C para os configs de juiz
v2 e de B para os cenários de morte). Depois E (depende de tudo acima). F ao fechar, pelo chefe.

## Definição de pronto (com risco)

**Risco: ALTO** — o runner é o gate de promoção de conduta para produção; os blocos tocam o gate e
gravam na instância real de observabilidade. Justifica o gate lento: o eval real contra o app é o
gate da casa (premissa técnica do projeto), acima dos ~60 s por natureza.

Gates mínimos (comandos, saída esperada):
- `pnpm eval -- --dataset-run` ×2, mesmo sha → mesmo `datasetRunId`; sha novo → run novo; dois runs
  comparáveis na UI.
- `pnpm eval` completo verde (0 fail, 0 inconclusivo, cenários com env de teste existentes) —
  gate da casa.
- `pnpm test src/lib/playground/simulacao/ src/lib/eval/ scripts/` verde; `pnpm -s typecheck` verde.
- `pnpm tsx scripts/langfuse-score-configs.ts` e `...annotation-queue.ts` idempotentes, re-run sem
  duplicar.
- Flake: duas rodadas seguidas do eval com placar idêntico; conserto por assert, nunca por prompt.

## Como você será avaliado

1. Cada afirmação de código tem `arquivo:linha` real; divergências briefing × código registradas
   nos fatos (perfis de morte inexistentes, runName com timestamp, retomada não cabe no runner,
   juiz online dessincronizado, rubrica v1).
2. Um worker por bloco, arquivos disjuntos na mesma janela (A sozinho; B ∥ C; D depois; E por
   último; F pelo chefe).
3. Nenhum bloco toca `src/lib/agent/pi/*` (`turno-livre.ts`, `converse.ts`, `handoff.ts` etc.).
4. Gate por comando em todos os blocos; veredito de juiz nunca é gate.
5. `pnpm eval` verde no fechamento, com os três perfis de morte exercidos e o diff de runs provado.
6. Runbook que o Kairo segue sozinho: como rodar, o que olhar, onde o sinal aparece.

## Runbook de teste (o que o Kairo abre amanhã)

### 0. Ambiente (uma vez por sessão de teste)

O app em teste é o `next dev` desta worktree, na porta 3001 — não o container
`aja-app-develop` (ele roda o checkout principal, sem os consertos desta demanda):

```bash
cd /Users/kairo/orca/workspaces/aja-agora/chefe-eval-langfuse
pnpm exec next dev --port 3001 &        # logs em /tmp/aja-eval-dev.log
```

`.env.local` desta worktree já está apontado ao banco/gateway de dev compartilhados:
`DATABASE_URL` e `REDIS_URL` por IP de container do `aja-shared-pg`/`aja-shared-redis`,
`LITELLM_BASE_URL=http://aja-litellm-local.orb.local:4000`, `AI_MODEL=claude-haiku-5-5-alan-brow-twobrains`,
`AI_CLIENT_MODEL=claude-sonnet-5-alan-brow-twobrains`, `JUDGE_MODEL=claude-sonnet-5-alan-brow-twobrains`
(claude-sonnet-4-6 NÃO existe no gateway local — o juiz offline e a IA-cliente falham sem este override),
`TB_ENV=local`, `BETTER_AUTH_URL=APP_URL=http://127.0.0.1:3001` (sem isto o sign-in do eval
recebe 403 de origem). Deu 403 no login? Aguarde ~1 min (o Better Auth limita) e não logue na mão antes do eval.

Envs do Langfuse (cofre): `LANGFUSE_BASE_URL/PUBLIC_KEY/SECRET_KEY` de
`secrets.sh get-key pi-agentes-aja-langfuse`. Sem eles, tudo abaixo segue (no-op).

```bash
export AJA_BASE_URL=http://127.0.0.1:3001
export E2E_TEST_CPF=$(grep -E '^E2E_TEST_CPF=' .env.local | cut -d= -f2)
export E2E_TEST_CELULAR=$(grep -E '^E2E_TEST_CELULAR=' .env.local | cut -d= -f2)
export LANGFUSE_BASE_URL=$(secrets.sh get-key pi-agentes-aja-langfuse LANGFUSE_BASE_URL)
export LANGFUSE_PUBLIC_KEY=$(secrets.sh get-key pi-agentes-aja-langfuse LANGFUSE_PUBLIC_KEY)
export LANGFUSE_SECRET_KEY=$(secrets.sh get-key pi-agentes-aja-langfuse LANGFUSE_SECRET_KEY)
```

### 1. Gate: `pnpm eval -- --dataset-run`

Placar PASS/FAIL por cenário no fim; carimbo `gate-<sha>`. **Falha = não promova a caixa.**
Levante o cenário com `EVAL_VERBOSE=1` antes de decidir se é conduta ou assert.

### 2. Determinismo do run (a prova nova)

Rode o passo 1 DUAS vezes seguidas: mesmo sha de conduta → **mesmo dataset run** (o log
imprime o id; re-run alimenta o mesmo run, os scores sobrescrevem — "· rodada N" no comentário
do agregado). Conduta nova (código ou caixa publicada) → sha novo → run NOVO — os dois aparecem
lado a lado na UI (dataset `aja-agora-eval`, run `gate-<sha>-c<N>-<hash da caixa>`).

### 3. Simulação: perfis de morte

```bash
pnpm tsx scripts/eval/simulacao.ts --perfil voltei-sem-nada --perfil card-travado --perfil silencio-total --saida .eval/simulacao
```

com `SIM_COOKIE` de admin (login em `http://127.0.0.1:3001/api/auth/sign-in/email` com
`ADMIN_EMAIL/ADMIN_PASSWORD` de `.env.local`, pegue o cookie do header `Set-Cookie`). Olhe o
veredito por perfil e as marcações ACIONADAS: marcação acionada em cenário verde de conduta é
defeito de marcação (conserta-se no assert, nunca no prompt).

### 4. Sinal na instância (langfuse.twobrainstechnology.com)

- Dataset run `gate-<sha>` → aba Scores: `trajetoria_deterministica` agregado; `judge_*` por
  item (rubrica v2); `numero_fora_da_cota`, `promessa_sem_fato`, `retomada_sem_novidade` por item.
- Fila de anotação `calibracao-juiz`: as 6 sessões de morte (3 perfis + 2 golden de retomada)
  estão enfileiradas para o Kairo julgar.
- Juiz online: score `judge_avancou` recente — a rule só sincroniza depois de o Kairo criar o
  **LLM Connection** na UI da instância (API pública não cria; pendência manual registrada).

### 5. Rubrica v2

`RUBRIC_VERSION=v2` em `src/lib/eval/rubric.ts`; o prompt do juiz online é a mesma fonte
(teste `scripts/langfuse-judge-sync.test.ts` falha se as duas divergirem).

### 6. Sem Langfuse

Tudo acima segue (no-op) — o gate é o runner, nunca a instância.

### O que o eval mede HOJE (estado honesto)

Placar das duas rodadas finais: 48/4 e 47/5 PASS. As falhas são de conduta, não de infra:
- PERSISTENTE (todas as rodadas): `golden-madalena-junta` (oferta duplicada em
  `comparison_table`) e `golden-dono-chato-muda-de-assunto...` (R$ 1.6xx sem lastro).
- FLAKE-DE-CONDUTA (muda de cenário entre rodadas com a mesma conduta — o modelo às vezes
  repete pedido, às vezes manda `whatsapp_optin` sem artifact, às vezes mostra o mesmo grupo
  duas vezes na tabela): os demais.
Estes não são falha do cenário de teste — são o gate pegando conduta de verdade. Correção de
conduta é território da D-0080 (remendos de fala) e da premissa P11 (nenhum dedup em código).

## Perguntas em aberto — RESOLVIDAS
- **Q1** — Resolvida: o mandato do dono manda re-run da MESMA conduta alimentar o MESMO run.
  Implementado por âncora (item determinístico `aja-anchor-eval` + POST /dataset-run-items);
  a listagem de runs não existe na instância v4 events_only (endpoint devolve HTML 200).
- **Q2** — Resolvida: o sha de conduta cobre o código E o texto da versão publicada da caixa
  (`gate-<sha>-c<N>-<hash do texto>`; texto pesa, não só a versão).
- **Q3** — Resolvida: `silencio-total` exercita o retorno do lead; a retomada PROATIVA pela régua
  (`src/lib/remarketing/`, job externo) está documentada como pendência de e2e próprio.
- **Q4** — Resolvida: as regras vieram do recado literal do dono (WhatsApp 556292496793, 05/11
  01:42: "fala da carta pelo que o cliente vê no card...", "recomenda UMA carta...", "correção é
  o fato e reafirma a decisão, sem 'errei'/'me desculpe'") + as duas do mandato (retomada leva
  algo novo; carinho = reconhecer antes de pedir).
