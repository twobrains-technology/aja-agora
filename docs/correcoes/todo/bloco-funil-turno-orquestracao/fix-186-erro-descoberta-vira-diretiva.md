---
id: FIX-186
titulo: "Erro de descoberta na Bevi (search_groups/recommend_groups/get_rates) vira narração crua + preâmbulos empilhados — deve virar diretiva determinística (retry + fallback humano)"
status: todo
severidade: alta
projeto: aja-agora
bloco: bloco-funil-turno-orquestracao
arquivos:
  - src/lib/agent/tools/ai-sdk.ts
  - src/lib/adapters/bevi/bevi-errors.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/index.ts
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-07-01 — refino do print "vazamento de processo + proposta fantasma" (Kairo)
evidencia:
  - _evidencia/agente-meta-narrativa-search-groups-falha-print.png
---

## Palavras do operador
> "vamos refinar esse problema e lançar uma correção com workspace e todo-blocks, mas
> muito bem refinado e corrigido" — (print do chat: agente responde uma bolha com
> "Deixa eu buscar as melhores opções na sua faixa: / Vou buscar as opções certas pra
> você: / Preciso primeiro buscar os grupos disponíveis. Um segundo: / Deixa eu usar a
> ferramenta certa pra isso: / Vou trazer as melhores opções pra você agora, Maria. Só
> um instante — tô com uma dificuldade técnica pontual pra acessar os grupos nessa faixa
> agora.")

## Cenário exato
- **Rota/tela:** chat (web e WhatsApp — mesmo `streamText`/orchestrator).
- **Passos:** usuário responde o gate de lance (ex.: "Não, prefiro sem lance embutido")
  → o turno tenta buscar as opções reais na faixa → a chamada de descoberta na Bevi
  falha → o agente **narra o erro** ("dificuldade técnica pontual") junto de **vários
  preâmbulos** de "vou buscar" na mesma bolha.
- **Dado:** print da conversa (versão "Maria" e a versão do card de proposta do Kairo).

## Esperado × Atual
- **Esperado:** quando a descoberta falha, o sistema **não** deixa o erro virar texto do
  modelo. Ele (1) faz **1 retry silencioso**; se ainda falhar, (2) emite uma **mensagem
  amigável determinística** + ação acionável ("Tentar de novo" / "Falar com especialista
  da Aja") — **nunca** um erro técnico cru, **nunca** uma proposta em cima de dado que não
  carregou (isto último é o FIX-187).
- **Atual:** o erro é **re-lançado** pela tool → vira tool-error que volta pro modelo → o
  modelo **narra** o erro ("tive um problema" / "dificuldade técnica pontual"). Como o
  turno é multi-step, cada tentativa gera um preâmbulo ("deixa eu buscar…") e tudo empilha
  numa bolha só.

## Root cause INVESTIGADO (provado no código)
- `search_groups` / `recommend_groups` / `get_rates` chamam `runDiscovery(...)`
  (`src/lib/agent/tools/ai-sdk.ts:1075-1079`); em erro do adapter Bevi, `runDiscovery`
  **loga e re-lança** (`ai-sdk.ts:1052-1068`) — não converte em diretiva.
- `simulate_quota` / `get_group_details` só convertem `GroupNotInDiscoveryError` em
  diretiva acionável (`ai-sdk.ts:391-396,419-422`); **qualquer outro erro é re-lançado**
  (`throw err`).
- Um `throw` numa tool do Vercel AI SDK vira **tool-error** que retorna ao modelo, e o
  modelo o **narra**. Não há `experimental_repairToolCall`/`onError` no agent — o ADR
  `docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md:86-103` decidiu
  **não** adotar `repairToolCall`. Logo o único caminho hoje é o modelo narrar.
- Existe precedente do padrão certo: o **FIX-72** já converte um erro de tool em
  **diretiva** (re-busca) em vez de deixar narrar — `src/lib/agent/tools/ai-sdk.fix-72.test.ts`.
  Este fix generaliza esse padrão para o erro de **descoberta** (Trilho B / Bevi).
- ⚠️ **Não confundir com o inbox `2026-06-30-fechamento-erro-campo-vira-falha-administradora`**:
  aquele é no **fechamento** (Trilho A / `insert_proposal` / `route.ts`), erro de campo
  (CPF/CELULAR). Este é na **descoberta** (Trilho B / `search_groups`). Bug irmão, outro
  ponto do fluxo — fora do escopo deste card (fica no inbox).

## Correção proposta
| O quê | Onde |
|-------|------|
| `runDiscovery` para de re-lançar erro de descoberta: tipa o erro (transitório × duro) e retorna uma **diretiva** estruturada (não texto) | `src/lib/agent/tools/ai-sdk.ts` (`runDiscovery` ~1052) |
| Tipar o erro de descoberta na camada de adapter (transitório/rede vs 4xx/duro) pra decidir retry | `src/lib/adapters/bevi/bevi-errors.ts` |
| **1 retry silencioso** determinístico na falha transitória (não o modelo "tentando de novo" em texto) | `src/lib/agent/orchestrator/index.ts` / `directives.ts` |
| Falhou o retry → diretiva `discovery-failed` que o orchestrator materializa em **mensagem amigável fixa + ações** ("Tentar de novo" / "Falar com especialista da Aja"), no padrão determinístico do `runTurn` recursivo com directive (mesmo mecanismo de `search`/`decision`) | `src/lib/agent/orchestrator/directives.ts`, `orchestrator/index.ts` |
| Expor um sinal de turno `discoveryFailedThisTurn` (metadata) pro FIX-187 bloquear proposta | `src/lib/agent/orchestrator/index.ts` |
| **Copy PT-BR correta** na mensagem de falha (acentos/cedilha) — nunca ASCII-fication | (a mensagem determinística) |

## Regressão exigida (3 camadas — CLAUDE.md §"Regressão de agent")
- **Camada 1 (structural):** assert que `runDiscovery` não re-lança erro de descoberta
  (retorna diretiva); que a diretiva `discovery-failed` produz a mensagem/ações fixas;
  que o metadata `discoveryFailedThisTurn` é setado. `src/lib/agent/tools/ai-sdk.*.test.ts`.
- **Camada 2 (cassette OBRIGATÓRIO):** novo `describe` em `tests/regression/agent-trajectory.test.ts`
  reproduzindo o turno em que a descoberta falha — o detector reprova qualquer narração de
  erro técnico ("problema"/"dificuldade técnica"/"instabilidade") e qualquer empilhamento de
  preâmbulos "vou buscar"; exige a mensagem determinística + ações.
- **Camada 3 (eval nightly):** cenário em `tests/eval/agent-flow.eval.test.ts` — persona
  chega na descoberta com Bevi forçada a falhar (cassette da Bevi) e o agente entrega
  fallback humano, nunca erro cru nem proposta.
