---
titulo: "Bloco r8 acabamento — empty-turn resolve + voz residual (veredito Fable r7, 8/10)"
data: 2026-07-10
bloco: bloco-r8-acabamento
branch: fix/r8-acabamento
tipo: fix (rodada 8 do loop de qualidade — verificação independente Fable)
---

# Bloco r8 acabamento — FIX-271/272

Rodada 8 contra o veredito independente do Fable r7
(`docs/correcoes/rodada2-fable/veredito-fable-r7.md`, nota 8/10 — subiu de 7).
Fecha os 2 residuais de acabamento marcados como escopo deste bloco (o item
mais sério da rodada — fabricação de estado no pós-fecho — foi escopo do
bloco paralelo `bloco-r8-estado-verdade`, não deste).

## TL;DR

- **FIX-271** (empty-turn não resolve menção) — o fallback de turno-mudo
  (`finishReason="length"`, achado ao vivo 52.9s) pedia "manda de novo, por
  favor?" mesmo quando o usuário já tinha nomeado uma oferta exibida na tela —
  mesma classe de bug que o FIX-266 já tinha corrigido no caminho do
  tool-error (`index.ts`), só que aqui no guard de empty-turn, que vive em
  `route.ts` (fora do `runTurn`, roda só no turno de texto-livre). Quando não
  há gate pendente pra reengajar (FIX-208), roda o MESMO resolver de menção
  (`resolveOfferMentionForConversation`) contra os grupos já exibidos antes de
  desistir; resolvendo, reafirma a oferta (`buildToolErrorRecoveryResolvedFallback`)
  em vez de pedir de novo.
- **FIX-272** (3 residuais de voz) —
  1. "reserva" ainda vivo na PROSA do LLM: o gate já tinha sido limpo
     (FIX-268), mas o directive de REAÇÃO ao clique (`buildLanceReactionDirective`,
     disparado logo depois) ainda dizia "sobre ter reserva pra lance" — o
     próprio directive primava o modelo com o termo proibido (achado ao vivo:
     "com sua reserva pra lance", inclusive presumindo reserva não declarada).
     Trocado pra linguagem do gate + proibição explícita.
  2. Costura colada em OUTRA emenda (mesma classe do FIX-268, que já tinha
     fechado a costura entre scarcity e decision_prompt): a resposta do turno
     PRINCIPAL (às vezes termina em pergunta) colava sem espaço no lead-in do
     PRIMEIRO directive do bloco de decisão (scarcity ou so_parcela).
     `text-boundary` incondicional no topo do bloco `nextGateToFire ===
     "decision"` (`index.ts`), cobrindo os dois caminhos de uma vez.
  3. Dup-click no gate `lance-embutido` (clique repetido antes do botão
     desabilitar) reprocessava um gate já respondido — o estado já tinha
     avançado (`simulatorOfferDispatched=true` do click #1), `nextGate`
     recomputava "decision", e `pipeGatePrompt` não sabe renderizar esse gate
     (card e pergunta retornam null) → turno 100% vazio, sem passar pelo guard
     de empty-turn (só roda no turno de texto-livre, não em handlers de
     ação). Guard no topo do handler: `qualifyAnswers.lanceEmbutido` já
     setado → replay, não reprocessa.

## Commits

| Commit | O quê |
|---|---|
| `00966a5` | test+fix: empty-turn resolve menção antes de pedir de novo (FIX-271) |
| `440ccf4` | test+fix: varre 'reserva' da reação de lance + fecha costura + guarda dup-click (FIX-272) |

## Metodologia de teste

TDD strict em cada item — teste escrito e verificado FALHANDO (RED) antes de
qualquer mudança de código, depois implementado até passar (GREEN). Testes
estruturais (leem `route.ts`/`index.ts`/`directives.ts` como texto, sem DB —
mesma convenção já usada no repo desde `fix-237-cards-orfaos.test.ts` e
`lance-embutido-gate.test.ts`): o guard de empty-turn e o handler de ação
vivem dentro de handlers gigantes do route de Next.js, difíceis de exercitar
via request real num teste unitário — a prova comportamental fica pros
integration tests existentes (`index.fix-246-server-cards.integration.test.ts`
já cobre a emissão de artifacts do mesmo bloco de decisão tocado aqui).

Este worktree não tinha `.env.local`/Postgres bootstrado (gap conhecido de
worktree novo, mesmo já documentado nos blocos r6/r7). Subi o Postgres do
workspace via `docker compose --env-file .env.local up -d db` (env copiado do
clone principal) e rodei `pnpm install` + `pnpm db:migrate` + `pnpm test:unit`
inteiros dentro do container transitório (perfil `containerized` do
`docker-compose.yml`, host sem `node_modules`). Suíte completa: **348
arquivos / 3230 testes, 100% verde**.

Dois testes pré-existentes precisaram de ajuste mecânico (não enfraquecimento
de asserção) por causa do FIX-272: `tests/regression/agent-trajectory.test.ts`
(janela de regex 500→700 chars — o corpo de `buildLanceReactionDirective`
cresceu com a proibição explícita) e `tests/regression/fix-268-decision-picotado.test.ts`
(o `indexOf` do boundary passou a buscar a partir de `scarcityIdx`, porque
agora existem DOIS boundaries no bloco de decisão — o novo, no topo, e o do
FIX-268, entre scarcity e decision).

## Gate de commit local: hooks não ativos neste worktree

`.husky/_` não existe neste diretório (o `prepare` do husky falha silencioso
dentro do container Alpine — falta `git` na imagem — e nunca materializou o
wrapper no bind mount). `git config core.hooksPath` aponta pra um diretório
inexistente, então os 2 commits deste bloco rodaram SEM o pre-commit local
disparar (não foi `--no-verify` explícito — o hook simplesmente não existe
aqui). Na prática o efeito é o mesmo já documentado no bloco `r7-voz-polish`:
a Camada 3 (LLM real, `pnpm test:eval:quick`) não foi exercitada nesta sessão
— exigiria a VPN TwoBrains (`litellm-srv.tb.local`), indisponível neste
ambiente.

**PENDENTE-KAIRO**: rodar `pnpm test:pre-commit` (ou a Camada 3 isolada)
contra este branch de dentro da rede TwoBrains antes de promover pra
develop/prod — as mudanças de comportamento do agente aqui são só copy de
directive (baixo risco), mas nenhuma foi exercitada contra o modelo real
nesta sessão.
