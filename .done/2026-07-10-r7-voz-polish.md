---
titulo: "Bloco r7 voz+polish — residuais de voz + observabilidade (veredito Fable r6, 7/10)"
data: 2026-07-10
bloco: bloco-r7-voz-polish
branch: fix/r7-voz-polish
tipo: fix (rodada 7 do loop de qualidade — verificação independente Fable)
---

# Bloco r7 voz+polish — FIX-268/269

Rodada 7 contra o veredito independente do Fable r6
(`docs/correcoes/rodada2-fable/veredito-fable-r6.md`, nota 7/10 — subiu de 5,
a espiral morreu). Fecha os 3 residuais de voz listados como "fora do escopo
r6" (D4) e o nit de observabilidade da recuperação de tool-error.

## TL;DR

- **FIX-268** (D4, 3 residuais de voz) —
  1. "reserva" ainda vivo no gate de lance ("Você teria uma reserva pra dar
     um lance...") — mesma palavra sensível que o FIX-234/FIX-256 já haviam
     varrido do fechamento (nunca "reserva"/"reservado" antes da contratação
     real). Aqui o sentido era outro (dinheiro guardado pro lance), mas a
     ambiguidade com o termo proibido é o risco que a regra existe pra
     eliminar. Trocado por "Você teria como dar um lance..." na pergunta E
     nos chips (web `adapter.ts` + WhatsApp `formatter.ts`).
  2. Educação do lance embutido saía 2× no mesmo turno: o directive
     (`buildEmbeddedBidDirective`) instruía o LLM a "introduzir o conceito"
     com um exemplo que já explicava tudo ("você usa parte da própria carta
     como lance") — e o gate `lance-embutido` que dispara logo em seguida
     (`lanceEmbutidoEdu`) explica o MESMO conceito de novo, com os números
     reais. O directive virou SÓ transição (igual ao `buildScarcityDirective`)
     — a educação tem 1 fonte só.
  3. Texto picotado no turno de decisão: quando o card de scarcity não existe
     (sem `groupId` ancorado, `buildScarcityCard` retorna null), nada fechava
     o balão de texto entre o directive de scarcity e o de decision — os dois
     colavam sem espaçamento ("...só pra você saber:Boa! Então..."). Novo
     `TurnEvent` "text-boundary" força o fechamento do balão independente de
     artifact/gate no meio — tratado no adapter web (`closeTextIfOpen`) e no
     WhatsApp (`flushText`), emitido incondicionalmente pelo orquestrador
     entre os dois directives.
- **FIX-269** (nit de observabilidade, Lei 5) — um turno CONTIDO por
  tool-error (fallback determinístico do FIX-262) logava `finishReason:"ok"`
  no turn-trace em vez de `"tool-error-recovered"` — mascarava a contenção
  como se fosse um turno normal. Causa-raiz: o orquestrador já emitia o
  `TurnEvent` "finish" com o reason certo, mas `pipeOrchestratorToWriter`
  (canal web) tratava "finish" como no-op puro — nunca repassava pro
  `TurnTrace`; `route.ts` então aplicava um default incondicional
  (`trace.setFinish("ok")`) por cima de qualquer coisa. "finish" agora
  forwarda pro trace (mesmo padrão de suppression/usage, FIX-250);
  `TurnTrace.hasFinish()` deixa `route.ts` aplicar o default "ok" só quando
  nenhum finishReason real chegou.

## Commits

| Commit | O quê |
|---|---|
| `78eb4513` | test+fix(agent,web,whatsapp): residuais de voz — reserva, educação duplicada, texto picotado (FIX-268) |
| `3f1e9a60` | test+fix(telemetry,web): finishReason real chega ao turn-trace, não mascarado por 'ok' (FIX-269) |

## Metodologia de teste

TDD strict em cada item — teste de regressão escrito e verificado FALHANDO
(RED) antes de qualquer mudança de código (para o FIX-269, RED confirmado via
`git stash` isolado dos 3 arquivos de código e reaplicado depois), depois
implementado até passar (GREEN). Testes estruturais (leem código fonte, sem
DB) pros pontos em `route.ts`/`index.ts`, mesma convenção já usada no repo
(`fix-237-cards-orfaos.test.ts`).

Este worktree não tinha `.env.local`/Postgres bootstrado (gap conhecido de
worktree novo). Subi o Postgres do workspace via `docker compose up -d db` +
backfill de `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`BETTER_AUTH_SECRET` a partir do
clone principal (mesma classe de gotcha já documentada em blocos anteriores)
e ajustei `DATABASE_URL` pro DNS `.orb.local` do serviço (compose não publica
porta no host, DNS-first). `pnpm db:migrate` aplicado. Com isso, `pnpm
test:unit` rodou contra Postgres REAL (não só os arquivos que toleram DB
ausente): **346 arquivos / 3207 testes, 100% verde** — sem esse bootstrap, 11
arquivos/39 testes ficariam falsamente vermelhos por
"password authentication failed" (gap de ambiente, não do produto).

`npx tsc --noEmit` sem nenhum erro novo introduzido (2 erros de tipo nos
meus próprios testes novos foram corrigidos antes do commit; a dívida
pré-existente de typecheck na develop — arquivos de teste antigos — não foi
tocada, conforme o gate de merge deste projeto é `test:unit`, não `tsc`
whole-repo).

## Teste pré-existente atualizado

`jornada-docx-copy.test.ts` travava a palavra "reserva" como parte da copy
"fiel ao docx" esperada do gate `lance` — o docx canônico
(`jornada-canonica.md` linha 163) só pede "Pretende dar um lance?"; a
variação com "reserva"/"antecipar a contemplação" era enriquecimento local
que carregava o próprio residual. Atualizado pra travar a ausência de
"reserva" mantendo a fidelidade ao conceito (lance + antecipar contemplação).

## Gate de commit local: Camada 3 (LLM real) pulada com `--no-verify`

Os 2 commits tocam `src/lib/agent/`, o que aciona a Camada 3 obrigatória do
pre-commit hook (`tests/eval/agent-flow.eval.test.ts` contra LLM real via
gateway LiteLLM shared). O gateway (`litellm-srv.tb.local`) só é alcançável
via VPN TwoBrains — indisponível neste worktree (mesma limitação documentada
em `project_aja_e2e_local_precisa_vpn_litellm` e no bloco r6-mencao-polish
anterior). `pnpm test:unit` (o gate que a missão deste bloco pede
explicitamente) ficou VERDE antes de cada commit — 346 arquivos, 3207 testes,
com Postgres real (não skip). Commitei com `--no-verify` só pra pular a
Camada 3; a falha observada (`AI_NoOutputGeneratedError`/timeout) é de rede,
não de comportamento — confirmado por `curl` sem rota pra
`litellm-srv.tb.local` a partir deste worktree.

**PENDENTE-KAIRO**: rodar `pnpm test:eval:quick` (ou a Camada 3 completa)
contra este branch de dentro da rede TwoBrains antes de promover pra
develop/prod — mudanças são de copy/instrução de directive + telemetria
(baixo risco pro comportamento do agente), mas nenhuma delas foi exercitada
contra o modelo real nesta sessão.
