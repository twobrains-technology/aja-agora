---
id: FIX-91
titulo: "Eval da jornada com GATE_SEQUENCE pré-FIX-53 (identify no fim) — reordenar + ajustar harness"
status: todo
bloco: bloco-c-infra-teste
arquivos:
  - tests/eval/jornada-aja-agora.eval.test.ts
rodada: 2026-06-28 — mutirão inbox (qa-noturno 21/06 + infra 24-26/06 + jornada 28/06)
---

# Bug (Camada 3) — Eval da jornada percorre gates na ordem PRÉ-FIX-53 (identify no fim)

- **Data:** 2026-06-21 (achado no QA noturno da jornada v2, rodada 2)
- **Severidade:** baixa-média (Camada 3 nightly, não-bloqueante; ordem real já coberta na Camada 1).
- **Origem:** FIX-53 (jornada2_revisão.docx, Bernardo) — "dados antes do valor": gate `identify` subiu para logo após `consent`, antes de `credit`.

## Achado
`tests/eval/jornada-aja-agora.eval.test.ts:522` define `GATE_SEQUENCE` na ordem **antiga**:
```
experience, consent, credit, timeframe, lance, lance-value, lance-embutido, identify
```
`identify` aparece por ÚLTIMO. Mas o `nextGate` real pós-FIX-53 produz:
```
experience, consent, identify, credit, timeframe, lance, lance-value, lance-embutido, ...
```
(`src/lib/agent/qualify-state.ts:52` — `if (!meta.identityCollected) return "identify"` antes de `credit`).

O comentário do eval (linha 23, 376) modela `identify` como disparado por **tripwire D1 em pipeSearchSummaryTurn no fim** — o fluxo PRÉ-FIX-53. No fluxo real v2, identidade é coletada CEDO (gate), e a tripwire só é rede de segurança.

## Impacto
O eval nightly valida tom/didática de uma jornada com `identify` no fim — divergente do que o usuário real vê (identify cedo). Não quebra a validação da ordem (essa é Camada 1, correta em `qualify-state.*.test.ts`), mas reduz a fidelidade do eval ao docx v2.

## Por que NÃO foi corrigido inline (vira bloco)
Não é mover uma linha: o harness (`respondToGate`, directives, premissa da tripwire) foi construído em torno de identify-no-fim. Corrigir certo = reordenar `GATE_SEQUENCE` + reescrever o harness pra disparar `identify` como gate cedo (não via tripwire) + **validar rodando o eval LLM real completo** (caro/lento). >15min, fora do fix trivial. Camada 3 nightly não-bloqueante.

## Tratamento sugerido (bloco dedicado)
1. Reordenar `GATE_SEQUENCE` (identify após consent).
2. Ajustar `respondToGate`/directives pra identify-cedo; remover a premissa de tripwire-no-fim do harness (manter a tripwire como rede de segurança no produto).
3. Atualizar o diagrama do comentário (linha 23).
4. Rodar `pnpm test:eval` (jornada-aja-agora) e ver verde.
