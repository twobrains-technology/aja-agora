---
id: FIX-67
titulo: "Agente copiloto + injeção do PDF da administradora + cassette"
status: todo
bloco: bloco-mesa-c-copiloto
arquivos:
  - src/lib/agent/mesa-copilot/
  - tests/regression/agent-trajectory.test.ts
rodada: 2026-06-21 feature mesa de operação (Kairo, autônomo)
---
# FIX-67 — Agente copiloto com PDF injetado

**Spec:** `docs/visao/mesa-de-operacao.md` §5 + DEC-C (full-text + prompt caching, não RAG).

## O quê × onde
- `src/lib/agent/mesa-copilot/`: builder do system prompt + streamText (Vercel AI SDK 6). Injeta o
  `administradora_docs.texto_extraido` da administradora do handoff (full-text, cache no bloco
  estável) + dados da cota + cliente mínimo. Persona: orienta o ATENDENTE a fazer o contrato.
- Segue o padrão de `src/lib/agent/` (NÃO usar @anthropic-ai/sdk direto).

## Regressão (Camada 2 OBRIGATÓRIA — é agente)
- Cassette nova em `tests/regression/agent-trajectory.test.ts` (describe novo, append-only) com
  `MockLanguageModelV2`: (1) builder injeta o texto do PDF da administradora certa; (2) número de
  atendente de mesa → copiloto (não vendas); (3) sem meta-narrativa/stack trace.
- Camada 1: assert estrutural do builder injetando o texto.
