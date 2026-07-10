---
titulo: "Bloco r3 serverside-cards — emissão determinística dos cards do handoff (veredito Fable r2, 4/10)"
data: 2026-07-10
bloco: bloco-r3-serverside-cards
branch: fix/r3-serverside-cards-consorcio
tipo: fix (rodada 3 do loop de qualidade — verificação independente Fable)
---

# Bloco r3 serverside-cards — FIX-246..250

Rodada 3 contra o veredito independente do Fable r2
(`docs/correcoes/rodada2-fable/veredito-fable-r2.md`, nota 4/10). Fecha a
CAUSA-RAIZ arquitetural que segurava a nota: os 3 cards do handoff
(`two_paths`/`embedded_bid`/`scarcity`) e o aviso de ajuste de carta
dependiam de o LLM **obedecer um directive** — invariante crítico no PROMPT,
não em CÓDIGO (violação das Leis 1 e 4 de
`~/.claude/reference/arquitetura-agentes-ia.md`).

## TL;DR

- **FIX-246** (item-título) — os 3 cards tinham **0 emissões em 7
  oportunidades ao vivo** no veredito. Agora são emitidos **server-side
  determinístico**: o handler (`route.ts` pro canal web, `orchestrator/
  index.ts` pro texto livre/WhatsApp) monta o payload coagido direto de
  `meta.recommendedOffer` (reusando `coerceTwoPathsPayload`/
  `coerceEmbeddedBidPayload`/`coerceScarcityPayload`, já existentes) e escreve
  o `data-artifact` direto — o directive agora só gera a frase de introdução
  (1 frase, texto puro). As 3 tools **saíram do toolset do LLM em toda fase**
  (`tool-policy.ts`) — não é mais "desencorajado por prompt", é
  **impossível** o modelo chamá-las (Lei 2 — allowlist positiva).
- **FIX-247** — o clamp de faixa já funcionava (BB 157.845 em vez de 211k),
  mas o aviso de ajuste (FIX-197) estava **morto em integração**:
  `route.ts` desestruturava `{proposalId, offer, noOffer}` do
  `startContract`, descartando `requestedCreditValue` antes de
  `realOfferPresentation`; o canal WhatsApp (`contract-capture.ts`) tinha o
  mesmo gap. Corrigido nos dois canais + copy do aviso (estava
  semanticamente invertida: "essa carta" apontava pro pedido, "sua faixa"
  pra carta nova — trocado por "você pediu ~X — a carta real ficou em Y").
- **FIX-248** — "Juntando R$ 4." | "000,00 por mês" quebrava em 2 bolhas ao
  vivo: o splitter de frases (`sanitizer.ts`) tratava o ponto de milhar como
  fim de sentença. Guarda de dígito: um "." colado a um dígito nunca é
  fronteira (nem no split completo, nem no filtro por delta do streaming).
- **FIX-249** — achado ao vivo: usuário escolheu "ITAÚ" (visível na
  comparison_table), o agente **negou a existência**, inventou groupIds
  (bloqueados corretamente pelo guard) e terminou prometendo **"te
  retorno"** — a web não tem canal proativo, o run morreu esperando algo que
  nunca chegaria. Nova barreira em código (sanitizer bane a promessa de
  retorno, qualquer canal) + reforço das diretivas de recovery do guard
  (`action-policy.ts`) proibindo negar a entidade/prometer retorno. **Gap
  conhecido, registrado no card**: falta uma rota determinística que resolva
  o nome citado em texto livre contra `shown.administradoras` — a raiz mais
  funda (Lei 1) fica pra uma rodada futura dedicada.
- **FIX-250** (polish) — "é tipo um booking" (inglês solto) → "pré-reserva";
  regra dura proibindo presumir "primeira vez com consórcio" antes do gate
  `experience` confirmar; e um gap de observabilidade real (`turn-trace.
  suppressed` ficava **sempre `[]`** no canal web, porque "suppression"
  nunca vira UI part por desenho — corrigido com um side-channel
  (`getTraceForWriter`, WeakMap) que fecha o gap sem mudar assinatura de
  nenhuma função `pipeXxx` em `route.ts`.

## Commits

| Commit | O quê |
|---|---|
| `db1b072b` | fix: emite two_paths/embedded_bid/scarcity server-side, sem tool-call (FIX-246) |
| `86535713` | fix: fia rawCreditValue ponta-a-ponta no fechamento (FIX-247) |
| `4a798f4b` | fix: guarda de dígito no splitter de frases evita quebrar valor monetário (FIX-248) |
| `cd716058` | fix: recovery de alucinação de entidade + proíbe promessa de retorno na web (FIX-249) |
| `b21a1787` | fix: polish — booking em PT-BR, presunção de primeira vez, trace de suppression na web (FIX-250) |

(+ 6 commits `docs:` movendo cada card pra `done/` com status/commit/executado_em)

## Metodologia de teste

TDD strict em todo item — teste escrito e verificado FALHANDO antes da
correção (reproduzindo o cenário exato do veredito), depois corrigido até
passar. `pnpm test:unit` (328 arquivos / 3089 testes) e
`RUN_DB_TESTS=1 pnpm test:integration` (67 arquivos / 279 testes) VERDES
antes do push, rodados num workspace local (`~/.claude/skills/local-dev`,
Postgres real).

**A evidência mais forte do bloco** é o teste de integração do FIX-246
(`route.fix-246-server-cards.integration.test.ts` +
`index.fix-246-server-cards.integration.test.ts`): sobe o handler `POST
/api/chat` REAL contra o DB real, com um agente **mocado que NUNCA chama
nenhuma tool** (só produz texto) — e os 3 cards ainda assim aparecem no
stream e persistem no banco. O `turn-trace` de cada teste confirma
`"toolsCalled":[],"toolCount":0` lado a lado com o artifact emitido — prova
mecânica de que a emissão não depende de o modelo obedecer nada.

Pro FIX-247, o teste mocka SÓ a fronteira externa (Bevi/`startContract`) e
exercita o handler `contract-submit` REAL de ponta a ponta — não só a
função `realOfferPresentation` isolada (que já passava mesmo com o campo
morto, era teste de folha).

## Mudança de processo no meio do bloco (a pedido do Kairo)

O bloco começou seguindo o protocolo de onda (rodar `~/.claude/skills/
local-dev` pra validar E2E via browser + sinalizar conclusão via tag
sentinela pro orquestrador `merge-wave.sh` integrar depois). No meio da
execução (após FIX-246 pronto), o Kairo interrompeu e pediu explicitamente:
(1) parar de rodar rodadas de verificação estilo Fable via OrbStack; (2)
integrar direto na branch `integ/agente-vendas-consorcio` ao terminar,
sem esperar o orquestrador; (3) deixar a validação ampla pra develop.
Confirmado com ele via pergunta (branch = `integ/agente-vendas-consorcio`;
terminar os 5 itens antes de integrar). A partir daí:
- Segui usando o MESMO container já de pé (bootstrapado antes da
  interrupção) só pra rodar `vitest` — não subi mais nada novo nem fiz
  condução E2E via browser/API.
- Ao terminar os 5 itens, fiz `git push` da branch + `git merge --no-ff`
  direto em `integ/agente-vendas-consorcio` (worktree separado, mesmo
  commit-base, merge limpo sem conflito) + `git push` — **sem** passar pela
  tag-sentinela `block-done/*` (o Kairo assumiu a integração manualmente,
  então o sinal pro orquestrador ficaria redundante/confuso).

## Gap honesto: validação E2E ao vivo NÃO foi feita nesta rodada

Por pedido explícito do Kairo (ver acima), não fiz condução manual/E2E via
browser contra a app rodando desta vez — a prova de que os cards emitem
veio dos testes de integração (DB real + agente mocado sem tool-call,
descritos acima), não de uma conversa real ponta a ponta. O card FIX-249
também documenta explicitamente um gap conhecido de escopo (rota
determinística de resolução de nome por texto livre, fora desta rodada).

**PENDENTE-KAIRO**: uma rodada de verificação Fable (ou condução manual)
sobre `integ/agente-vendas-consorcio` já mergeado, quando fizer sentido no
fluxo — pra confirmar visualmente os 3 cards + o aviso de ajuste numa
conversa real, e avaliar se o gap do FIX-249 (negação de entidade nomeada
por texto) precisa de um bloco dedicado.
