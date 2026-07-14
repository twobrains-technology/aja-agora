# Bloco b-reveal-web — FIX-333, FIX-334, FIX-335

## O que foi implementado

Os 3 achados do veredito Sonnet (loop-de-goal desamarra, rodada 1, web 4/10) sobre o momento do
reveal — pós-busca, antes da decisão — todos com a MESMA causa-raiz estrutural: o guard
`hero-awaits-reco-consent` (artifact-guard.ts) já suprimia o CARD, mas nada suprimia o DADO que
chegava ao modelo via tool-result. Suprimiu-se o artefato, não a informação.

### FIX-333 — o agente narra o hero antes do consentimento

Pós-`search`, o servidor emitia só a `comparison_table` (correto — reveal em dois tempos, FIX-297),
mas o modelo já narrava administradora/parcela do top-1 em texto livre no mesmo turno ("Tá aí a
ITAÚ em destaque — parcela de R$ 3.549,75...") — dado que ele via no tool-result de
`recommend_groups`, mesmo sem chamar `present_recommendation_card`.

**Decisão de arquitetura tomada sem o Kairo disponível** (a pergunta via `AskUserQuestion` foi
dispensada — sessão autônoma): investiguei duas rotas de corte-na-fonte (redigir o tool-result vs.
adiar as tool-calls pro pós-consentimento) e as duas provaram ter custo real — a primeira porque o
modelo já vê administradora/parcela de TODOS os grupos via `search_groups` (legítimo, é o que a
`comparison_table` mostra) e poderia cruzar o id do top-1 contra esse dado mesmo com
`recommend_groups` redigido; a segunda porque quebraria a garantia de emissão determinística do
hero (FIX-297/308/325 — computado no turno da busca, replayado depois SEM depender do modelo
chamar tool de novo) e arriscaria a garantia de ≥3 opções/expansão do `comparison_table` (Bug #09).
Optei por um **guard determinístico no sanitizer** (`isPrematureTopOfferClaim`) — mesma família de
código de `isTaxaContemplacaoClaim`/`isPrematureReservationClaim` — que dropa qualquer segmento de
fala citando a administradora/parcela da oferta pendente enquanto `meta.recoConsentAnswered` não é
`true`, com base no grupo real já indexado no turno (nunca a narrativa do LLM). Corta o que o
USUÁRIO recebe de forma 100% determinística, sem tocar no timing das tool-calls nem na arquitetura
de emissão já validada. Reforcei o texto do directive de busca (convite, não entrega) como defesa
suplementar — o mecanismo real é o guard.

### FIX-334 — score numérico cru na fala ("score de 73%")

Regressão contra decisão de produto já registrada (FIX-7, `score-label.ts`: "% numérico baixo mina
a confiança") — o card já escondia o percentual, mas o modelo recebia `score`/`scoreBreakdown`
crus (0-1) no tool-result de `recommend_groups` e citava o número na fala.

`executeRecommendGroups` deixou de devolver `score`/`scoreBreakdown` pro modelo — só `rank`
(posição ordinal, 0=melhor) e `scoreLabel` (rótulo qualitativo). O card não perde nada: extraí
`scoreGroup` (função pura, refactor de `rankGroups` sem mudar comportamento) e
`coerceRecommendationPayload` passou a RECALCULAR score/scoreBreakdown a partir do grupo real +
`scoringInput` (derivado de `meta.qualifyAnswers`), nunca do que a LLM ecoa. Efeito colateral
tratado: a seção "Textos de recomendação" do `system-prompt.ts` instruía o modelo a ler o score cru
pra escolher palavras (thresholds `monthlyFit >= 0.8` etc) — reescrita pra usar fatos que o modelo
ainda tem (parcela ÷ teto declarado, taxa literal) e o `scoreLabel`. Guard novo no sanitizer
(`isScorePercentageClaim`) como defesa determinística caso o modelo ainda assim cite um percentual.

### FIX-335 — meta-narrativa de pipeline ("Agora vou te recomendar a mais adequada")

O prompt já proibia narrar mecânica de ferramenta ("vou buscar"), mas "Agora vou <ação de
produto>" escapava — não é mecânica, é anúncio de passo, fazendo a conversa soar como log de
execução. **Achado no caminho**: a própria diretiva do reveal MANDAVA o modelo usar "Agora vamos
te recomendar a mais adequada" como copy sugerida — quase idêntica à frase que o veredito flagrou.
Troquei pela copy do mockup. Guard novo no sanitizer (mesma família de `isProcessPreamble`)
bloqueia "(agora) vou/deixa eu recomendar/destacar/detalhar/aprofundar" incondicionalmente (verbos
de decisão que quase nunca carregam conteúdo por si) e "mostrar/simular" só quando seguido de
objeto vago ("a mais adequada", "a melhor opção") — nunca quando o modelo nomeia uma entidade/
número real ("Vou simular a Rodobens com R$ 900 mil" continua livre, testado explicitamente).

## TDD (RED→GREEN provado)

- **FIX-333**: `runner.fix-333-hero-narrado-antes-consent.integration.test.ts` (DB real, LLM
  mockado reproduzindo o cassette exato — narração vazando administradora+parcela no mesmo turno
  do `recommend_groups`). RED confirmado antes do guard, GREEN depois.
- **FIX-334**: `ai-sdk.fix-334-score-cru.test.ts` (unit — payload de `recommend_groups` sem
  score/scoreBreakdown numéricos) + testes novos em `sanitizer.test.ts` (bloco "FIX-334") e em
  `recommendation-payload.test.ts` (recálculo via `scoreGroup` + `scoringInput`, nunca o que a LLM
  digita).
- **FIX-335**: `sanitizer.test.ts` (bloco "FIX-335", 11 frases exatas do veredito + a frase-alvo da
  regressão exigida + 3 casos de não-regressão com conteúdo real).
- **Ripple de fixtures corrigido**: mudar `recommend_groups` de `score`/`scoreBreakdown` pra
  `rank`/`scoreLabel` quebrou 3 testes de integração pré-existentes que mockavam o shape antigo
  (`index.fix-286-reveal-legitimo`, `ai-sdk.fix-23-token-diet`, e o próprio
  `runner.fix-333-hero-narrado-antes-consent` recém-criado) — todos ajustados pro shape novo e
  verdes.
- `pnpm test:unit` completo verde nos 2 commits de código que o tocaram: **376 arquivos / 3464-3467
  testes**, zero regressão. Pre-commit Camada 3 (LLM real cirúrgico) verde em todos os commits.

## Infra usada (atrito real, documentado pra próximo bloco)

- Worktree sem `.env.local` (não existia — não era só incompleto). Bootstrap via skill `local-dev`
  (`bootstrap-workspace.sh --db-only`) criou `aja_agora_ws_reveal_web_consent` clonado do template
  no Postgres shared (`aja-shared-pg`) — mas o `DATABASE_URL` gerado apontava pro path legado
  (`localhost:5433`), corrigido manualmente pro DNS OrbStack v2: `db.aja-shared.orb.local:5432`.
- Secrets reais (ANTHROPIC_API_KEY, LITELLM_*, IDENTITY_ENC_KEY, ADMIN_*, BETTER_AUTH_SECRET,
  BEVI_*, WHATSAPP_*, LETTA_*) ausentes/placeholder — backfill feito a partir do
  `.env.local` do clone principal (`~/code/aja-agora`), preservando os valores de isolamento do
  workspace (DATABASE_URL/REDIS_URL/WORKSPACE_DB_NAME/etc).
- **Armadilha de staging repetida 2x**: `git mv` de um doc do `todo/` pro `done/` DEPOIS de editar
  o arquivo (frontmatter + seção de implementação) estagiou o conteúdo ANTIGO (pré-edição), não o
  que estava em disco — aconteceu com os docs do FIX-333 e do FIX-334, cada um corrigido com um
  commit de fixup (`b35bd631`/`b67559e5`) antes de eu perceber o padrão. A partir do FIX-335,
  sempre rodei `git add <caminho-novo>` explícito LOGO APÓS o `git mv`, o que resolveu de vez —
  registro aqui pro próximo bloco não cair na mesma.

## Resumo final — decisões que tomei

- **FIX-333**: optei por um guard de sanitizer (código determinístico, não regra-no-prompt) em vez
  de reestruturar o timing das tool-calls, porque a alternativa quebraria garantias já testadas
  (emissão determinística do hero, expansão de ≥3 opções). Decisão tomada sem confirmação do Kairo
  (pergunta dispensada em sessão autônoma) — documentada com o porquê no próprio `fix-333-*.md`
  em `docs/correcoes/done/`.
- **FIX-334**: troquei `score`/`scoreBreakdown` por `rank`/`scoreLabel` no tool-result do modelo, e
  passei a RECALCULAR os números reais do card server-side (em vez de deixar o modelo ecoar) — mais
  robusto que só filtrar a fala, e reaproveita a mesma lógica de `rankGroups` já testada.
  Reescrevi a seção do system-prompt que dependia do score cru pra decidir frases, sem enfraquecer
  nenhuma regra de compliance existente (CDC/valores literais continuam intocados).
  **Caso de borda fora do escopo**: se algum caminho legado chamar `coerceRecommendationPayload`
  sem `scoringInput` (ex.: código futuro que eu não tenha migrado), o card sai sem score — degrada
  graciosamente, mas vale checar se surgir esse caso no QA.
- **FIX-335**: mantive os verbos "mostrar"/"simular" fora do bloqueio incondicional (só bloqueiam
  com objeto vago) pra não virar mordaça — narração legítima com entidade/número real continua
  livre, testado explicitamente contra falso-positivo.
