# Bloco recomendação-ancora — FIX-276

## Resumo

Bug de risco CDC: a recomendação de consórcio podia sugerir uma carta **mais cara** que o
valor do bem pedido pelo cliente (ex.: pedido R$ 120.000 → recomendou ITAÚ R$ 150.000, 25%
acima, parcela 64% maior). Causa raiz confirmada: a recomendação era ancorada num `budget`
mensal **inventado pelo LLM** (o usuário nunca informa orçamento, só o valor do bem), e o
fator `monthlyFitScore` tinha o maior peso do score (0.4) — budget alto inventado empurrava a
carta de parcela maior pra frente.

Fix: novo fator `creditProximityScore` ancora o ranking no valor do bem **pedido**
(`creditMax`, dado real que o usuário sempre informa) e vira o fator dominante do score.
`monthlyFit` perde peso mas continua existindo (desempata conforto de parcela).

## Decisão de design

Ver ADR completa: [`docs/decisoes/blocos/2026-07-11-bloco-recomendacao-ancora.md`](../docs/decisoes/blocos/2026-07-11-bloco-recomendacao-ancora.md).

- **Decidi** o fator de proximidade de carta (opção RECOMENDADA no card) **em vez de** derivar
  o budget server-side a partir do valor do bem, **porque** essa segunda opção trocaria "LLM
  inventa" por "código inventa" — não existe no domínio uma razão parcela/valor-do-bem
  documentada (varia por administradora/prazo/taxa), então a conversão seria uma heurística
  nova sem garantir o invariante. O fator de proximidade mede a distância ao pedido
  **diretamente**, sem heurística intermediária.
- **Decidi** pesos (`creditProximity: 0.4`, `monthlyFit: 0.15`, `contemplation: 0.2`,
  `adminFee: 0.15`, `termMatch: 0.1`) **em vez de** só adicionar o fator sem realocar peso
  suficiente de `monthlyFit`, **porque** verifiquei matematicamente o pior caso adversarial
  (budget inventado casando exatamente a parcela da carta mais cara) e confirmei que só com
  essa realocação a carta que bate o pedido vence com margem confortável.
- **Decidi** não escalar a decisão via `AskUserQuestion` **porque**, após a análise do
  trade-off, a opção alternativa (budget server-side) é estritamente mais fraca — não havia
  ambiguidade real a resolver, só confirmação de que a recomendação do card já era a correta.
- **Decidi** não expor o novo fator no breakdown visível do card (`recommendation-card.tsx`)
  **em vez de** adicioná-lo à UI, **porque** isso é uma decisão de UX separada (mesmo padrão já
  aplicado ao `adminFee`, que também fica fora do breakdown por decisão de produto anterior) e
  o escopo declarado do bloco era só `recommendation.ts` + `ai-sdk.ts`.
- **Decidi** commitar com `--no-verify` (aprovado pelo Kairo via pergunta) **porque** o
  pre-commit hook exige Camada 3 (eval com LLM real) por heurística ampla de pasta
  (`src/lib/agent/**`), mas este worktree não tem rota pro gateway LiteLIVM interno e os 2
  evals cirúrgicos gateados (`save_contact_name`, tom do assistente) são objetivamente
  não-relacionados a este diff (plumbing de `creditMax` em scoring). Camadas 1+2 (`test:unit`)
  foram verificadas verdes via TDD estrito (fail-antes/passa-depois, confirmado com `git
  stash`) antes do commit.

## Testes

- **Camada 1 (estrutural):** `src/lib/agent/recommendation.fix276.test.ts` — 4 testes:
  3 cenários paramétricos (`creditMax` 80k/120k/250k), cada um no PIOR caso pro fix (budget
  inventado casando exatamente a parcela da carta mais cara) + 1 caso sem `creditMax` (fator
  neutro 0.5, não distorce). Falha antes do fix, passa depois (verificado via `git stash`).
- **Camada 2 (cassette, dados reais):** `tests/regression/fix-276-recomendacao-ancora.test.ts`
  — chama `recommend_groups` de ponta a ponta (`buildConsorcioTools` + fixture real capturada
  da Bevi, AUTOS 2026-05-27: BB R$ 50.000 / ITAÚ R$ 54.832 / ÂNCORA R$ 42.000) com `creditMax`
  batendo exato numa oferta real e budget adversarial casando a parcela da oferta mais cara.
  Reproduz o padrão exato do bug real nos pesos antigos (ITAÚ vence) e confirma a correção nos
  pesos novos (BB vence). Falha antes do fix, passa depois (verificado via `git stash`).
- **Suite completa (`pnpm test:unit`):** todos os 57 testes de `recommendation.ts` +
  `ai-sdk.test.ts` (recommend_groups) + `recommendation-payload.test.ts` passam. Restante da
  suíte: 1000+ testes passam; só os testes que tocam Postgres real falham neste worktree (ver
  gap abaixo) — nenhuma relação com este fix (confirmado via `git stash` que as mesmas
  falhas ocorrem com ou sem a mudança).

## Gaps honestos

- **Camada 3 (eval LLM real) não executada.** O pre-commit hook exige rodar
  `EVAL-SAVE-CONTACT-NAME-CIRURGICO`/`EVAL-ASSISTANT-LESS-FORMAL` (LLM real via gateway
  LiteLLM) sempre que `src/lib/agent/**` muda — heurística ampla, não discrimina se a mudança
  toca prompt/tom (que é o que esses 2 evals cobrem) ou só scoring puro (este diff). Este
  worktree não tem `ANTHROPIC_API_KEY` nem rota de rede pro gateway interno
  (`litellm-srv.tb.local` não resolve fora da VPN/rede TwoBrains). Kairo aprovou `--no-verify`
  pra este commit especificamente (ver pergunta respondida na sessão).
- **`pnpm test:unit` não roda 100% verde neste worktree** — 4-5 testes pré-existentes falham
  com `password authentication failed for user "test"` (Postgres não configurado: este
  worktree nunca teve o bootstrap do local-dev-workspaces rodado, `.env.local` não existe).
  Verificado (`git stash`) que essas falhas são idênticas com ou sem este fix — 100%
  pré-existentes, zero relação com `recommendation.ts`/`ai-sdk.ts`. Se o orquestrador da onda
  quiser 100% verde, precisa rodar a suíte num container com o Postgres do workspace (ou
  bootstrapar via skill `local-dev`).
- **Budget mensal continua sendo fabricado pelo LLM.** Este fix neutraliza o efeito danoso no
  ranking, não elimina a fabricação em si — isso exigiria coletar orçamento real do usuário
  (mudança de fluxo de conversa, fora de escopo, documentada como alternativa descartada na
  ADR).
- **Novo fator não aparece no breakdown visível do card** (decisão de produto, ver acima) —
  se o Kairo quiser expor "Proximidade ao valor pedido" como barra no card, é uma mudança de
  UX separada e pequena (`recommendation-card.tsx` FACTOR_LABELS).

## Arquivos alterados

- `src/lib/agent/recommendation.ts` (scoring)
- `src/lib/agent/tools/ai-sdk.ts` (plumbing de `creditMax`)
- `src/lib/consorcio/score-label.ts` (comentário desatualizado corrigido)
- `src/lib/agent/recommendation.fix276.test.ts` (novo, Camada 1)
- `tests/regression/fix-276-recomendacao-ancora.test.ts` (novo, Camada 2)
- `docs/decisoes/blocos/2026-07-11-bloco-recomendacao-ancora.md` (ADR)
- `docs/correcoes/done/fix-276-recomendacao-budget-inventado.md` (movido de `todo/`)
- `docs/correcoes/todo/bloco-recomendacao-ancora/` (removida — bloco esvaziou)

## Commits

- `ab2a9a60` — test+fix: ancora recomendacao no valor do bem pedido, nao no budget inventado
- `04423fa9` — docs: registra decisao do bloco recomendacao-ancora (FIX-276)
- `51f1304f` — docs: move FIX-276 pra done (bloco-recomendacao-ancora concluido)

Branch `fix/recomendacao-ancora-valor-pedido` empurrada pro origin. Sem PR, sem merge, sem
deploy — integração é do orquestrador da onda.
