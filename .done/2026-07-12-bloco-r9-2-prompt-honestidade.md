# Bloco r9-2 prompt-honestidade — FIX-282 + FIX-283

## Resumo

Os 2 itens deste bloco eram os dois gaps de **honestidade do agente** que derrubaram a nota
UX (4/10) no veredito r9pos (Sonnet 5, pós-onda-1): momentos em que o agente, sob pressão de
um tool-error ou empilhando várias diretivas no mesmo turno, deixava de responder com
franqueza ou vazava a própria mecânica interna.

- **FIX-282** — o cliente pergunta diretamente se a carta "bate" com o que pediu e por que
  essa oferta foi escolhida; o modelo tenta `search_groups` fora de fase pra "conferir",
  vira `tool-error`, e o fallback determinístico existente (FIX-262/266) — cego ao conteúdo
  da pergunta — respondia com "as opções continuam valendo..." sem nunca confirmar, negar
  ou explicar. Nem mentira, nem honestidade: um stonewall.
- **FIX-283** — o agente parafraseou a própria instrução interna do opt-in de WhatsApp
  ("não crio esse tipo de texto por conta própria — isso é conduzido automaticamente pelo
  sistema") como se fosse algo a dizer pro cliente, no meio de um turno que empilhava reveal
  + optin + gate seguinte.

## FIX-282 — recovery de tool-error responde exatidão/critério com números reais

### Decisão de design

Ver ADR completa: [`docs/decisoes/blocos/2026-07-12-bloco-r9-2-prompt-honestidade.md`](../docs/decisoes/blocos/2026-07-12-bloco-r9-2-prompt-honestidade.md).

- **Decidi** (Opção A, recomendada do card, via `AskUserQuestion`) responder honestamente só
  a parte de EXATIDÃO com os números reais (`rawCreditValue` × `creditValue`) + uma frase
  genérica-mas-honesta sobre o critério combinado (prazo/parcela/contemplação), **em vez de**
  persistir `score`/`scoreBreakdown` reais em `meta.recommendedOffer` no momento do reveal
  (Opção B), **porque** resolve o P1 do veredito sem inventar um número que não existe em
  memória hoje, e sem mudar o schema de `ConversationMetadata.recommendedOffer`/`personas.ts`
  — escopo maior do que este bloco pedia. Fica registrado como achado pra rodada seguinte.

### Implementação

Novo classificador `isExactnessOrCriteriaQuestion` (`directives.ts`) reconhece os padrões
literais do dossiê ("bate", "exato(a)/exatamente", "sem ajuste", "como pedi", "por que essa",
"e não outra", "critério") — escopo estreito de propósito, preferindo falso-negativo a
falso-positivo. Novo builder `buildToolErrorRecoveryExactnessFallback` compara
`rawCreditValue` (`qualifyAnswers.creditClampedFrom ?? creditMax`, mesma âncora do
FIX-261/281) × `creditValue` real, no padrão já validado da diretiva FIX-277
(`system-prompt.ts:598-609`). Novo branch em `index.ts:475-500`, checado ANTES do fallback
genérico/resolvido.

**TDD:** `index.fix-282-honestidade-toolerror.integration.test.ts` (RED confirmado — o
cenário exato do probe-i2 recebia o fallback genérico verbatim — GREEN depois do fix) +
`directives.test.ts` (classificador isolado). `wants_more_options` genuíno (I1) continua no
fallback antigo — não regrediu (coberto em teste dedicado).

## FIX-283 — sanitizer dropa a meta-narrativa do próprio mecanismo

Correção fechada desde o card (sem decisão de design em aberto). Nova categoria
`isMechanismNarrationClaim` (`sanitizer.ts`, adicionada a `isEphemeralSegment`) — regex
estreito nos padrões literais do dossiê ("não crio esse tipo de texto por conta própria",
"conduzido automaticamente pelo sistema", "o sistema decide isso automaticamente", "não sou
eu que decido, é o sistema"), sem falso-positivo em copy operacional legítima que mencione
"sistema"/"automaticamente" noutro sentido (ex. "o sistema vai te avisar quando a proposta
mudar de status").

Mitigação secundária (não substitui o sanitizer — a barreira real é o código):
`whatsappOptinSection("done")` (`system-prompt.ts`) reescrita com cabeçalho explícito de
instrução interna ("não é assunto pra comentar com o cliente"), reduzindo o fraseado
"colável" verbatim como fala. Aproveitei pra corrigir "ofereca"/"peca" sem cedilha — defeito
de acentuação pré-existente no mesmo bloco de texto que eu já estava tocando.

**TDD:** `sanitizer.test.ts` — RED confirmado (o trecho exato do dossiê não era dropado),
GREEN depois. Regex do "não sou eu que decido, é o sistema" precisou de um ajuste (`\b` não
funciona como fronteira antes de vogal acentuada no regex não-unicode do JS — mesma pegadinha
já documentada em `DOCUMENT_RECEIPT_CLAIM_PATTERNS`, FIX-270).

## Testes

- `pnpm test:unit` (rodado em container transitório do workspace, `.env.local` com
  backfill de `BETTER_AUTH_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`/`IDENTITY_ENC_KEY` do
  clone principal — `.env.example` não os declara, gap de bootstrap pré-existente):
  **3276 testes, 354 arquivos, 100% verde.**
- 2 integration tests novos rodados com DB real migrado (`drizzle-kit migrate`, não
  `db:push` — preserva o seed das personas).

## Gaps honestos

- **FIX-282, Opção B não implementada:** `meta.recommendedOffer` continua sem
  `score`/`scoreBreakdown` reais. Quando o cliente pergunta "por que essa e não outra", a
  resposta cita o critério em termos gerais (prazo/parcela/contemplação), não um número
  concreto de ranking. Fica pra rodada seguinte se o Kairo quiser o critério com números.
  reais.
- **FIX-283, mitigação de prompt é best-effort:** a barreira determinística real é o
  sanitizer (`isMechanismNarrationClaim`); a reescrita do `whatsappOptinSection` reduz a
  chance do modelo colar o texto verbatim, mas não é uma garantia — Lei 4 (invariante
  crítico em código, não regra-no-prompt).
- **Gap de bootstrap do worktree** (não deste bloco, mas bloqueava o TDD): `.env.example`
  não declara `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`BETTER_AUTH_SECRET` que o `docker-compose.yml`
  exige — mesmo padrão já registrado em memória (`project_aja_worktree_env_bootstrap`).
  Corrigi localmente (backfill do clone principal) pra destravar este bloco; não commitei
  nada no `.env.example` porque são segredos de dev, fora do escopo deste bloco.
