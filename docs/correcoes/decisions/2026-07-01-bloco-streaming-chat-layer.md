# Decisões — bloco-streaming-chat-layer (onda 2)

**Data:** 2026-07-01 · **Branch:** `fix/composicao-mensagem-efemera` · **Onda:** 2 (forka da base com a onda 1 já integrada — FIX-186/187).
**Escopo:** camada de COMPOSIÇÃO da mensagem (efêmero × final, segmentação de bolha, anti-frase-fallback). FIX-188 → FIX-189 → FIX-190.

> Contexto do refino: `docs/correcoes/2026-07-01-refino-vazamento-turno-composicao.md`.
> A onda 1 já fez a LÓGICA (erro→diretiva, gate exige dado fresco); esta onda faz a EXIBIÇÃO.

---

## DR1 — Streaming por FRASE, não por bloco nem só-persistência (FIX-188)

**Decisão:** o sanitizer de preâmbulo efêmero opera em **granularidade de frase** durante o stream.
Recomendada em `AskUserQuestion` (Kairo away → fallback anti-trava = seguir a recomendada).

- **Por quê:** o invariante é "preâmbulo NUNCA é persistido **nem enviado**" (não basta limpar o DB).
  Pra garantir que nada vaze AO VIVO, o texto tem de ser checado ANTES de emitir. Sanitizar só na
  persistência (opção rejeitada) deixaria o preâmbulo aparecer ao vivo e sumir depois (tela ≠ DB).
  Bufferizar o bloco inteiro (2ª opção) mataria o streaming da resposta final.
- **Como:** `EphemeralTextFilter` segura só a frase INCOMPLETA corrente; cada frase COMPLETA
  (delimitada por `.!?:` ou `\n`) é checada contra o blocklist de preâmbulo antes de emitir. Frase de
  processo → **dropada** (nunca vira delta nem entra em `fullResponse`); frase legítima → emitida.
  Perda: texto passa a aparecer frase-a-frase (antes era em chunks de token). Aceitável — o chip
  determinístico "Buscando grupos" já cobre a latência percebida da tool.
- **Barreira REAL = código (Lei 1/4), não prompt.** O reforço no `system-prompt.ts` + `HARD_RULES.md`
  é defesa-em-profundidade; a garantia é o sanitizer determinístico.
- **Pós-onda-1:** o erro de descoberta já vira diretiva (FIX-186) e o runner suprime toda narração
  após falha — então o sanitizer só cuida de preâmbulo de **SUCESSO** (não de narração de erro).

## DR2 — Blocklist de preâmbulo é DETECÇÃO de frase, não governança de fluxo (FIX-188)

**Decisão:** o sanitizer usa um blocklist de padrões de preâmbulo de processo
("deixa eu buscar/puxar", "vou buscar", "vou usar a ferramenta", "preciso primeiro buscar",
"um segundo"). A 2ª lei (allowlist, não blocklist) governa **transição de estado** — aqui é
**reconhecer meta-narrativa de processo** (mesma natureza do `META_NARRATIVE_PHRASES`/detector de
refresh que já existem). Padrões conservadores + teste garantindo que copy legítima
("Olha só o que a gente encontrou na sua faixa:") **sobrevive**.

## DR3 — Pendura: corrigir na FONTE, mesmo fora do escopo_arquivos declarado (FIX-189)

**Causa cravada (systematic-debugging, verificada no código):** um turno de **descoberta**
(disparado deterministicamente após um gate) pode fechar SEM emitir nada visível persistente
(só o chip transitório), e não há rede de recuperação nos caminhos de dispatch. Dois fatos de código:
1. `isTurnEmpty` (`empty-turn-guard.ts:57-66`) conta `search_groups`/descoberta como "tool visível"
   (`hasVisibleTool`) — **falso-negativo**: a descoberta não gera artifact por si; só `present_*`
   gera (e isso já é contado em `artifactCount`). Turno que só buscou (sem `present_*`, sem texto) é
   classificado como NÃO-vazio.
2. O guard de turno-mudo (`isTurnEmpty`) só roda no **turno de texto-livre** (`route.ts:1123`). O
   caminho de **ação** (responder gate → `pipeSearchSummaryTurn`, `route.ts:1049`) e os directives
   do WhatsApp **não rodam guard nenhum**.
→ Resultado: descoberta muda (só "Buscando grupos") não tem recuperação → o reveal nunca chega → o
usuário precisa cutucar ("travou?"). **Interação com o FIX-188:** ao dropar o preâmbulo, um turno
cujo único texto era preâmbulo passa a ter `textChars=0` → mais casos mudos → torna esta rede
determinística OBRIGATÓRIA como companheira do FIX-188.

**Decisão (recomendada em `AskUserQuestion`; Kairo away → seguir a recomendada):** corrigir na fonte:
- `empty-turn-guard.ts`: tools de descoberta (`search_groups`, `recommend_groups`, `get_rates`,
  `get_group_details`, `simulate_quota`) **não** são emissão visível por si — só `present_*` e
  texto/artifact contam. Turno só-descoberta = mudo.
- Ligar o guard nos caminhos de descoberta (web action stream após `pipeSearchSummaryTurn`;
  WhatsApp `runSearchSummaryWithOrchestrator`/directive de busca).
- Toca `empty-turn-guard.ts` + `route.ts` (fora do `escopo_arquivos` declarado do bloco), mas **não
  há bloco paralelo** (onda 1 já mergeada) → risco de conflito = zero, e a regra do Kairo é "erro que
  você vê, você corrige". A recuperação NÃO usa frase de refresh (respeita FIX-190).

## DR4 — Segmentação: separador de conteúdo + anti-colagem (FIX-189)

**Decisão:** manter `textBlockSeparator` (FIX-182, cross-block por id) e ADICIONAR:
- `joinSeparator(acumulado, próximo)` — separador por CONTEÚDO no ponto de emissão (`\n\n` só quando
  há colagem: acumulado termina sem espaço e o próximo começa sem espaço).
- `normalizeGluedSentences` — insere `\n\n` entre frases coladas pelo modelo no MESMO chunk
  (`corretos.Show` → `corretos.\n\nShow`), padrão conservador `minúscula[.!?]MAIÚscula` (não pega
  `R$ 1.000`, abreviações numéricas). "Status × resposta final" já são distintos por construção (o
  chip é elemento transitório separado das bolhas de texto).

## DR5 — FIX-190 já implementado pelo FIX-52; esta onda adiciona a BARREIRA de código

**Achado (epistêmico — verificado, não a diagnose stale do card):** o commit `3de52ad2`
("test+fix: veta fallback 'atualiza a página' do agente (FIX-52)") **já** entregou as 3 camadas do
FIX-190: regra no `HARD_RULES.md` (§1.7bis), regra dura no `system-prompt.ts` (linhas 65, 142-143),
cassette `BUG-FALLBACK-REFRESH` + `system-prompt.behavior-guards.test.ts` + `HARD_RULES.test.ts`
(frase canônica `atualiza a pagina`). A seção "Root cause" do card FIX-190 está **desatualizada**
(descreve o estado pré-FIX-52).

**Decisão:** o valor real do FIX-190 nesta onda = a **barreira em CÓDIGO** que faltava (Lei 4: o
invariante crítico não pode viver só no prompt). Estender o sanitizer do FIX-188 pra também **dropar
em runtime** a frase de fallback técnico ("atualiza a página"/"recarregue"/"dá um refresh"), de modo
que mesmo se o modelo emitir, nunca chega ao usuário. + cassette provando o strip em runtime. As
camadas de prompt/HARD_RULES/cassette-de-detecção já existentes ficam como estão (não regredir).
