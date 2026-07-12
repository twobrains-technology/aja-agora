# ADR — Bloco r9 gate-funil: agulha de credit + opt-in de WhatsApp determinísticos

- **Data:** 2026-07-12
- **Branch:** `fix/r9-gate-funil`
- **Itens:** FIX-279, FIX-280 (veredito baseline r9, Sonnet 5, Funcional 5/10 — G3/G4)
- **Natureza:** correção de determinismo do funil (2 gates que deveriam disparar sempre e
  não estavam). 2 itens, bloco isolado (onda 1, paralelo a `bloco-r9-compliance-copy`).

---

## FIX-279 — creditMax capturado fora do gate `credit` (sem decisão de design — analogia direta)

Correção fechada desde o card: replicar o guard `activeGateAtTurnStart` que o FIX-236 já
aplicou pro campo irmão `hasLance` (`analyze.ts:140`), agora pro merge de `creditMax`
(`analyze.ts:94`). Sem trade-off de produto em aberto — é o mesmo padrão já validado no
próprio arquivo. Ver `docs/correcoes/done/fix-279-gate-credit-nao-dispara.md`.

---

## FIX-280 — `present_whatsapp_optin` LLM-discricionário (decisão de design real)

### Contexto

Veredito r9 (G4): `present_whatsapp_optin` disparou em mario-sem-lance turno 7 e não em
madalena no mesmo ponto estrutural do funil (pós-reveal, pré-gate `experience`) — mesmo
toolset, mesmo estado de sistema (`shouldEmitWhatsappOptin(meta)` idêntico e verdadeiro nos
dois), resultado divergente. Root cause provado em `whatsapp-optin-guard.ts`/`tool-policy.ts`:
o guard só controla se a tool fica **disponível**; **chamar** ou não continuava 100% a
critério do LLM — regra-no-prompt (`system-prompt.ts`, `whatsappOptinSection`), não
invariante em código (viola Lei 4).

### Opções levantadas

1. **(Recomendada, escolhida) Migrar `present_whatsapp_optin` pra emissão SERVER-SIDE
   determinística**, mesma receita já aplicada aos cards vizinhos do mesmo estágio do funil
   (`embedded_bid`/`two_paths`/`scarcity`, FIX-246; `present_decision_prompt`, FIX-253): a
   tool sai do toolset do LLM em toda fase (`tool-policy.ts`); o orchestrator
   (`orchestrator/index.ts`) dispara um directive de narrativa (`buildWhatsappOptinDirective`,
   `orchestrator/directives.ts` — preserva a variação de tom por persona) e emite o card
   direto (`buildWhatsappOptinCard`, `orchestrator/server-cards.ts`) no primeiro turno em
   que `shouldEmitWhatsappOptin(meta)` vira `true` — sempre no mesmo ponto relativo (logo
   após o reveal), nunca dependendo de o LLM "decidir" chamar.
2. Tratar o timing variável como intencional/aceitável via ADR, sem mudar código — a
   inconsistência não é beco-sem-saída (o funil retoma normalmente no turno seguinte), só
   diverge estruturalmente entre 2 cenários idênticos.

### Decisão

**Escolhida a opção 1 (migração server-side).** Quem decidiu: Kairo, via `AskUserQuestion`
com a opção recomendada em 1º lugar (sessão de execução do bloco, 2026-07-12).

**Porquê:** a opção 2 aceitaria uma classe de bug que o próprio codebase já eliminou 2x
(FIX-246, FIX-253) pro mesmo estágio do funil — manter uma 3ª tool "de card" exposta ao LLM
nesse trecho seria inconsistente com o padrão já estabelecido, e a correção server-side é
estritamente mais barata do que parece (o payload do card **nunca dependeu de dado do LLM**
— schema vazio, "o sistema preenche" — então não há coerção de dado real a desenhar, só
mover a decisão de "quando" pro orchestrator). O hook escolhido (logo após a busca/reveal
concluir, no branch `nextGateToFire === "search"` de `orchestrator/index.ts`) é o único ponto
do código onde `revealCompleted` passa de `false` pra `true` — mesma garantia estrutural que
os hooks de scarcity/decision_prompt já usam no branch `"decision"`.

### Consequências

- `WhatsappOptinStage` (`system-prompt.ts`) colapsou de 4 estágios (`locked`/`open`/
  `confirm`/`done`) pra 2 (`locked`/`done`) — o LLM não decide mais NADA sobre o opt-in em
  turno normal; a granularidade `open` (pedir) vs `confirm` (só confirmar canal já
  conhecido) migrou pra `buildWhatsappOptinDirective(stage)`, escolhida pelo orchestrator via
  `meta.contactPhone`.
- `present_whatsapp_optin` saiu do toolset em toda fase (`tool-policy.ts`) e da lista
  `unfilteredTools` "sempre exposta" do builder (`agents/builder.ts`) — mesmo tratamento do
  FIX-253 pro `present_decision_prompt` (listá-la lá seria morta/enganosa). A definição da
  tool em si (`tools/ai-sdk.ts`) e os guards de defesa-em-profundidade
  (`artifact-guard.ts`, PF-07 em `runner.ts`) ficam intactos, vestigiais — mesmo padrão já
  usado pros cards migrados anteriormente (defense-in-depth mesmo com o caminho LLM
  inalcançável).
- Regressão exigida pelo card: teste de integração com 2 conversas de `meta` idêntico
  (`src/lib/agent/orchestrator/index.fix-280-whatsapp-optin-server-side.integration.test.ts`)
  confirmando emissão determinística nas duas, com textos de LLM totalmente diferentes —
  provado RED antes do fix (`git stash` do código de produção, teste falha) e GREEN depois.
