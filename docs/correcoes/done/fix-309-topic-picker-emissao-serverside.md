---
id: FIX-309
titulo: "topic_picker vira emissão server-side determinística (não depende do LLM chamar a tool)"
status: todo
bloco: bloco-r10-4-topic-picker-serverside
severidade: alta
projeto: aja-agora
arquivos: [src/lib/agent/ai-sdk.ts, src/lib/agent/orchestrator/artifact-guard.ts, src/lib/agent/orchestrator/index.ts]
rodada: 2026-07-13 (loop-de-goal r10, onda 4, bloco r10-4-topic-picker-serverside — investigação de causa-raiz da Etapa A)
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
