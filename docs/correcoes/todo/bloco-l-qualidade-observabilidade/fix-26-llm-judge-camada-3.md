---
id: FIX-26
titulo: "LLM-as-judge na Camada 3 — critérios qualitativos da jornada validados por judge, não só asserts estruturais"
status: todo
bloco: bloco-l-qualidade-observabilidade
arquivos:
  - tests/eval/agent-flow.eval.test.ts
  - tests/eval/judge.ts (novo — helper de julgamento com rubrica)
rodada: 2026-06-11 (agregação de pendências pós-merge da onda G/H/I)
---

# FIX-26 — Camada 3 ganha LLM-judge de verdade

## Palavras do operador

Pendência registrada na memória do projeto desde a sessão da jornada canônica:
"eval precisa LLM-judge". O CLAUDE.md da Camada 3 confirma o gap: "Asserts
comportamentais via critérios estruturais (...) — não LLM-judge ainda, mas
estrutura está pronta pra adicionar."

## Cenário exato

A Camada 3 (nightly) roda cenários por persona × canal com agent REAL, mas só
valida critérios estruturais (frases proibidas via regex, tools chamadas,
valores no DB). Qualidades que o docx exige e regex não pega ficam sem
validação: tom da persona, confronto honesto de viabilidade (tema do FIX-18),
explicação correta de lance embutido, ausência de meta-narrativa do mecanismo.
Drift qualitativo do modelo passa batido até virar reclamação de usuário.

## Root cause INVESTIGADO

Não é bug — é débito declarado (CLAUDE.md, seção Camada 3). A estrutura está
pronta: user-bot Haiku + agent Sonnet real já conversam; falta a etapa de
julgamento do transcript.

## Correção proposta

| O quê | Onde |
|---|---|
| Helper `judgeTranscript(transcript, rubrica)` — `generateObject` (modelo forte, ex. sonnet) com rubrica derivada DOS PASSOS DA JORNADA CANÔNICA (regra de produto: eval valida contra o docx, não contra a implementação) retornando score + violações por critério | `tests/eval/judge.ts` (novo) |
| Rubrica mínima v1: (1) não promete crédito imediato, (2) confronta inviabilidade de orçamento honestamente, (3) explica lance embutido sem jargão, (4) zero meta-narrativa de tools/cards, (5) tom da persona consistente | idem |
| Cenários existentes ganham o judge como assert adicional (threshold de aprovação); falha = relatório, não flake — judge com retry 1x pra reduzir variância | `agent-flow.eval.test.ts` |
| Continua SÓ nightly (custo de judge por cenário) — nada em PR | — |

## Regressão exigida

- **Camada 1**: teste unitário do helper com transcript sintético bom (passa) e
  ruim (reprova no critério certo) usando MockLanguageModelV2.
- **Camada 2**: não aplicável (infra de teste, não comportamento do agent).
- **Camada 3**: é o próprio item.
