# Decisão — Bloco funil/orquestração do turno (governança determinística de DADO e ERRO)

> 2026-07-01 · Design do `bloco-funil-turno-orquestracao` (FIX-186 + FIX-187).
> Resposta ao print do Kairo ("vazamento de processo + proposta fantasma"): o
> agente narrou o erro cru da descoberta ("dificuldade técnica pontual") junto de
> vários preâmbulos "vou buscar" empilhados numa bolha só, e MESMO ASSIM mostrou
> um card de proposta com números sobre dado que não carregou no turno.
> Fundamento: `~/.claude/reference/arquitetura-agentes-ia.md` (as 6 leis).
> Estende — não duplica — a governança do bloco A
> (`2026-07-01-bloco-a-governanca-agente.md`): a allowlist estado→ação→precondição
> ganha a dimensão "descoberta bem-sucedida NESTE turno".

---

## Contexto — o buraco que estes dois itens fecham

O bloco A formalizou a precondição de DADO ("o grupo/administradora foi exibido
alguma vez?"). Mas ela é cega a DUAS coisas que este bloco resolve:

1. **Erro de descoberta vira texto do modelo (FIX-186).** `runDiscovery`
   (`ai-sdk.ts`) logava e **re-lançava** o erro do adapter Bevi. Um `throw` numa
   tool do Vercel AI SDK vira **tool-error** que volta pro modelo — e o modelo o
   **narra** ("tive um problema", "dificuldade técnica pontual"). Como o turno é
   multi-step, cada tentativa gera um novo preâmbulo e tudo empilha. O ADR do
   bloco A já decidiu **NÃO** usar `experimental_repairToolCall` (não dispara em
   retorno `{error}`, só em parse-error) — o caminho certo é converter o erro em
   **diretiva determinística** no próprio código (mesmo padrão do FIX-72).

2. **Proposta ancorada em dado que não carregou (FIX-187).** O gate só checava
   "administradora já exibida alguma vez", não "a descoberta DESTE turno teve
   sucesso". `present_recommendation_card`/`present_simulation_result` nem estavam
   na tabela de precondição. Resultado: card de proposta pós-falha, com números,
   apresentado como atual — viola a REGRA DE PRODUTO #2 (Bevi fonte única).

---

## Decisão de trade-off (a única aberta no design)

### Quantos retries e o timeout do retry silencioso do FIX-186
**Decisão: 1 retry silencioso, backoff curto de 300 ms, SÓ em erro transitório.**
(Alternativas: sem retry — mais frágil a soluço momentâneo da homologação; ou
N retries com backoff exponencial — estoura o "< 3s" do CLAUDE.md e disfarça
falha dura.)

- **Transitório** (retry pode curar): rede/timeout, `BeviApiError` com `code >= 500`
  ou `408/429`, e erro sem tipo conhecido (default: 1 retry barato). → 1 retry.
- **Duro** (nunca cura no retry): `BeviConfigError` (403), `MinCreditError`,
  `Duplicated/Ongoing/Ownership/OfferExpired`, `BeviApiError` 4xx. → sem retry,
  vai direto ao fallback.
- **Por quê 300 ms:** o gargalo real é a chamada à Bevi; 300 ms entre tentativas
  é imperceptível e não estoura o orçamento de 3 s. Classificação em código
  (`isTransientDiscoveryError`, `bevi-errors.ts`), não regra-no-prompt.
- Rodada de `AskUserQuestion` **dispensada** (o `_prompt.md` autoriza seguir a
  recomendada). Reversível: o diff é localizado (uma const + um classificador).

---

## Design fechado

### FIX-186 — erro de descoberta vira diretiva determinística (retry + fallback humano)

O LLM **não** decide o que falar no erro (Lei 1); o código dispõe.

| O quê | Onde |
|---|---|
| `isTransientDiscoveryError(err)` — classifica transitório × duro | `adapters/bevi/bevi-errors.ts` |
| `runDiscovery` **para de re-lançar**: 1 retry silencioso (transitório) e, na falha, seta um flag de closure `discoveryFailed` e retorna um **marcador** `{ __discoveryFailed:true, error }` — nunca `throw`. Curto-circuita as tools de descoberta seguintes do MESMO turno (não martela a Bevi) | `tools/ai-sdk.ts` (`runDiscovery`) |
| Runner detecta o marcador no `tool-result` → `discoveryFailedThisTurn=true`; **suprime** os text-delta seguintes (mata a narração de erro + preâmbulos empilhados); **não persiste** o texto do modelo; retorna o sinal no `RunAgentResult` | `orchestrator/runner.ts` |
| Orchestrator materializa a **mensagem amigável FIXA** (determinística) + convite a ação e finaliza o turno (`reason: "discovery-failed"`) — padrão do `yieldTransitionAbort` | `orchestrator/index.ts` |
| Copy PT-BR correta, **sem** palavras de erro técnico cru ("problema"/"dificuldade técnica"/"instabilidade"/"tente de novo") | `orchestrator/directives.ts` (`buildDiscoveryFailedFallback`) |

**Ações clicáveis (gap honesto):** o card lista "Tentar de novo / Falar com
especialista da Aja" como botões. O artifact `quick_reply` **renderiza `null`** no
front (não há componente), e criar um componente novo é UI (fora do escopo deste
bloco). O fallback entrega o convite às duas saídas **em texto** (o usuário
responde por texto; o handoff existente cobre "especialista"). Os botões dedicados
ficam pra onda 2 (chat layer) / próxima rodada — registrado, não escondido.

### FIX-187 — gate de proposta exige descoberta bem-sucedida NO TURNO

Defense-in-depth (igual bloco A): allowlist positiva (1ª linha) + artifact-guard
(2ª linha). O sinal é o `discoveryFailedThisTurn` do FIX-186.

| Linha | O quê | Onde |
|---|---|---|
| 1ª (precondição) | `ActionPreconditionContext` ganha `discoveryFailedThisTurn`. `present_decision_prompt`/`present_recommendation_card`/`present_simulation_result` reprovam quando o turno teve erro de descoberta (compõe com a checagem de shown-groups existente) | `orchestrator/action-policy.ts` + overrides em `tools/ai-sdk.ts` (novo override de `present_simulation_result`; `present_decision_prompt` passa a checar sempre) |
| 2ª (guard reativo) | Nova regra `discovery-failed` (1ª da lista, mais forte) dropa a família de descoberta/proposta (recommendation/simulation/comparison/group_card/decision/dial) quando `discoveryFailedThisTurn` | `orchestrator/artifact-guard.ts` + `runner.ts` passa o sinal |
| Invariante em código | Número fiscal/de oferta só de retorno REAL — as 3 tools + o guard, não regra-no-prompt | (as tools + guard) |

**Limitação conhecida (gap honesto):** o runner emite o artifact a partir do
`tool-call` (input), que no `fullStream` vem ANTES do `tool-result`. No fluxo
SEQUENCIAL da jornada (busca → vê resultado → apresenta — o caso do print) o
`tool-result` da busca falhada já passou quando a apresentação chega, então o
guard barra. Num turno onde o modelo emitisse busca **e** apresentação como
tool-calls **paralelas no mesmo step** (não observado na jornada), o artifact
sairia antes do sinal — mitigado pela supressão de texto + não-avanço de gate +
fallback, mas não 100%. Registrado.

---

## Ordem de execução e integração

- **FIX-186 → FIX-187** (o 187 lê o `discoveryFailedThisTurn` que o 186 cria).
- Toca `runner.ts` (fora do `escopo_arquivos` declarado, mas a LÓGICA do turno é
  desta onda por desenho — o `_bloco.md` reconhece o overlap com a onda 2 no
  `conflitos_esperados`; a onda 2 forka da base já com esta integrada → sem
  conflito de merge).
- Testes nas 3 camadas obrigatórias (structural + cassette + eval nightly).

## Gaps / PENDENTE-KAIRO

- Botões dedicados "Tentar de novo / Falar com especialista da Aja" (UI) — onda 2.
- Caso teórico de tool-calls busca+apresentação paralelas no mesmo step.
- Evidências irmãs (`agente-trava-apos-valor`, `valor-componente-nao-aparece`):
  triadas, sem root cause investigado nesta rodada — ficam pra próxima.
