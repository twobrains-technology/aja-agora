---
id: FIX-27
titulo: "Valor de carta extraído por texto livre não tem guardrail server-side — fora da faixa da categoria passa direto"
status: todo
bloco: bloco-n-funil-canonico
arquivos:
  - src/lib/agent/orchestrator/analyze.ts (clamp no merge do creditMax/creditMin)
  - src/lib/agent/qualify-config.ts (CREDIT_CONFIG é a fonte das faixas)
  - src/lib/agent/orchestrator/analyze.test.ts (Camada 1)
rodada: 2026-06-12 (teste manual do Kairo no dev — pergunta sobre guardrails de carta)
anotado_em: 2026-06-12
---

# FIX-27 — Clamp server-side do valor de carta na faixa da categoria

## Palavras do operador

> "busque ai se tem guardrails de valor de carta para turn[o]"

## Cenário exato

Auditoria 2026-06-12: o valor de carta tem guardrail na UI (sliders do picker
limitados por `CREDIT_CONFIG`: auto 20k–300k, imóvel 100k–2mi, moto 8k–80k,
serviços 10k–500k) e na Bevi (reativo, `MinCreditError` em 400 — piso R$ 15k
do piloto). Mas o caminho de TEXTO LIVRE não tem nada: "quero uma carta de 5
milhões de auto" ou "carta de R$ 500" passam pelo funil até morrer na Bevi
(ou retornar oferta absurda).

## Root cause INVESTIGADO (provado no código)

`analyze.ts:67-69`: o merge do analyzer grava `q.creditMax = analysis.creditMax`
e deriva `q.creditMin = creditMax * 0.9` **sem validação nenhuma** contra a
faixa da categoria. O schema das tools (`schemas.ts:13-19`) só exige
`positive()`. As faixas existem em `CREDIT_CONFIG` (`qualify-config.ts:39-42`)
mas só o componente de UI as usa.

## Correção proposta

| O quê | Onde |
|---|---|
| Função pura `clampCreditToCategory(credit, category)` usando `CREDIT_CONFIG` — clampa min/max e retorna flag `clamped` + faixa | `analyze.ts` (ou util em `qualify-config.ts`) |
| No merge do analyzer: aplicar o clamp; quando clampar, registrar no meta um hint pro agente confrontar na conversa ("pra auto a faixa vai até R$ 300 mil — quer ver as opções nesse teto, ou seria um imóvel?") — mesmo espírito do FIX-18, uma camada antes | `analyze.ts:67-69` |
| `creditMin` derivado (0.9×) herda o clamp | idem |

## Regressão exigida (3 camadas)

- **Camada 1**: matriz por categoria — valor acima do teto clampa no teto,
  abaixo do piso clampa no piso, dentro da faixa passa intacto; flag `clamped`
  correta; derivação 0.9× respeitando a faixa.
- **Camada 2**: cassette — turno com "carta de 5 milhões de auto" → qualify
  persiste teto da categoria (300k) e o texto do agente confronta a faixa
  (sem celebrar valor impossível).
- **Camada 3**: cenário de eval com valor fora da faixa por texto livre.
