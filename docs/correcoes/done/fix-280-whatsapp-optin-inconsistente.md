---
id: FIX-280
titulo: "whatsapp_optin dispara no meio do funil em mario-sem-lance mas não em madalena no mesmo ponto (LLM-discricionário, não determinístico)"
status: done
severidade: media
projeto: aja-agora
bloco: bloco-r9-gate-funil
arquivos:
  - src/lib/agent/orchestrator/whatsapp-optin-guard.ts
  - src/lib/agent/orchestrator/tool-policy.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/server-cards.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/agents/builder.ts
rodada: "2026-07-12 loop r9 onda 1 (baseline Sonnet 3/10)"
commit: 18ead19
executado_em: "2026-07-12"
decisao: docs/decisoes/blocos/2026-07-12-bloco-r9-gate-funil.md
---
## Palavras do juiz (veredito r9, Sonnet 5 — G4, Funcional 5/10)
> "1 gate não-canônico (`whatsapp_optin`) injetado no meio do funil em mario-sem-lance turno 7,
> ausente em madalena no mesmo ponto (inconsistente entre os 2 fluxos)."
>
> "mario-sem-lance turno 7 responde com `present_whatsapp_optin`/`whatsapp_optin` em vez de
> `gate:experience` — atrasa o funil em 1 turno (*'Pra não perder esse atendimento se cair a
> internet ou você precisar sair, me passa seu WhatsApp?'*). Madalena, no mesmo ponto do
> fluxo, vai direto para `gate:experience` sem esse desvio. Não é um beco-sem-saída (o funil
> retoma normalmente no turno seguinte), mas é uma inconsistência de comportamento entre 2
> cenários idênticos em estrutura."

## Cenário exato
- **Rota/tela:** chat web, logo após o reveal (recommendation_card + simulation_result),
  antes do gate `experience`.
- **mario-sem-lance turno 7:** agente chama `present_whatsapp_optin` em vez de seguir pro gate
  `experience` esperado — atrasa o funil em 1 turno.
- **madalena, no mesmo ponto estrutural** (pós-reveal, pré-`experience`): vai direto pro gate
  `experience`, sem o desvio do WhatsApp.

## Esperado × Atual
- **Esperado** (spec r9 ONDA 1 / ordem canônica do funil pós-reveal): `...search → experience
  → timeframe → lance...` sem gate extra no meio; comportamento CONSISTENTE entre conversas
  estruturalmente equivalentes.
- **Atual:** diverge entre os 2 fluxos P0 no mesmo ponto do funil.

## Root cause (INVESTIGADO — provado no código)
`whatsapp-optin-guard.ts:17-23` (`shouldEmitWhatsappOptin`) só controla se a tool
`present_whatsapp_optin` fica **disponível** no toolset (`tool-policy.ts:175` na fase
`reveal`, `:192` na fase `closing`) — é puramente uma função de `meta` (`revealCompleted`,
`contractRetryPending`, `whatsappOptinShown`), **idêntica** para os dois fluxos, sem nenhum
branch dependente de canal/persona/estado presente só num deles. A decisão de **chamar** a
tool naquele turno específico continua 100% a critério do LLM.

Isso contrasta com a família de cards vizinha do mesmo estágio do funil
(`embedded_bid`/`two_paths`/`scarcity`/`present_decision_prompt`), que foi migrada pra
emissão **server-side determinística** exatamente por causa desse tipo de inconsistência —
comentário em `tool-policy.ts:169-173` (FIX-246): *"embedded_bid/two_paths/scarcity SAÍRAM do
toolset do LLM em qualquer fase... 0 emissões ao vivo mesmo com directive instruindo a
tool-call (invariante no prompt, não em código, Lei 1/2/4)... emissão agora é SERVER-SIDE
determinística... o LLM nunca mais precisa (nem pode) chamá-las"* — e FIX-253 fez o mesmo pra
`present_decision_prompt` (`tool-policy.ts:156-163`). `present_whatsapp_optin` **nunca recebeu
a mesma migração** — segue como tool exposta que o LLM decide se/quando chamar, orientada só
por uma seção dinâmica de PROMPT (`system-prompt.ts`, `whatsappOptinSection`, stages "open"
`:898-909` e "confirm" `:913-916`) — ambas instruem "EM SEGUIDA chame present_whatsapp_optin"
no MESMO turno em que a seção aparece pela 1ª vez, mas isso é regra-no-prompt (Lei 4:
invariante crítico deveria virar código), não uma emissão forçada.

Como o toolset habilitado é idêntico para os dois fluxos (nenhuma condição de código
distingue mario de madalena — não depende de persona, canal, nem de campo presente só num
deles), a divergência observada é **comportamental do LLM** sobre um mesmo estado de sistema,
não um erro de condicional. Não há, no código lido, nenhum branch que explique por que um
fluxo chama e o outro não — a causa é a ausência de determinismo (a mesma classe de bug que
FIX-246/253 já eliminaram para os cards vizinhos).

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| **RECOMENDADO:** migrar `present_whatsapp_optin` pra emissão SERVER-SIDE determinística (mesmo padrão do FIX-246/253) — o orchestrator emite o artifact diretamente no primeiro turno em que `shouldEmitWhatsappOptin(meta)` vira `true`, sem depender do LLM decidir chamar a tool | `orchestrator/index.ts` (novo branch espelhando os demais cards server-side) + remover `present_whatsapp_optin` do toolset em `tool-policy.ts:175/192` |
| Alternativa (decisão de produto, não técnica): se o timing variável for aceitável/intencional (narrativa deve variar), documentar isso explicitamente em ADR — não tratar como bug | `docs/decisoes/blocos/` (sem mudança de código) |

## Regressão exigida
- Se optar pela migração server-side: teste de integração cobrindo 2 conversas com `meta`
  idêntico (`revealCompleted=true`, `whatsappOptinShown` ainda `false`, mesmo ponto do funil)
  → AMBAS emitem o artifact no mesmo turno relativo, deterministicamente (nunca depende de o
  LLM ter "decidido" chamar).
- Regressão anti-duplicação (PF-07, já existente em `whatsapp-optin-guard.ts`) continua verde:
  `whatsappOptinShown` garante emissão 1x só.
