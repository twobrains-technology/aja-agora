---
titulo: "Bloco jornada-conversa — copy reserva de cota, gate identify WhatsApp forçado, lance pós-reveal"
data: 2026-07-04
bloco: bloco-jornada-conversa
branch: feat/jornada-conversa-reserva
tipo: feature/fix de fluxo conversacional (Refino Ata 2026-07-04, itens 1, 8 e 9)
---

# Bloco jornada-conversa — reserva de cota, gate identify forçado, lance pós-reveal

Pacote de 3 correções da Ata de alinhamento com o cliente (2026-07-04), todas na
mesma família de arquivos conversacionais (`route.ts`, `interactive-handlers.ts`,
`qualify-state.ts`, `system-prompt.ts`, `formatter.ts`). Executadas em sequência
(copy → gate WhatsApp → reorder de lance) porque cada uma assenta terreno pra
próxima.

## TL;DR

- **FIX-216** — terminologia "reserva de cota" em todo texto de usuário
  (contratar/fechar → reservar), frase de booking ("não paga nada agora, só
  quando chegar o boleto") e wording de reserva concluída deixando claro que dá
  pra iniciar um NOVO consórcio.
- **FIX-217** — o gate `identify` no WhatsApp virava texto solto ignorável;
  agora é determinístico e forçado — QUALQUER texto do usuário durante o gate
  é interceptado (CPF válido/inválido/qualquer outra coisa), nunca cai no
  pipeline geral do agente.
- **FIX-215** — a pergunta de lance saiu do início da jornada; a busca dispara
  direto após valor+identidade; a conversa de lance (recurso próprio +
  embutido) reentra automaticamente logo após o reveal, antes do simulador de
  contemplação.
- **Achado extra corrigido** (fora da letra dos 3 cards, mas na mesma classe de
  bug): reordenar o lance quebrava a tolerância do FIX-208 a `intent: neutral`
  no gate `search` — corrigido em código, não só nos testes (ver seção FIX-215).
- **Gate**: `pnpm test:unit` verde — 284 arquivos / 2767 testes, rodado 5× ao
  longo do bloco (a cada mudança relevante) num container transitório (host
  sem node_modules, convenção `local-dev-workspaces`).

## Commits

| Commit | O quê |
|---|---|
| `c2a02177` | feat: troca terminologia contratar/fechar por reserva de cota (FIX-216) |
| `d25d4d2d` | docs: move fix-216 pra done |
| `b1efa025` | docs: corrige frontmatter do fix-216 done (staging incompleto do mv anterior) |
| `43f3d2db` | docs: registra decisão de design do FIX-215 (ADR) |
| `105731f3` | fix: força o gate identify no WhatsApp a nunca cair no pipeline geral (FIX-217) |
| `d93860ac` | docs: move fix-217 pra done |
| `729bf8ab` | feat: move a conversa de lance do início pro pós-reveal (FIX-215) |
| `ac3146bf` | docs: move fix-215 pra done e apaga bloco-jornada-conversa esvaziado |

## FIX-216 — copy "reserva de cota"

11 pontos trocados (`chat/types.ts`, `route.ts`, `formatter.ts`,
`system-prompt.ts`, `directives.ts`, `contract-form.tsx`,
`template-form-dialog.tsx`) + **4 achados extras** da mesma classe de defeito
que o grep original não pegou (mesma string "sua ficha está completa"/"fechar
a carta" repetida no canal WhatsApp, comentário desatualizado citando o label
antigo do botão, quotes literais do label antigo espalhadas em system-prompt/
directives/testes de regressão) — corrigidos porque são o MESMO bug, só que
não listados no card original.

A frase de booking foi embutida em `buildAdvanceToContractDirective` (e
espelhada em `buildChooseOfferDirective`), o caminho comum de avanço ao passo 5
usado por Web e WhatsApp. Identificadores de código (`intent:"contratar"`,
`contractState`, `present_contract_form`) permanecem intactos — só o texto que
o usuário lê mudou.

**Testes**: 5 arquivos de teste atualizados (asserts que checavam a string
antiga) + os já existentes reescritos, nunca pulados.

## FIX-217 — gate identify WhatsApp determinístico

Investigação encontrou que `captureIdentifyText` (identify-capture.ts) **já
existia** e já interceptava texto no formato de CPF — mas para QUALQUER OUTRO
texto (pergunta, tentativa de pular: "acha logo os grupos"), retornava
`handled: false` e o turno caía no pipeline geral do agente, que podia narrar
avanço/busca sem o CPF coletado (o achado real do inbox
`2026-07-01-whatsapp-identify-gate-nao-pede-cpf-narra-busca.md`).

**Fix**: novo outcome `"ask-cpf"` — enquanto o gate `identify` está ativo, TODO
texto é interceptado (`captured`/`invalid`/`ask-cpf`), nunca `handled: false`.
`processor.ts` reemite o pedido de CPF nesse caso, sem tocar no orchestrator
geral. Celular segue nunca perguntado (`waIdToCelular`).

**Testes**: arquivo novo `identify-capture.gate-forced.test.ts` (8 casos) +
extensão de `processor.test.ts` provando, no nível de wiring, que
`processWithOrchestrator` NUNCA é chamado quando o gate intercepta.

## FIX-215 — lance sai do início, entra pós-reveal

`qualify-state.ts::nextGate` reordenado: `credit` (valor) cai DIRETO em
`search` (busca/reveal); os gates `lance`/`lance-value`/`lance-embutido`
foram realocados pra depois de `revealCompleted===true`, antes de
`simulator-offer`. `COLLECTION_GATES` manteve os 3 gates de lance (a tolerância
a `intent: neutral` do FIX-208 continua válida na nova posição).

**Decisão de design** (única pergunta aberta do card, resolvida via
`AskUserQuestion` — opção recomendada escolhida): a conversa de lance re-entra
**automaticamente, logo após o reveal, antes do simulador de contemplação** —
não via heurística de "demonstrou interesse" (não-determinístico) nem via
botão explícito opt-in (fricção contrária ao espírito da mudança). Motivo
técnico decisivo: o simulador de contemplação (P5 da jornada) promete mostrar
a parcela caindo com lance embutido — precisa do dado ANTES de rodar.
Registrado em `docs/decisoes/blocos/2026-07-04-bloco-jornada-conversa.md`.

**Achado extra corrigido (não estava no card, mas é a MESMA classe de bug)**:
mover o lance pra depois do `search` quebrava silenciosamente a tolerância do
FIX-208 a `intent: neutral` — antes, `credit` sempre caía em `lance`
(COLLECTION_GATE, tolerante); agora cai em `search`, que exigia sinal forte
(`ready_to_proceed`/`providing_info`). Sem correção, o MESMO bug do FIX-208
("200" classificado como neutral por timeout de cold-start do analyzer trava o
funil) reapareceria bem na virada credit→search. Corrigido estendendo
`decideShowGate`: `search` tolera `neutral` quando `!searchDispatched` (a
PRIMEIRA busca) — depois disso, só `revealValueTargetChanged` reabre.

**Web × WhatsApp**: os handlers de conclusão do gate `lance-embutido`
(`route.ts` e `interactive-handlers.ts`) paravam de chamar
`pipeSearchSummaryTurn`/`runSearchSummaryWithOrchestrator` incondicionalmente
(re-buscaria à toa, já que a busca ocorreu antes) — agora consultam `nextGate`
e despacham o passo real (`simulator-offer`/`decision`).

**Testes**: reescritos ~15 testes que assumiam a ordem antiga (nunca
`skip`/`.only`/`@ts-ignore`) + 3 arquivos novos: `qualify-state.fix215.test.ts`
(10 casos, as 4 regressões exigidas pelo card num só lugar), extensão de
`interactive-handlers.lance-embutido-no-maybe.test.ts` (paridade WhatsApp) e de
`lance-embutido-gate.test.ts` (estrutural, paridade web).

## Gaps honestos

- **T2 (lance embutido amortiza dívida)** segue como tensão registrada na
  jornada canônica — este bloco não mexe no MODELO financeiro do lance, só na
  ORDEM em que a conversa acontece.
- **Onda 2** (recomendação em 2 estágios, PDF com marca própria) — fora do
  escopo deste bloco por design (a Ata já marca como "onda 2").
- Não validei manualmente no simulador (`/admin/simulator/whatsapp`) — a
  suíte é 100% determinística/unitária; um QA de tela (Playwright real) da
  jornada completa pós-reorder fica pro `qa-autonomo`/`qa-dono-produto` de
  acompanhamento, já que este bloco rodou em container transitório sem app
  subido.
- O comentário em `ai-sdk.ts` (tool description de `present_contract_form`)
  ainda cita `'Sim, quero contratar agora'` — arquivo fora do
  `escopo_arquivos` declarado do bloco (risco de conflito com blocos irmãos
  da mesma onda); registrado aqui em vez de tocado às cegas.
