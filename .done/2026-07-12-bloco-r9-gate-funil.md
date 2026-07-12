# Bloco r9 gate-funil — FIX-279 + FIX-280

## Resumo

Os 2 itens deste bloco eram as duas divergências de **ordem/determinismo do funil** que
derrubaram a nota Funcional (5/10) no baseline r9 (loop de goal, jornada de vendas de
consórcio). Ambos no mesmo eixo: gates que deveriam disparar de forma determinística e não
estavam.

- **FIX-279** — o gate `credit` (agulha do valor do bem, P4 do canônico, marcado ✅
  resolvido) nunca aparecia em 5/5 dossiês: o analyzer preenchia `creditMax` a partir do
  turno de `desire` (texto livre, bem+valor juntos), **antes** de o gate `credit` ficar
  ativo — quando `nextGate()` chegava lá, a condição já era falsa.
- **FIX-280** — `present_whatsapp_optin` disparava em mario-sem-lance turno 7 e não em
  madalena no mesmo ponto do funil: mesmo toolset, mesmo estado, resultado divergente
  (LLM-discricionário, não determinístico).

## FIX-279 — guard `activeGateAtTurnStart` no merge de `creditMax`

Correção fechada desde o card (sem decisão de design em aberto): replicar o guard que o
FIX-236 já aplicou pro campo irmão `hasLance` (`analyze.ts:140`), agora pro merge de
`creditMax` (`analyze.ts:94`). `isRevealRefit` (troca de faixa pós-reveal, legítima) segue
como exceção separada, independente do gate ativo no momento.

**TDD:** teste cobrindo "bem+valor no mesmo turno do desire" → creditMax rejeitado (FALHOU
antes do fix, PASSOU depois, confirmado ao vivo). 4 testes pré-existentes tiveram a `meta` de
fixture ajustada pra refletir "gate credit realmente ativo" — sem isso, eles próprios
exercitavam o caminho do bug (captura fora do gate) e quebrariam com o fix correto.

## FIX-280 — opt-in de WhatsApp vira emissão server-side determinística

### Decisão de design

Ver ADR completa: [`docs/decisoes/blocos/2026-07-12-bloco-r9-gate-funil.md`](../docs/decisoes/blocos/2026-07-12-bloco-r9-gate-funil.md).

- **Decidi** migrar `present_whatsapp_optin` pra emissão SERVER-SIDE determinística (opção
  RECOMENDADA do card) **em vez de** documentar o timing variável como intencional via ADR
  sem mudar código, **porque** a opção 2 aceitaria uma classe de bug que o próprio codebase
  já eliminou 2× pro mesmo estágio do funil (FIX-246: embedded_bid/two_paths/scarcity;
  FIX-253: decision_prompt) — manter uma 3ª tool "de card" LLM-discricionária nesse trecho
  seria inconsistente com o padrão já estabelecido, e o payload do card nunca dependeu de
  dado do LLM (schema vazio), então não havia coerção nova a desenhar.
- **Decisão levada ao Kairo via `AskUserQuestion`** (opção recomendada em 1º lugar) —
  respondida escolhendo a migração server-side.
- **Decidi** colapsar `WhatsappOptinStage` de 4 estágios (`locked`/`open`/`confirm`/`done`)
  pra 2 (`locked`/`done`) **em vez de** manter os 4 e só parar de expor a tool, **porque** com
  a tool fora do toolset em toda fase, instruir o LLM sobre "open"/"confirm" no prompt
  ambiente (toda resposta normal) seria regra-no-prompt morta — a granularidade real
  (pedir vs. só confirmar canal já conhecido) migrou pro directive específico que o
  orchestrator injeta no ÚNICO turno em que o opt-in é oferecido
  (`buildWhatsappOptinDirective`, escolhido via `meta.contactPhone`).
- **Decidi** manter os guards de defesa-em-profundidade (`artifact-guard.ts` PF-07,
  `runner.ts` marcação de `whatsappOptinShown` reativa a tool-call) intactos mesmo
  vestigiais **porque** é o mesmo tratamento já dado aos cards migrados anteriormente
  (embedded_bid/scarcity/decision_prompt) — defesa-em-profundidade continua válida mesmo com
  o caminho LLM inalcançável.
- **Decidi** remover `present_whatsapp_optin` da lista "sempre exposta" do builder
  (`agents/builder.ts`) **em vez de** deixá-la lá **porque** o FIX-253 já estabeleceu o
  precedente explícito ("listá-la aqui seria morta/enganosa") pro `present_decision_prompt`
  — mesma lógica se aplica aqui.

### Testes

- **Integração (DB real):** `src/lib/agent/orchestrator/index.fix-280-whatsapp-optin-server-side.integration.test.ts`
  — 2 conversas com `meta` idêntico (ponto pré-search do funil), agente mocado com textos
  totalmente diferentes entre as duas (nunca chama `present_whatsapp_optin` — a tool nem está
  no toolset), ambas emitem o artifact `whatsapp_optin` logo após `recommendation_card`,
  deterministicamente. Confirmado RED antes do fix (`git stash` do código de produção mantendo
  só o teste novo → falha) e GREEN depois.
- **Unitário:** `directives.test.ts` (narrativa dos 2 estágios do directive),
  `tool-policy.test.ts` (tool nunca entra no toolset em nenhuma fase, mostrado ou não),
  `system-prompt.whatsapp-optin-stage.test.ts` + `system-prompt.fix-27.test.ts` (estágio
  ambiente colapsado), `builder.lead-capture.test.ts` (tool fora do toolset "sempre exposto").
- Cassette `tests/regression/agent-trajectory.test.ts` (describe FIX-27) atualizada pro novo
  contrato (2 estágios, não 4).

## Overlap textual (nível 2) com `bloco-r9-compliance-copy`

`system-prompt.ts` foi tocado por este bloco na seção `whatsappOptinSection` (colapso de
estágio) — região distinta de onde `bloco-r9-compliance-copy` mexe (perto de "Valores
monetários — NUNCA arredonde"). Sem conflito de linha esperado na integração.

## Gate

- `pnpm test:unit`: **353 arquivos / 3262 testes, 100% verde** (rodado em container
  transitório — worktree sem `node_modules` no host, ver memória `project_worktree_node_modules_symlink`).
- `tsc --noEmit`: nenhum erro novo introduzido por este bloco (os 25 erros pré-existentes no
  repo são dívida de test files já conhecida, fora do escopo deste bloco — não bloqueiam o
  gate de merge, que usa `test:unit`).
- Push: `fix/r9-gate-funil` — 5 commits (`ce637ed1` fix FIX-279, `92b5d826`+`14bdb81`
  docs done/, `74ad6e3f` ADR FIX-280, `18ead19f` fix FIX-280).

## Gaps honestos

- O directive de narrativa do opt-in (`buildWhatsappOptinDirective`) ainda depende do LLM pra
  escrever a frase de contexto (varia por persona/tom) — só a DECISÃO de emitir e o PAYLOAD do
  card viraram determinísticos. Isso é intencional (mesmo padrão do scarcity/embedded_bid) e
  não um gap, mas vale registrar: a narrativa em si não é testada por Camada 3 (eval LLM) neste
  bloco.
- Não validei E2E ao vivo (browser) — fora do escopo deste bloco de execução autônoma
  (integração fica pro orquestrador da onda). A prova de determinismo é via integração
  mocada (DB real, agente mocado) + TDD RED/GREEN confirmado.
