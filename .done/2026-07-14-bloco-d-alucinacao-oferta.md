# Bloco d-alucinacao-oferta — FIX-342

## Resumo

O P0 mais grave da rodada 2 (veredito Sonnet, `.processo/loop/2026-07-13-desamarra-agente/
veredito-rodada-2.md`): o agente **recomendava** uma administradora que a Bevi nunca retornou —
"Bradesco" (`imovel-web`, t8/t10) e "Estrela" (`servicos-web`, t8-t12) — e só admitia o próprio
erro vários turnos depois, confuso. O usuário perseguiu uma oferta fantasma por 4 turnos e tomou
decisão financeira em cima de um nome inventado. Os CARDS já eram coagidos server-side
(`coerceRevealCota`), mas o TEXTO do modelo não tinha nenhuma barreira contra citar uma
administradora que não estava nas ofertas da conversa.

## Decisão de design (sem re-perguntar)

O fix-342 já trazia a correção fechada — não houve brainstorm nem trade-off não previsto. É
invariante puro (CLAUDE.md, "Não engesse o agente": invariante verificável → CÓDIGO), não
comportamento de produto — não precisou de `AskUserQuestion`.

## O que mudou

- **`sanitizer.ts`**: novo detector `isHallucinatedAdministradoraClaim` — mesma família dos
  outros detectores de estado fabricado (FIX-270/FIX-336, `isFabricatedStateSegment`/
  `isPrematureTopOfferClaim`). Segmento que cita uma administradora de uma **lista fechada do
  mercado** (Bradesco, Itaú, Santander, Caixa, Porto, Rodobens, Âncora, Canopus, Embracon,
  Estrela, Tradição, Banco do Brasil, Magalu, HS, Servopa) que **não está** em
  `ctx.shownAdministradoras` é dropado antes de virar bolha (stream ao vivo via
  `EphemeralTextFilter` E composição final via `stripProcessPreamble` — mesmo pipeline dos
  outros detectores). Nome fora da lista fechada nunca é bloqueado (falso-negativo aceitável,
  mesmo conservadorismo do FIX-243/249). Sem `shownAdministradoras` no contexto, o detector
  nunca dropa (compat retroativa — não quebra nenhum teste antigo de `StateVerificationContext`
  que não populava esse campo).
- **`StateVerificationContext`** (tipo): novo campo opcional `shownAdministradoras?: string[]`.
- **`runner.ts`**: `shownAdministradoras` é populado em `stateVerificationContext()` como a
  UNIÃO de duas fontes REAIS — nunca a narrativa do LLM:
  - histórico persistido da conversa, via `listShownOffersForConversation` (`choose-offer.ts`,
    **já existia — reutilizado, não reinventado**, como pedido) — cobre alucinação citando
    oferta de um turno ANTERIOR (o cenário real do dossiê: t6 mostra ITAÚ/ÂNCORA, t8 recomenda
    "Bradesco");
  - `revealGroupsById`, os grupos indexados NESTE turno a partir do tool-result real de
    `recommend_groups`/`search_groups` — cobre alucinação dentro do PRÓPRIO turno da busca.
  - Carregado uma vez no início do turno (`shownOffersFromHistory`, mesmo padrão de `hasProposal`
    já existente, uma query só por turno).
- `choose-offer.ts` **não foi tocado** — só consumido (a função já existia pronta pro caso).

## Testes (TDD strict)

Escritos **primeiro** em `sanitizer.test.ts` (9 casos, 2 `describe` novos), confirmados **RED**
(`isHallucinatedAdministradoraClaim is not a function`), depois **GREEN** após a implementação:

1. `isHallucinatedAdministradoraClaim` (7 casos): "recomendo a Bradesco" com ofertas reais
   [ITAÚ, ÂNCORA] → `true`; "recomendo a ITAÚ" e menção à ÂNCORA (as duas ofertas reais) →
   `false`; réplica literal do dossiê `servicos-web` ("Estrela" fora de [Rodobens, Âncora]) →
   `true`; sem `shownAdministradoras` no contexto (com ou sem `ctx`) → sempre `false` (compat
   retroativa); segmento vazio → `false`; nome fora da lista fechada (`Cooperfumas`) → `false`
   (falso-negativo aceitável, documentado).
2. `stripProcessPreamble`/`EphemeralTextFilter` (4 casos): dropa a fala inteira sobre "Bradesco"
   (réplica do dossiê `imovel-web`); **PRESERVA** a fala sobre a ITAÚ — prova explícita de que a
   correção não vira mordaça pras ofertas que EXISTEM; `EphemeralTextFilter` dropa "Estrela" ao
   vivo no meio do stream e preserva "ÂNCORA" ao vivo.

Rodei só os arquivos tocados: `sanitizer.test.ts` (107 testes, 100% verde) e, por precaução (o
sanitizer passou a importar `normalizeAdministradora` de `choose-offer.ts`),
`choose-offer.test.ts` + `choose-offer.fix-258-directive.test.ts` (144 testes no total,
100% verde). `tsc --noEmit` do repo inteiro não introduziu NENHUM erro novo nos 3 arquivos
tocados (os erros pré-existentes do whole-repo typecheck, já documentados como dívida conhecida
em `test files`, seguem intactos e fora do escopo deste bloco).

## Gate

- `pnpm test:unit` (via pre-commit hook, o gate real usado pelo `merge-wave.sh`): **100%
  verde** — 385 arquivos / 3542 testes.
- **Camada 3** (`pnpm test:eval:quick`, LLM real): rodou (com `ANTHROPIC_API_KEY` do clone
  principal, backfill de `.env.local` que não existia neste worktree — mesmo padrão já registrado
  em memória de sessões anteriores) e **pulou a suíte inteira com exit 0** (5 arquivos / 80
  testes `skipped`) — mesmo comportamento nativo já documentado num bloco irmão desta mesma onda
  (`2026-07-14-bloco-a-fallback-enlatado.md`): cota mensal do workspace Anthropic esgotada até
  2026-08-01, reconhecida pelo probe `anthropicAvailable()` do próprio projeto
  (`describeIfKey` → `describe.skip`). O hook considera isso "verde" (não é falha real, é
  indisponibilidade externa aceita pelo design do harness) — não precisei de `--no-verify`.
- Commits (branch `fix/alucinacao-oferta`):
  1. `ee3fee78` — `fix: bloqueia administradora do mercado que nao esta nas ofertas reais`
  2. `094a5861` — `docs: fecha frontmatter e secao de execucao do fix-342` (o `git mv` do doc pra
     `done/` capturou uma versão do arquivo anterior à edição de frontmatter/seção de Execução —
     corrigido num commit `docs:` separado, sem tocar código).
- Push: `git push origin fix/alucinacao-oferta` ✅.

## Gap honesto

- **Camada 3 inconclusiva** (não vermelha) pela mesma razão já registrada no bloco-a-
  fallback-enlatado desta onda: cota do workspace Anthropic. Re-rodar depois de 2026-08-01 é o
  caminho normal.
- **Integração end-to-end** ("o agente nunca cita administradora fora do conjunto retornado pela
  Bevi", item de regressão listado no fix-card) não foi escrita como teste automatizado
  separado — as instruções do bloco pediam explicitamente só os 2 testes unitários bidirecionais
  (Bradesco dropado / ITAÚ passa), e o precedente mais próximo no código (FIX-336, mesmo padrão
  de "fato do banco entra no `StateVerificationContext`") também só tem cobertura unitária no
  sanitizer, sem integração de runner. Não validei E2E ao vivo (browser) — fora do escopo deste
  bloco.
- **Lista fechada de administradoras é estática** (as 15 nomeadas no fix-card). Se a Bevi passar
  a operar com uma administradora nova E o modelo alucinar justamente um nome fora dessa lista,
  o detector não pega (falso-negativo documentado, mesmo trade-off já aceito em detectores
  irmãos como FIX-243/249). Ajustar a lista é edição de 1 linha em `sanitizer.ts`, não é redesign.
