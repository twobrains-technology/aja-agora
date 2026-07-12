# Bloco r9-2 gate-refino — FIX-285 + FIX-284

## Resumo

Os 2 itens deste bloco eram os dois gaps de **refino do gate `desire`** apontados pelo
veredito Sonnet 5 pós-onda-1 (G-C e G-F): o motivo ("por que agora") sendo pulado quando o
usuário só nomeia a categoria genérica, e o gate `credit` re-perguntando um valor que o
usuário já tinha mencionado informalmente 2 turnos antes. Ambos os root causes já vinham
provados file:line nos cards — nenhuma decisão de produto/UX em aberto, só execução.

## FIX-285 — `shouldAskMotive` não depende mais de `desiredItem` específico

**Root cause confirmado:** `shouldAskMotive` exigia `Boolean(q.desiredItem)`, mas o
`turn-analyzer.ts` devolve `desiredItem: null` **por design** quando o usuário só nomeia a
categoria genérica ("um carro, uns 80 mil") — o motivo nunca era perguntado e `gate:identify`
disparava direto, fora de ordem (sintoma: CPF pedido 2x em turnos seguidos).

**Correção:** novo campo `meta.desireAnswered?: boolean`, marcado em `analyze.ts` — mas com um
escopo mais estrito do que o card sugeria (ver "Decisão técnica" abaixo). `shouldAskMotive`
troca a precondição pra `Boolean(meta.desireAnswered)`. `desireFollowUpSection`
(`system-prompt.ts`) ganha uma 3ª variante: quando `desireAnswered=true` mas `desiredItem` é
null, pergunta o motivo sem citar o item.

### Decisão técnica (desvio do card)

O card sugeria marcar `desireAnswered` em qualquer turno de usuário com `meta.desireAsked`
true. **Isso causava uma regressão real**: como `desireAsked` nunca reverte a false, QUALQUER
turno futuro (ex.: o usuário respondendo o gate `credit`, muitos turnos depois) marcaria o
campo retroativamente — e como o guard `if (isUserTurn && shouldAskMotive(meta)) return false`
em `decideShowGate` não é específico do gate `identify`, isso passaria a segurar **todos os
gates** dali em diante, não só o `identify`, até `motivationAsked` ser setado. Pego pelos
cassettes pré-existentes de `tests/regression/agent-trajectory.test.ts` (FIX-208, gate
`credit`/`search` com `neutral`) — 2 testes quebraram na primeira tentativa.

**Fix do fix:** o marcador só dispara quando `activeGateAtTurnStart === "identify"` (a janela
real entre o `desire` ter sido perguntado e a identidade ainda não coletada — exatamente o
turno da resposta ao `desire`, por causa da ordem FIX-53). Rodada completa de `test:unit`
confirmando 0 regressões depois do ajuste.

### Testes

- `qualify-state.fix-285-motivo-item-generico.test.ts` (novo) — `shouldAskMotive` com
  `desireAnswered: true` + `desiredItem: undefined` → `true` (falhou antes, passou depois);
  cobre idempotência, precedência do caminho feliz (item específico) e o watchdog FIX-275.
- `analyze.test.ts` (novo describe) — prova a wiring real: `desireAnswered` marcado no turno
  certo, não marcado antes de `desireAsked`, idempotente.
- `system-prompt.fix-233-motivation.test.ts` (extendido) — nova variante de
  `desireFollowUpSection` sem citar item.
- Fixtures existentes ajustadas (não regredir): `qualify-state.fix-274-sem-consent.test.ts` e
  `qualify-state.fix-275-motivo-nao-trava.test.ts` ganharam `desireAnswered: true` nos cenários
  que já representavam "desire respondido com item específico" (a precondição mudou de campo,
  as fixtures precisavam refletir isso).

## FIX-284 — `gate:credit` confirma o valor já mencionado no `desire`

**Root cause confirmado:** o valor mencionado informalmente no turno do `desire` ("uns 70
mil") nunca ficava salvo em nenhum campo — o guard `activeGateAtTurnStart` do FIX-279
descarta `q.creditMax` de propósito fora do gate `credit` (pra não regredir o G3 do baseline,
já morto) — então quando o `gate:credit` ligava, 2 turnos depois, não havia nada pra confirmar
e a pergunta saía do zero.

**Correção:** novo campo `q.creditMentionedAtDesire?: number` em `personas.ts`, capturado em
`analyze.ts` **sem** gating por `activeGateAtTurnStart` (nunca substitui a agulha formal —
primeira ocorrência apenas, mesmo padrão de `desiredItem`/`motivation`). `gateQuestion("credit",
...)` ganha um 5º parâmetro opcional; quando presente, devolve `"Uns {valor} então, é isso?
Pode ajustar se quiser."` em vez da pergunta em branco.

### Testes

- `gate-questions.fix-284-confirma-desire.test.ts` (novo) — com valor mencionado, confirmação
  citando o valor (BRL); sem valor, mantém o texto antigo (fallback D11); valor 0/inválido não
  dispara a confirmação; funciona nos dois canais.
- `analyze.test.ts` (novo describe) — `creditMentionedAtDesire` capturado SEM popular
  `creditMax` fora do gate credit (não regride FIX-279/G3); quando o gate credit está
  realmente ativo, os dois campos são populados juntos; primeira ocorrência não é sobrescrita.

### Call-sites ajustados (além do previsto no card)

O card citava só `whatsapp/adapter.ts` e `gate-reengage.ts`. Um `grep -rn "gateQuestion("
src/` antes de mexer revelou mais 2 pontos:

- `src/lib/web/adapter.ts` tem **dois** call-sites de `gateQuestion` (não um): `pipeGatePrompt`
  e o handler do evento `gate` dentro de `pipeOrchestratorToWriter`.
- `gate-reengage.ts` (`reengageQuestionForGate`) precisou de um parâmetro próprio, repassado
  pelos **3** chamadores dele: `route.ts` (web) + 2 pontos em `whatsapp/adapter.ts` (guard de
  turno-mudo e guard de desvio).

## Gate

- `pnpm test:unit`: **356 arquivos / 3290 testes, 100% verde.**
- `pnpm typecheck`: sem erros novos nos arquivos deste bloco (grep filtrado — a dívida
  pré-existente do repo em test files não foi tocada).
- Pre-commit (Camadas 1+2+3, incluindo eval LLM real `test:eval:quick`): verde nos 2 commits de
  código.
- Push: `fix/r9-2-gate-refino` — 5 commits (`1b5eb660` fix FIX-285, `860daeb2`+`170fc21e` docs
  done/, `f3f5282a` fix FIX-284, `d345ed2c` docs done/ + apaga bloco esvaziado).

## Gaps honestos

- **Ambiente do worktree sem stack local**: este worktree não tinha `.env.local` nem
  Postgres/containers configurados (bootstrap nunca rodado pra esta branch). Rodei
  `~/.claude/skills/local-dev/scripts/bootstrap-workspace.sh` pra subir uma stack ISOLADA
  (`aja-pg-r9-2-gate-refino`) em vez de reusar o banco compartilhado do `develop` (evitar
  contaminar o ambiente interativo do Kairo) — não é dívida do código, é setup de máquina.
- Não validei E2E ao vivo (browser) nem rodei Playwright — fora do escopo deste bloco de
  execução autônoma e explicitamente vetado pelo Kairo durante a sessão. A prova das duas
  correções é via TDD unitário RED→GREEN + regressão completa (`test:unit`).
- `desireFollowUpSection`/`buildSpecialistDynamicBlocks`/`buildSpecialistPrompt` ganharam mais
  um parâmetro posicional (`desireAnswered`) pra propagar o novo campo até o prompt — segue o
  mesmo padrão dos parâmetros anteriores (`motivation`, `desiredItem`), sem quebrar chamadores
  existentes (default `false`).
