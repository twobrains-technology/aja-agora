# Bloco r9-compliance-copy — resumo de execução

**Branch:** `fix/r9-compliance-copy` (pushed) · **Commits:** `7d84ab6`, `50978e3`, `b821db20`, `cb088af`

Os 2 itens P0 que travavam a nota do baseline r9 no piso (3/10, UI/Compliance) foram
corrigidos. Ambos eram puro texto/copy — root cause e correção já vinham fechados nos cards,
sem decisão de arquitetura em aberto.

## FIX-278 — terminologia "reserva de cota" (commit `7d84ab6`)

- Trocado "Você está contratando um consórcio da {admin}" por "Sua cota da {admin} está
  reservada" em `closing-presentation.ts` (Ata 2026-07-04, item 2/P0).
- Adicionada a frase mandatória "Você não paga nada agora — é como um booking: só quando
  chegar o boleto na sua casa" (item 2 da Ata, antes tratado como opcional pelo card — decidi
  incluir porque havia um slot óbvio na sequência, antes dos artifacts de assinatura).
- TDD: novo teste garantindo AUSÊNCIA de "contratando/contratado/fechado" e PRESENÇA de
  "reserv" no texto de fechamento.
- **Efeito cascata descoberto via grep** (fora do `escopo_arquivos` original do card, mas
  necessário pra não deixar regressão nem falso-negativo de compliance):
  - `interactive-handlers.contract.test.ts` e `interactive-handlers.template-routing.test.ts`
    pinavam o texto antigo — atualizados pra nova copy.
  - `jornada-rubric.ts` (rubric do eval/LLM-judge) citava o texto antigo como "reforço
    literal esperado" — se não corrigido, o juiz LLM penalizaria a copy nova (correta) como
    defeito. Corrigido.
  - O teste FIX-235 ("NUNCA diz reservado/garantido/você já está no grupo") bania a palavra
    "reservado" em bloco — colidia com a nova terminologia mandatória. Estreitei o teste pra
    continuar banindo só "garantido"/"você já está no grupo" (a promessa indevida de
    contemplação), já que "reservado/reservada" agora é o termo CORRETO exigido pela Ata.

## FIX-277 — falsa exatidão do valor da carta (commit `b821db20`)

- (a) `recommendation-card.tsx`: corrigida a direção do aviso de ajuste — antes dizia
  "Ajustamos essa carta de {rawCreditValue} pra sua faixa de {creditValue}" (invertido: tratava
  o valor pedido como "a carta" e a carta real como "faixa ajustada"). Agora: "Você pediu uma
  carta de ~{rawCreditValue} — a carta real ficou em {creditValue}" — paridade com o padrão já
  correto de `real-offer.tsx` (FIX-197/240/247).
- (b) `system-prompt.ts`: nova REGRA DURA (seção logo após "Valores monetários — NUNCA
  arredonde") mandando comparar `rawCreditValue` × `creditValue` antes de responder se o valor
  "bate"/é "exato", proibindo afirmar exatidão quando os dois divergirem.
- Atualizado o docstring de `rawCreditValue` em `types.ts` (citava a copy antiga do aviso).
- TDD: teste de componente cobrindo a direção do texto (`credit-adjustment-notice.fix-197.test.tsx`)
  e teste estático (Camada 1) do conteúdo da regra em `system-prompt.ts`
  (`system-prompt.fix-277-falsa-exatidao.test.ts`).
- **Não implementado** (avaliado como fora do escopo mínimo, conforme o próprio card sugeria):
  expor `rawCreditValue`/`creditValue` no contexto textual do turno de confirmação (só no
  payload do card) — reduziria dependência do LLM "lembrar" do card anterior, mas exige mexer
  em `runner.ts`/orquestração de contexto, mudança maior que o escopo do bloco.
- `recommendation-payload.ts` (listado no `arquivos:` do card) **não precisou de mudança** — a
  investigação do card já confirmava que a semântica de `coerceRecommendationPayload` estava
  correta; o bug era só na renderização (card) e na ausência de invariante (prompt).

## Ambiente — gap de worktree (backfill necessário)

Este worktree não tinha `.env.local` nem Postgres do workspace rodando — bloqueava até
`pnpm test:unit` (4 testes de integração falhavam com "password authentication failed").
Resolvido com o fluxo já documentado (memória `project_aja_worktree_env_bootstrap`):
`bootstrap-workspace.sh --db-only` + backfill de `ADMIN_EMAIL`/`ADMIN_PASSWORD`/
`BETTER_AUTH_SECRET`/`IDENTITY_ENC_KEY` do clone principal + correção do `DATABASE_URL` pro
DNS `db.aja-r9-compliance-copy.orb.local` (o valor gerado a partir do `.env.example` apontava
pra uma porta legada, sem porta publicada no host) + `pnpm db:migrate`. `pnpm test:unit`
fechou verde: **354 arquivos, 3266 testes**.

## Gap conhecido — Camada 3 (pendente de validação na integração)

O hook de pre-commit exige Camada 3 (chamada LLM real) sempre que `src/lib/agent/**` muda —
é o caso do FIX-277 (`system-prompt.ts`). A `ANTHROPIC_API_KEY` deste worktree é virtual key do
gateway LiteLLM compartilhado (`litellm-srv.tb.local`), só funciona via VPN/túnel pra dentro da
VPC — indisponível nesta sessão (Tailscale parado, `.tb.local` não resolve). Perguntei ao Kairo
como proceder; ele autorizou seguir sem a Camada 3 agora ("pode terminar seu trabalho, vamos
validar na junção das features") — os 2 commits que tocam `system-prompt.ts`/prompt
(`b821db20`, `cb088af`) foram feitos com `--no-verify` **explicitamente autorizado nesta
sessão**, não por escolha própria. Camadas 1+2 (test:unit) verdes nos dois. **PENDENTE-KAIRO**:
validar Camada 3 (ou eval real) na integração/junção de features, quando houver acesso ao
gateway.

## Decisões tomadas por conta própria

1. Incluí a frase do "booking/não paga nada agora" na copy do FIX-278 (o card marcava como
   opcional, "anotar como achado" se não coubesse) — decidi incluir porque havia espaço óbvio
   na sequência de mensagens, e é P0 na Ata.
2. Estreitei o teste FIX-235 que bania "reservado" em bloco, mantendo só o veto real
   (garantido/já está no grupo) — necessário pra não colidir com a terminologia nova mandatória.
3. Propaguei a correção de terminologia pra `interactive-handlers.*.test.ts` e
   `jornada-rubric.ts`, fora do `escopo_arquivos` declarado no `_bloco.md` — sem isso, ou
   quebrava a suíte, ou o rubric do eval penalizaria a copy correta como defeito.
4. Não implementei a sugestão opcional do FIX-277 de expor os dois valores no contexto textual
   do turno (fora do escopo mínimo, mudança de orquestração maior).
5. Bootstrap do ambiente local do zero (Postgres do workspace + backfill de secrets) pra
   viabilizar `pnpm test:unit` — não é decisão de produto, mas registro porque não estava óbvio
   a partir do card.

## Testes

- `pnpm test:unit`: **354 arquivos / 3266 testes, verde**.
- Novos/ajustados: `closing-presentation.test.ts` (+3 testes, 1 reescrito), 2 testes de
  `interactive-handlers.*` (regex atualizado), `jornada-rubric.ts` (texto do rubric),
  `credit-adjustment-notice.fix-197.test.tsx` (+1 teste), `system-prompt.fix-277-falsa-exatidao.test.ts`
  (novo arquivo, 3 testes).
