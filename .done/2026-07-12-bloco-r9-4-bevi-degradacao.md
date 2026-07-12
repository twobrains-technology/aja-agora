# Bloco r9-4 bevi-degradacao — FIX-291

## Resumo

Item único, P0 Bevi third-party (veredito r9pos3, Sonnet 5, §3+§6 — "erro do mario"): a busca
na Bevi (`search_groups`) empilhava retries independentes em 3 camadas (client, adapter, tool)
sem teto agregado (pior caso teórico ~480s numa única chamada) e, quando falhava, o marcador de
idempotência da busca (`searchDispatched`) ficava travado em `true` pra sempre — nenhum turno
seguinte re-tentava, o usuário ficava sem resposta útil e sem recovery.

## Investigação do passo 3 — o que o card supunha × o que o código provou

O card marcava como NÃO CONFIRMADO qual arquivo deixava o funil avançar pro `two_paths`/
fechamento sem checar `meta.revealCompleted`, apontando `qualify-state.ts` (`nextGate`) e
`two-paths-payload.ts` como candidatos.

**Lendo os dois com atenção, a suposição estava parcialmente ERRADA**: `nextGate()` já gateava
corretamente TODOS os gates pós-reveal (`experience`, `lance*`, `simulator-offer`, `decision` —
inclusive o atalho `so_parcela` que dispara `two_paths`) atrás de `meta.revealCompleted === true`.
`coerceTwoPathsPayload` também já era defensivo (só produz payload vazio quando o `offer` que
recebe é `null`).

**O gap real** (confirmado lendo `web/adapter.ts` + `orchestrator/index.ts` + `runner.ts`): os
dois pontos que disparam a busca marcavam `searchDispatched = true` PREEMPTIVAMENTE, antes de
saber se ela ia funcionar — enquanto `runner.ts` já persistia esse mesmo marcador corretamente,
atrelado a `revealCompleted` (só quando artifacts REAIS de reveal aparecem). O marcador
preemptivo é quem travava o retry pra sempre na falha.

Achado colateral fora de escopo: `comparison_table` está em `REVEAL_ARTIFACTS` (âncora
`revealCompleted`) mas fora da lista de `snapshotAnchor` em `runner.ts` — se o único artifact do
turno for `comparison_table`, `revealCompleted` vira `true` sem popular `recommendedOffer`.
Path de SUCESSO, não de falha Bevi — documentado, não corrigido (candidato a `anota-bug`).

## Decisão de design

Ver ADR completa:
[`docs/correcoes/decisions/2026-07-12-bloco-r9-4-bevi-degradacao.md`](../docs/correcoes/decisions/2026-07-12-bloco-r9-4-bevi-degradacao.md).

- **Decidi** medir o teto agregado (a) na camada de TOOL (`runDiscovery`, `ai-sdk.ts`) via
  `Promise.race` contra um deadline único (1ª tentativa + retry), **em vez de** threading um
  deadline pelas assinaturas do client/adapter, **porque** é o ponto mais próximo do turno de
  chat, cobre TODAS as camadas de baixo sem mudar `AdministradoraAdapter` (interface
  compartilhada com outros adapters) nem `BeviSelfContractClient`/`BeviSelfContractAdapter`.
- **Decidi** NÃO threadar `AbortSignal` até a fetch (não cancela o request HTTP em voo quando o
  teto estoura), **em vez de** cancelamento real cruzando camadas, **porque** o ganho (evitar 1
  request órfã) não justifica mudar assinaturas compartilhadas — o usuário já nunca espera além
  do teto, que é o invariante que importa.
- **Decidi** resolver o gap (b) removendo os dois `persistMeta(searchDispatched:true)`
  preemptivos e deixando `runner.ts` (já correto) ser a ÚNICA fonte de verdade do marcador, **em
  vez de** threadar um novo sinal explícito `discoveryFailed` pelos retornos das funções, **porque**
  `runner.ts` já fazia exatamente a persistência certa (atrelada a `revealCompleted`) — bastava
  parar de escrever o valor errado por cima antes do resultado real chegar.
- **Decidi** corrigir os DOIS disparadores de busca (`web/adapter.ts`, no `escopo_arquivos`
  original, e `orchestrator/index.ts`, fora dele), **em vez de** só o declarado, **porque** são
  espelhos exatos do mesmo bug (clique de gate vs. texto livre) — corrigir um só deixaria a
  metade do bug viva.
- Não precisei de `AskUserQuestion`: depois de ler o código, o cap agregado na tool e o marcador
  atrelado a `revealCompleted` eram a escolha claramente correta (sem alternativa de produto/UX
  em jogo), não um trade-off real de arquitetura a decidir com o Kairo.

## Implementação

- `ai-sdk.ts` — `runDiscovery` ganha um deadline agregado (`DISCOVERY_BUDGET_MS = 45_000`,
  seam de teste `__setDiscoveryBudgetForTests`) via `withDiscoveryBudget` (`Promise.race` contra
  o restante do orçamento); o retry silencioso só roda se sobrar orçamento (nunca reexecuta a
  função inteira sem checar o teto — a duplicação que dobrava o pior caso pra ~480s).
- `web/adapter.ts` (`pipeSearchSummaryTurn`) — removido o `persistMeta(searchDispatched:true)`
  preemptivo; agora recarrega o meta DEPOIS do turno de descoberta e só persiste
  `searchDispatched:true` quando `revealCompleted` confirma que artifacts reais apareceram.
- `orchestrator/index.ts` (branch `nextGateToFire === "search"`) — mesmo tratamento: remove o
  `persistMeta` preemptivo, usa o `postReveal` (já recarregado ali) pra decidir; sem
  `revealCompleted`, loga `[discovery-degraded]` e encerra sem travar o marcador.

## Testes

**TDD strict, confirmado RED→GREEN nos dois itens:**

- `ai-sdk.fix-291-budget.test.ts` — adapter que NUNCA resolve (`search_groups`); RED antes do
  fix (função `__setDiscoveryBudgetForTests` inexistente); GREEN depois: prova que o tempo total
  até o marcador de falha fica dentro do teto agregado (mesmo com adapter pendurado) e que o
  retry não reexecuta a chamada quando o orçamento já esgotou (1 única chamada real).
- `adapter.fix-291-search-recovery.test.ts` — simula um turno de descoberta que falha
  (`finish reason: "discovery-failed"`); RED antes do fix (`persistMeta` gravava
  `searchDispatched:true` mesmo na falha); GREEN depois: nenhuma chamada a `persistMeta` grava
  `searchDispatched:true`, e a mensagem honesta de degradação chega ao usuário.
- `pnpm test:unit` verde: **3325 testes, 361 arquivos, 0 falhas** (rodado com `DATABASE_URL` e
  `ANTHROPIC_API_KEY` reais via `secrets.sh decrypt aja-agora` — sem isso, 4 testes pré-existentes
  falham por ausência de DB no worktree, confirmado idêntico via `git stash` ANTES desta mudança
  — não é regressão introduzida aqui).
- Lint (`biome check`) limpo nos arquivos tocados; corrigidos de passagem 2 lints pré-existentes
  e triviais nos mesmos arquivos (import não usado em `ai-sdk.ts`, ordenação de imports em
  `adapter.ts`) — mecânicos, zero mudança de comportamento.
- Pre-commit Camada 3 (LLM real, obrigatória pra mudança em tool/agent) verde nos 2 commits de
  código.

## Escopo — divergência do declarado

`self-contract-client.ts`/`bevi-self-contract-adapter.ts` (declarados no `escopo_arquivos`)
**não precisaram de mudança** — o cap agregado ficou inteiramente na camada de tool (decisão
acima). Adicionei `orchestrator/index.ts` (fora do declarado) por ser o espelho do bug corrigido
em `web/adapter.ts`. Overlap nível 2 com `bloco-r9-4-reveal-serverside` (`ai-sdk.ts`,
`runDiscovery`/`search_groups`/`recommend_groups` ~1249-1360 vs. tools de apresentação
~1148-1173 do outro bloco) — não tocado por mim fora da região declarada; se esse bloco já
tiver mergeado, conflito esperado é só mecânico (linhas adjacentes).

## Gaps honestos

- Não há cancelamento real do request HTTP em voo quando o teto agregado estoura (decisão D1,
  ver ADR) — request órfão descartado silenciosamente ao resolver, sem side-effect observável
  pro usuário.
- Gap de `comparison_table`/`recommendedOffer` em `runner.ts` (achado colateral, path de
  sucesso) documentado mas não corrigido — fora do escopo do FIX-291, candidato a `anota-bug`.
- Não validei em produção real contra a Bevi (fora do escopo — regressão via mocks determinísticos,
  nunca bate na Bevi real, conforme instrução do bloco).
