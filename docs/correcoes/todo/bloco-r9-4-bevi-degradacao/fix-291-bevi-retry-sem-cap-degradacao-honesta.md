---
id: FIX-291
titulo: "busca na Bevi (Trilho B) empilha retries sem cap agregado e o funil segue roteirizado com dados vazios até quebrar no fechamento — sem degradação honesta"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-r9-4-bevi-degradacao
arquivos:
  - src/lib/adapters/bevi/self-contract-client.ts
  - src/lib/adapters/bevi/bevi-self-contract-adapter.ts
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/web/adapter.ts
rodada: "2026-07-12 loop r9 ONDA 4 (pós-onda-3 4/10, P0 Negócio/E2E, veredito-r9pos3-sonnet.md §3+§6)"
---
## Palavras do juiz (veredito r9pos3, Sonnet 5 — P0 Negócio+E2E, "erro do mario")
> "search_groups estoura o timeout de 90s do coletor [...] o funil segue roteirizado
> (`two_paths` com administradora:''/monthlyPayment:null); no offer-confirm, falha explícita:
> 'Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?' — sem real_offer, sem
> recovery, conversa termina em erro [...] a AUSÊNCIA de contenção (retry sem teto agregado, sem
> mensagem de 'estamos com uma instabilidade' pro usuário, sem estado de recuperação no
> fechamento) É um gap de produto real."
> — `.processo/loop/evidencias-r9/veredito-r9pos3-sonnet.md` §3 (mario-sem-lance) + §6 (causa-raiz)

## Cenário exato
- **Rota/tela:** chat, dossiê `mario-sem-lance` — ação "Valor do bem: R$ 70.000" (automóvel)
  dispara `search_groups` no turno 7.
- **Passos:** `search_groups` nunca completa dentro do timeout do coletor (90s); o funil
  determinístico segue os turnos seguintes como se a busca tivesse dado certo (educação,
  timeframe, `two_paths` degenerado no turno 10); no turno 13 o agente narra "vamos só concluir
  essa etapa" sem tool-call; no turno 14 (`offer-confirm`) o `confirmOffer` lança e o catch
  devolve "Tive um problema ao gerar sua proposta" sem recovery — conversa termina em erro.
- **Dados usados:** `dossies-r9pos3/mario-sem-lance/dossie.json` turnos 7, 10, 13, 14.

## Esperado × Atual
- **Esperado:** a busca na Bevi tem um teto AGREGADO de tempo/retry razoável para o turno de chat;
  se esgotar ou vier vazia, o sistema avisa honestamente ("instabilidade temporária" + convite a
  tentar de novo/D10) e NUNCA avança pro reveal/fechamento com dados vazios/nulos.
- **Atual:** cada camada de retry empilha independentemente, sem orçamento agregado, e o
  fechamento (offer-confirm) só descobre o problema no fim, sem diferenciar "Bevi degradou a
  busca antes" de qualquer outra falha.

## Root cause (INVESTIGADO — provado no código)
**(a) Retries empilham sem cap agregado — cada camada tem SEU próprio orçamento, ninguém soma:**
- `self-contract-client.ts:130-136`: `SIM_TIMEOUT_MS=30_000`, `SIM_RETRY=4`,
  `SIM_RETRY_DELAY_MS=400` — o método `call()` (linhas 159-193) tenta até `SIM_RETRY` vezes em
  404/timeout transitório na chamada de simulação → até **~120s só nessa chamada**.
- `bevi-self-contract-adapter.ts:291-329` (`offersForValue`): faz DUAS chamadas SEQUENCIAIS de
  `ensureOffers` (linha 307 "sem" embutido, linha 312 "com" embutido, FIX-219) — a variante "sem"
  é a baseline e propaga erro real (linha 287 comentário: "falha aqui é falha real de busca,
  propaga"); cada uma sujeita ao MESMO retry de 4×30s acima → pior caso teórico **~240s** só nesta
  função, antes de qualquer outra camada.
- `ai-sdk.ts:1249-1276` (`runDiscovery`): trata timeout/erro transitório como "1 retry silencioso"
  — mas esse retry **reexecuta a função inteira da tool** (`fn()`), ou seja, reexecuta
  `offersForValue` (as DUAS chamadas sequenciais de novo) — dobrando o pior caso agregado pra
  **~480s teórico** numa única invocação de `search_groups`.
- Nenhuma camada conhece o orçamento das outras — não há um teto agregado (ex.: "não passe de
  Xs no total, cancele e degrade" cruzando client+adapter+tool).
- **Consequência observada:** o coletor de teste (timeout de 90s, análogo a qualquer cliente
  real — browser/WhatsApp — que não vai esperar minutos) abandona a conexão MUITO antes do
  servidor decidir se vai desistir; o usuário fica sem resposta alguma, não uma mensagem de
  degradação.

**(b) Quando a busca falha/atrasa, o funil segue roteirizado com dados vazios em vez de degradar:**
- Existe um mecanismo de degradação honesta PRONTO — `discoveryFailedResult`/
  `isDiscoveryFailedResult` (`ai-sdk.ts`) + `result.discoveryFailedThisTurn` consumido em
  `orchestrator/index.ts:461-467` (`buildDiscoveryFailedFallback`) — mas ele só cobre o TURNO em
  que a tool efetivamente retorna o marcador de falha DENTRO do tempo de resposta do turno atual.
- No caso do mario, o timeout do CLIENTE (90s) estourou antes da resposta do servidor (que ainda
  podia estar dentro do orçamento empilhado de (a)) — o turno nunca chegou a emitir
  `discoveryFailedThisTurn` de forma útil pro usuário (a conexão já tinha caído). Turnos
  SEGUINTES da conversa (funil determinístico via `pipeSearchSummaryTurn`,
  `src/lib/web/adapter.ts:506-540`, e os turnos de two_paths/contract-submit) não verificam se o
  reveal anterior de fato completou (`meta.revealCompleted`) antes de avançar — produzindo o
  `two_paths` degenerado (`administradora:""`, `monthlyPayment:null`) no turno 10 e a falha crua
  "Tive um problema..." no turno 14 (`route.ts:821-834`), sem diferenciar "Bevi degradou aqui
  atrás" de qualquer outro erro.
- **Não confirmado a fundo** (fora do escopo desta investigação rápida): o arquivo/função exata
  que decide avançar pro `two_paths`/`contract-submit` sem checar `revealCompleted` — candidatos
  prováveis são `src/lib/agent/qualify-state.ts` (`nextGate`/`decideShowGate`) e
  `src/lib/agent/orchestrator/two-paths-payload.ts`; o executor do bloco deve confirmar antes de
  implementar o gate.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| **(a) Cap agregado**: introduzir um orçamento de tempo TOTAL pra descoberta de um turno (ex.: ~40-50s, abaixo do timeout de qualquer cliente real) que cruza client+adapter+tool — se estourar, aborta e retorna falha honesta em vez de deixar cada camada retentar isoladamente. Reduzir a duplicação do retry entre `self-contract-client.ts` (SIM_RETRY) e `ai-sdk.ts` (`runDiscovery`) — não retentar a MESMA operação em 2 camadas independentes | `self-contract-client.ts` (~130-193), `bevi-self-contract-adapter.ts` (~291-329, considerar orçamento compartilhado entre as 2 chamadas sequenciais), `ai-sdk.ts` (~1249-1276, `runDiscovery` não deve reexecutar operação já limitada por cap interno) |
| **(b) Degradação honesta + recovery (D10)**: turnos subsequentes do funil determinístico (`pipeSearchSummaryTurn` e o que decide avançar pro `two_paths`/fechamento) checam `meta.revealCompleted`/dado real antes de prosseguir — se a descoberta não completou, emite mensagem honesta de instabilidade + oferece retry, nunca avança com `administradora:""`/`monthlyPayment:null` nem deixa o offer-confirm quebrar sem contexto | `src/lib/web/adapter.ts` (`pipeSearchSummaryTurn`, ~506-540) + investigar `qualify-state.ts`/`two-paths-payload.ts` no início do bloco |
| **NÃO** paralelizar as chamadas reais à Bevi (decisão já registrada, PENDENTE-AGX) — a correção é de TETO/DEGRADAÇÃO, não de concorrência | escopo travado |

## Regressão exigida
- Novo teste (integration, mock do `self-contract-client`/adapter simulando timeout persistente):
  assevera que o tempo total até a falha honesta fica DENTRO de um teto razoável (não soma
  4×30s × 2 chamadas × 2 camadas de retry).
- Novo teste: com a descoberta falhando/atrasando, o turno SEGUINTE (que geraria `two_paths` ou
  avançaria pro fechamento) NUNCA produz artifact com campos vazios/nulos (`administradora:""`,
  `monthlyPayment:null`) — em vez disso emite o fallback honesto de degradação.
- `pnpm test:unit` verde.
