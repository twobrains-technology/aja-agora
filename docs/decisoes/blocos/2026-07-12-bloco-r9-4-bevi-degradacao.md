---
bloco: bloco-r9-4-bevi-degradacao
data: 2026-07-12
onda: 1
itens: [FIX-291]
---
# Decisões de design — Bevi: cap agregado + degradação honesta (FIX-291)

## Investigação do passo 3 (obrigatória antes de implementar) — resultado

O card marcava como **NÃO CONFIRMADO** qual arquivo decide avançar pro
`two_paths`/fechamento sem checar `meta.revealCompleted`, com dois candidatos
prováveis: `qualify-state.ts` (`nextGate`/`decideShowGate`) e
`orchestrator/two-paths-payload.ts`.

**Lido com atenção — a suposição do card estava PARCIALMENTE ERRADA:**
`qualify-state.ts.nextGate()` **já** gate corretamente todos os gates
pós-reveal (`experience`, `timeframe`, `lance`, `lance-value`,
`lance-embutido`, `simulator-offer`, `decision` — inclusive o atalho
`so_parcela` que dispara o `two_paths`) atrás de `meta.revealCompleted ===
true` (linhas 131, 151, 178-179). `two-paths-payload.ts` também está correto:
`coerceTwoPathsPayload` só produz `administradora:""`/`monthlyPayment` vazio
quando o `offer` que recebe é `null` — ele não inventa nada por conta própria.

**O gap real (confirmado lendo `web/adapter.ts` + `orchestrator/index.ts` +
`runner.ts`):** os DOIS pontos que disparam a busca (`pipeSearchSummaryTurn`
em `web/adapter.ts:523`, caminho de clique/gate; e o branch
`nextGateToFire === "search"` em `orchestrator/index.ts:635`, caminho de
texto livre) marcavam `meta.searchDispatched = true` **preemptivamente**,
ANTES de rodar a busca de verdade — não depois de confirmar que ela
funcionou. `runner.ts` já persiste `searchDispatched: true` **junto** com
`revealCompleted: true`, mas só quando artifacts REAIS de reveal aparecem
(linha 967-1003) — ou seja, o dado correto (`revealCompleted`) já existia,
só não era ele quem controlava o marcador de idempotência da busca.

Consequência do marcador preemptivo: quando a busca falhava/degradava
(`discoveryFailedThisTurn`), `searchDispatched` ficava travado em `true` **pra
sempre** — e os dois curto-circuitos de idempotência
(`pipeSearchSummaryTurn`: `if (refreshed.searchDispatched) return;` /
`index.ts`: `finish("search-already-dispatched")`) nunca mais deixavam
retentar a busca num turno seguinte, mesmo sem o usuário jamais ter visto
dado real. Isso bate com o sintoma do veredito ("conversa termina em erro,
sem recovery") — só que o mecanismo exato é o marcador preemptivo, não a
ausência de gate em `qualify-state.ts`.

Achado colateral, **fora do escopo deste bloco** (não é sobre falha/timeout
Bevi, é sobre uma busca bem-sucedida): em `runner.ts` (~971-987),
`comparison_table` está em `REVEAL_ARTIFACTS` (âncora revealCompleted=true),
mas NÃO está entre os candidatos de `snapshotAnchor` (só
`simulation_result`/`recommendation_card`/`group_card`) — se o único artifact
do turno for `comparison_table`, `revealCompleted` vira `true` sem nunca
popular `meta.recommendedOffer`. Isso teoricamente também alimentaria um
`two_paths` degenerado (via `coerceTwoPathsPayload(_, null)`), mas por um
caminho de SUCESSO, não de falha Bevi. Registrado aqui pra anotar depois via
`anota-bug` — não mexi em `runner.ts` porque não é o root cause do FIX-291
(que é especificamente sobre timeout/degradação Bevi) e o arquivo não está no
`escopo_arquivos` do bloco.

## D1 — Onde medir o cap agregado (a)

**Decisão:** o teto agregado (`DISCOVERY_BUDGET_MS = 45_000`) é medido na
camada de **TOOL** (`runDiscovery` em `ai-sdk.ts`), envolvendo a chamada
inteira (1ª tentativa + retry) num `Promise.race` contra um deadline único
por invocação de tool.

**Por quê, e não no client ou no adapter:**
- É o ponto mais próximo do turno de chat — o lugar onde "o usuário está
  esperando uma resposta" vira um invariante de código, sem precisar mudar a
  assinatura pública de `AdministradoraAdapter` (usada por outros adapters,
  ex. mock) nem do `BeviSelfContractClient`/`BeviSelfContractAdapter` — ambos
  ficam com escopo intacto, só o chamador (tool) impõe o teto.
- Cobre a origem exata do "pior caso ~480s" do root cause (a): o retry
  silencioso do `runDiscovery` que REEXECUTA `fn()` inteira (rebuscando as 2
  chamadas sequenciais do adapter) — com o deadline compartilhado entre a 1ª
  tentativa e o retry, o retry só roda se sobrar orçamento, e mesmo assim
  nunca ultrapassa o teto total.
- `Promise.race` não cancela a fetch pendente das camadas de baixo (não há
  `AbortSignal` threaded) — é uma limitação aceita: o request HTTP client→Bevi
  que já saiu continua em voo e será descartado quando resolver (sem action
  alguma), mas o USUÁRIO nunca espera além do teto. Cancelamento real via
  `AbortSignal` cruzando client/adapter/tool ficaria bem mais invasivo
  (mudaria assinaturas compartilhadas) pra um ganho (economizar 1 request HTTP
  órfã) que não afeta o usuário — não fiz por desproporção custo/risco vs.
  benefício.

**Alternativa considerada e descartada:** medir o orçamento dentro do
`bevi-self-contract-adapter.ts` (threading um deadline por todas as chamadas
`ensureOffers`/`simulate`). Descartada porque exigiria mudar a assinatura de
métodos privados E do client, sem ganho adicional sobre medir no chamador —
o teto na tool já cobre TODAS as camadas de baixo (client+adapter), inclusive
qualquer retry futuro que se acrescente lá embaixo, sem precisar tocar de
novo neste bloco.

## D2 — Como liberar o recovery (b)

**Decisão:** removi o `persistMeta(..., { searchDispatched: true })`
preemptivo dos dois disparadores de busca (`web/adapter.ts` e
`orchestrator/index.ts`) e deixei o `runner.ts` (que já fazia isso
corretamente, atrelado a `revealCompleted`) ser a ÚNICA fonte de verdade do
marcador. Quando a descoberta falha/degrada neste turno, nenhum dos dois
pontos volta a marcar `searchDispatched`, e o `nextGate()`/`decideShowGate()`
existentes (já corretos, ver investigação acima) libertam o "search" pra
retry num turno seguinte — sem precisar o usuário mudar de faixa de valor.

A mensagem honesta de degradação em si **já existia e já funcionava**
(`buildDiscoveryFailedFallback` em `orchestrator/index.ts:461-467`, disparada
uniformemente pelos dois caminhos porque ambos usam o mesmo `runTurn`) — não
precisei criar mensagem nova, só destravar o retry.

## Escopo de arquivos — divergência do `escopo_arquivos` original

O card declarava `self-contract-client.ts`, `bevi-self-contract-adapter.ts`,
`ai-sdk.ts`, `web/adapter.ts`. Nenhuma linha mudou em
`self-contract-client.ts`/`bevi-self-contract-adapter.ts` (o cap agregado
ficou só na tool, D1 acima) e **adicionei** `orchestrator/index.ts` (fora do
`escopo_arquivos` declarado) porque é o espelho exato do bug de
`web/adapter.ts` — corrigir só um dos dois caminhos deixaria a metade do bug
viva (o caminho de texto livre continuaria travando `searchDispatched`).
