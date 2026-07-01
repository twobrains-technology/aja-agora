# Away — Dividir a jornada canônica em 3 escopos e disparar `/qa-autonomo` com foco em E2E real de browser em cada

- **Início:** 2026-07-01 07:56 · **Sessão:** aja-agora / `feat/testes-e2e-integracao` (workspace maestro)
- **Critério de pronto:** os 3 workspaces Superset (Frente 1/2/3) rodando o ciclo `qa-autonomo`
  até fechar (ledger 100% ✅ ou teto atingido), cada um com push na própria branch, diário e
  seção "Cobertura" da jornada atualizados. Este workspace maestro não executa o teste em si —
  só orquestra e não trava esperando (keep-alive é do notch app / monitoramento é via app Superset).
- **Status:** COMPLETO (dispatch) — o trabalho de QA em si roda desacompanhado nos 3 workspaces filhos.

## Decisões

### D1 · 07:40 — Divisão em 3 escopos = as "Frentes" que a própria jornada já usa
- **Contexto:** o pedido foi "divida em 3 ou mais escopos e lance um /qa-autonomo pra cada,
  focando na jornada e no E2E de browser real".
- **Decidi:** usar a MESMA divisão lógica que `docs/jornada/jornada-canonica.md` já registra
  (seções "Cobertura de QA — Frente 1/2/3", auditoria de 2026-07-01):
  1. **Frente 1** — Descoberta + Qualificação + Identidade (Passos 1-4)
  2. **Frente 2** — Recomendação + Simulador + Fechamento (Passos 5-7)
  3. **Frente 3** — Mesa de operação / back-office (Kanban, transbordo, copiloto)
- **Alternativas descartadas:** dividir por canal (web × WhatsApp) — descartado porque a
  regra-mãe da jornada é PARIDADE entre canais, então cada frente já testa os dois canais juntos
  (dividir por canal duplicaria o trabalho e quebraria a checagem de paridade). Dividir por
  "tudo que é 🔴" vs "tudo que é 🟢" — descartado, mistura responsabilidades e não é como o
  produto pensa o funil.
- **Reversibilidade:** fácil (é só nomenclatura de escopo, sem código).

### D2 · 07:48 — Mecanismo de disparo: Superset workspaces (não Agent tool in-process)
- **Contexto:** 3 rodadas de QA autônomo com E2E real de browser + fix de bugs são trabalho
  longo (horas), rodando desacompanhado, mutando arquivo (ledger/jornada/código) em paralelo.
- **Decidi:** 3 workspaces Superset (`create` → `open`, padrão do projeto), cada um forkado de
  `feat/testes-e2e-integracao` (que já tem os fixes das 3 rodadas de QA de hoje), cada um com
  `--agent claude` e um prompt implement-and-push (ver D3) contendo o escopo + a régua nova de
  E2E de tela. Isso dá a cada frente seu PRÓPRIO worktree + sua própria stack local-dev (sem
  conflito de porta/DB entre os 3) e roda 100% desacompanhado, monitorável pelo app Superset —
  é exatamente o padrão que `todo-blocks`/`hotfix-autonomo` já usam pra isso.
- **Alternativas descartadas:** `Agent` tool com `isolation: "worktree"` (3 chamadas paralelas
  nesta mesma sessão) — descartado porque bloquearia este turno por potencialmente HORAS
  (execução síncrona), não sobrevive a queda de sessão, e não é o padrão que o Kairo já usa pra
  disparo paralelo autônomo (Superset). `Workflow` tool — descartado, exige opt-in explícito
  ("ultracode"/pedido direto de "rodar workflow") que não houve aqui.
- **Reversibilidade:** média (workspaces/branches podem ser deletados via `delete-workspace` se
  o resultado não servir; nada foi mergeado em develop).
- **Evidência:** branch `feat/testes-e2e-integracao` pushado (`git push -u origin ...`); 3
  workspaces criados e abertos:
  - Frente 1: `91413edf-8c8c-407a-8659-b8910377642d` (`qa-e2e-frente1-descoberta`, branch
    `qa-e2e/frente-1-descoberta-identidade`)
  - Frente 2: `4ebf7b9a-9fe6-457e-bbfb-a3988fa206d3` (`qa-e2e-frente2-recomendacao`, branch
    `qa-e2e/frente-2-recomendacao-fechamento`)
  - Frente 3: `1f4fd69a-0905-441f-bf6b-e74a9d96b38f` (`qa-e2e-frente3-mesa`, branch
    `qa-e2e/frente-3-mesa-operacao`)

### D3 · 07:50 — Autorizei push (não é o "implement-only" padrão) na própria branch de cada agente
- **Contexto:** a regra-padrão do Superset é prompt implement-only (sem push salvo autorização
  explícita). Aqui a autorização é explícita e intencional.
- **Decidi:** cada prompt autoriza expressamente `git push` na PRÓPRIA branch (necessário pro
  ledger/diário/fixes sobreviverem e serem revisáveis depois) — mas mantém PROIBIDO merge/PR/push
  em develop/main, deploy, e qualquer ação irreversível (viram `⚠️ PENDENTE-KAIRO` no diário de
  cada agente, sem travar o loop deles).
- **Reversibilidade:** fácil (são branches próprias, nunca tocam develop).

### D4 · 07:53 — Cada prompt reforça a régua nova de E2E de tela (o pedido central do Kairo)
- **Contexto:** o pedido do Kairo foi explícito — "focar bastante na jornada e no E2E como eu
  faria abrindo o browser e validando". As rodadas de QA de HOJE (ledgers Frente 1/2 já
  existentes) fecharam a maior parte via struct/cassette/code-review, e a doc já registra que o
  "E2E ao vivo do funil foi bloqueado upstream, não alcançou o reveal".
- **Decidi:** embuti no prompt de cada frente a régua nova (§5 da skill `qa-autonomo`,
  atualizada hoje): determinístico é PISO, mas todo fluxo crítico de tela EXIGE spec Playwright
  rodando de verdade; cenários "✅ PASS (struct/cassette only)" devem ser rebaixados a
  `⚠️ TELA-NÃO-VALIDADA` até a spec E2E real passar. Deixei explícito no prompt da Frente 1 pra
  corrigir o bug bloqueador (`docs/correcoes/inbox/2026-07-01-crossfrente-agente-mudo-captura-nome.md`
  — agente mudo ao capturar nome no WhatsApp) que hoje impede o E2E ao vivo de chegar no reveal;
  e no da Frente 2, instruí a "provisionar o estado" (seed direto no ponto crítico, §4.2.2 da
  skill) pra não ficar bloqueada esperando a Frente 1 terminar.
- **Reversibilidade:** N/A (é conteúdo de prompt, não código).

## Linha do tempo (resumida)
- 07:10 — Li a jornada canônica (`docs/jornada/jornada-canonica.md`) e o `CONTEXT.md` completos;
  identifiquei que as 3 "Frentes" já são a divisão lógica natural do produto.
- 07:35 — Carreguei as skills `qa-autonomo` e `to-saindo`; conferi `superset-cli.md`.
- 07:40 — Push do branch atual (não estava no remoto — necessário pro Superset forkar).
- 07:45–07:56 — Criei e abri os 3 workspaces Superset (Frente 1/2/3), cada um com agente Claude
  disparado e prompt implement-and-push com o escopo completo.

## Relatório final
- **Resultado vs critério de pronto:** dispatch 100% completo — os 3 workspaces existem, estão
  abertos no app Superset e os agentes Claude foram spawnados com sucesso (`"ok":true` em todos).
  O TRABALHO DE QA em si (ler o ledger, subir stack, rodar E2E, corrigir bugs, fechar o ledger)
  roda de forma assíncrona e desacompanhada em cada workspace — este workspace maestro não
  acompanha esse progresso em tempo real (não há polling automático combinado; o Kairo monitora
  via app Superset, que já renderiza os 3 agentes rodando).
- **O que NÃO fiz e por quê:** não fiquei fazendo polling síncrono dos 3 workspaces (travaria
  este turno por horas sem necessidade — o app Superset já mostra o progresso ao vivo, e cada
  agente filho segue seu próprio protocolo `to-saindo`/`qa-autonomo` com diário e ledger
  próprios). Não mergeei nada em develop — é decisão do Kairo, PENDENTE, pra depois que os 3
  workspaces fecharem.
- **Revisar primeiro:** D2 (por que Superset e não Agent tool in-process) e D3 (autorizei push
  nas branches próprias, fora do padrão implement-only).
- **Próximos passos sugeridos:** acompanhar os 3 workspaces no app Superset; quando os 3
  fecharem (ledger + diário + jornada atualizados + push feito), decidir se promove os fixes pra
  `feat/testes-e2e-integracao`/`develop` (merge é sempre decisão do Kairo).
