---
id: FIX-309
titulo: "topic_picker vira emissão server-side determinística (não depende do LLM chamar a tool)"
status: done
bloco: bloco-r10-4-topic-picker-serverside
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/tools/ai-sdk.ts, src/lib/agent/orchestrator/artifact-guard.ts, src/lib/agent/orchestrator/index.ts, src/lib/agent/orchestrator/server-cards.ts, src/lib/agent/orchestrator/tool-policy.ts, src/lib/agent/personas.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-topic-picker-serverside — investigação de causa-raiz da Etapa A)
commit: "cba33cf3 (test+fix: emite topic_picker server-side), e19ebf23 (refactor: remove present_topic_picker do toolset do LLM) — branch fix/r10-4-topic-picker-serverside"
executado_em: "2026-07-13"
---
## Palavras do operador
> Investigação de causa-raiz: `topic_picker` (menu de dúvidas pós-experience) tem **0 emissões**
> em ambos os dossiês limpos (Madalena e Mario), apesar do fluxo passar pelo ponto onde ele
> deveria aparecer — mesmo padrão-raiz do card do hero original antes da correção (Lei 1 da
> arquitetura de agentes: invariante crítico tem que ser código, não prompt).

## Cenário exato
- **Rota/tela:** pós-`experience`, ponto do funil onde o menu de tópicos de dúvida deveria ser
  oferecido antes de prosseguir pra reco-consent.
- **Dados usados:** `madalena-junta-v2/dossie.json` + `mario-sem-lance-v2/dossie.json` — grep por
  `topic_picker` em ambos retorna zero ocorrências como artifact emitido.

## Esperado × Atual
- **Esperado:** `topic_picker` aparece de forma confiável e determinística no ponto certo do
  funil, sempre — igual a qualquer outro card estruturado da cascata (gate cards, hero, etc.).
- **Atual:** `topic_picker` só é emitido se o LLM decidir chamar a tool `present_topic_picker`
  (`ai-sdk.ts:766`) espontaneamente — dependente do modelo "lembrar" de chamar a tool no turno
  certo. Sob modelo fraco (ou mesmo sob Sonnet, conforme os dois dossiês mostram), isso
  simplesmente não acontece. `artifact-guard.ts:255-261` só FILTRA chamadas da tool fora de fase —
  não GARANTE que ela seja chamada dentro da fase.

## Root cause (INVESTIGADO)
- `ai-sdk.ts:766`: `topic_picker` é uma tool LLM-driven (`present_topic_picker`), não uma emissão
  server-side (`emitServerCard`) — mesma classe de bug que a Lei 1 da arquitetura já cataloga
  ("invariante crítico vira código, não regra-no-prompt").
- `artifact-guard.ts:255-261`: papel é só de allowlist/filtro (bloqueia fora de fase), não de
  garantia positiva de emissão.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Migrar `topic_picker` de tool LLM-driven pra emissão server-side determinística via `emitServerCard`, disparada pelo controller no ponto certo da cascata (mesmo padrão dos outros gate cards) | `orchestrator/index.ts` (ponto pós-`experience`) |
| Remover (ou manter só como fallback documentado, nunca como caminho primário) a tool `present_topic_picker` do LLM | `ai-sdk.ts:766`, `artifact-guard.ts:255-261` |

## Regressão exigida
- Teste de integração: cassette avançando até pós-`experience` → `topic_picker` aparece SEMPRE
  como artifact, independente do texto/decisão do LLM no turno.
- Teste que a fase permanece correta (não emite `topic_picker` fora do ponto certo do funil).

## Resultado (executado)
- `personas.ts`: nova flag `topicPickerDispatched` (idempotência, mesmo padrão de
  `recoConsentDispatched`/`simulatorOfferDispatched`).
- `orchestrator/server-cards.ts`: `buildTopicPickerCard()` — payload estático com o catálogo
  canônico inteiro (`topic-catalog.ts`: lance/sorteio/contemplação/cartas variam), mesmo padrão de
  `buildDecisionPromptCard`/`buildWhatsappOptinCard`.
- `orchestrator/index.ts`: novo bloco em `runTurn`, logo após `if (result.isConcierge)`, que emite
  `topic_picker` via `emitServerCard` quando `experiencePrev === "doubts"` (usuário clicou "Tenho
  dúvidas" no gate `experience`) e `recoConsentDispatched !== true` (não regride a fase numa
  conversa que já avançou), guardado por `topicPickerDispatched`.
- `orchestrator/tool-policy.ts`: `present_topic_picker` SAIU do toolset do LLM em TODA fase (antes
  só saía de closing/terminal, FIX-300) — mesmo precedente do FIX-246/253/280. A definição da tool
  em `ai-sdk.ts` e a 2ª linha de defesa em `artifact-guard.ts` (`topic-picker-server-gate`) ficam
  como estão — documentadas, porém inalcançáveis (mesmo padrão das outras tools já migradas).
- Testes: `index.fix-309-topic-picker-serverside.integration.test.ts` (5 casos: emite sempre,
  idempotência, não regride fase pra `first`/`returning`, não reabre pós-`reco-consent`) +
  `tool-policy.test.ts` atualizado pra ausência total. Suíte de regressão dos outros
  `emitServerCard` (FIX-246/253/280/303) + schema/builder do topic_picker rodada e verde (173
  testes, 14 arquivos). `pnpm test:unit` completo (368 arquivos/3403 testes) e Camada 3 (eval real)
  verdes nos 2 commits.
