---
id: FIX-284
titulo: "gate:credit pergunta o valor do bem do ZERO mesmo quando o desire já trouxe um valor aproximado — efeito colateral do FIX-279"
status: todo
severidade: media
projeto: aja-agora
bloco: bloco-r9-2-gate-refino
arquivos:
  - src/lib/agent/orchestrator/analyze.ts
  - src/lib/agent/orchestrator/gate-questions.ts
  - src/lib/agent/personas.ts
  - src/lib/agent/orchestrator/analyze.test.ts
  - src/lib/agent/orchestrator/gate-questions.fix-284-confirma-desire.test.ts
rodada: "2026-07-12 loop r9 ONDA 2 (pós-onda-1 Sonnet 4/10, gap G-F)"
---
## Palavras do juiz (veredito r9pos, Sonnet 5 — G-F, UX 4/10)
> "em TODOS os 5 dossiês o valor do bem já é mencionado de forma aproximada no turno do `desire`
> ('uns 250 mil', 'uns 70 mil', 'uns 150 mil') e o `gate:credit` pede o mesmo dado de novo 2
> turnos depois — viola 'sem pedir dado já dado' [...] efeito colateral do FIX-279 (que fez o
> gate disparar)."
> — `.processo/loop/evidencias-r9/veredito-r9pos-sonnet.md` §1 (dimensão UX) + §3, G-F

## Cenário exato
- **Rota/tela:** chat web, gate `desire` (turno 4) → `gate:identify` → `gate:credit` (turno 6).
- **Passos (mario-sem-lance):** turno 4 usuário diz "Um carro, uns 70 mil" → turno 6 (pós-CPF) o
  agente pergunta do zero "Qual valor do bem faz mais sentido pra você?" → turno 7 usuário repete
  "R$ 70.000".
- **Dados usados:** 5/5 dossiês do baseline pós-onda-1 (madalena "uns 250 mil", mario "uns 70
  mil", probe-i1 "uns 80 mil", probe-i2 "exatamente 120 mil", probe-i3 "uns 150 mil") —
  `.processo/loop/evidencias-r9/dossies-r9pos/*/dossie.json`.

## Esperado × Atual
- **Esperado:** quando o `desire` já trouxe um valor aproximado, o `gate:credit` CONFIRMA esse
  valor ("uns 70 mil, certo? pode ajustar se quiser") em vez de perguntar do zero.
- **Atual:** `gateQuestion("credit", ...)` sempre devolve a MESMA string estática, sem contexto
  do que já foi dito.

## Root cause (INVESTIGADO — provado no código)
`src/lib/agent/orchestrator/gate-questions.ts:74-76`:
```ts
case "credit":
    // FIX-2: "valor do bem" (linguagem do docx), não "faixa de crédito".
    return "Qual valor do bem faz mais sentido pra você?";
```
String estática, SEM acesso a `meta`/`qualifyAnswers` — não tem como confirmar nada mesmo se o
dado estivesse disponível.

E o dado NÃO está disponível hoje, por desenho CORRETO de outro fix que não pode regredir:
`src/lib/agent/orchestrator/analyze.ts:94-106,103-106` (FIX-279, guard `activeGateAtTurnStart`)
só grava `q.creditMax` quando o gate `credit` é o REALMENTE ativo no turno
(`activeGateAtTurnStart === "credit"`). No turno do `desire` ("Um carro, uns 70 mil"), o gate
ativo é `desire`/`identify` — NÃO `credit` — então o valor mencionado é DESCARTADO
propositalmente (é o que fez a agulha do FIX-279 voltar a disparar; reverter isso REGRIDE o G3 do
baseline, já morto). Resultado: o valor informal do `desire` nunca fica gravado em NENHUM campo —
nem em `q.creditMax` (correto, por design) nem em qualquer outro lugar (o gap real) — então
quando o `gate:credit` liga, 2 turnos depois, não há nada pra confirmar.

## Correção proposta (o quê × onde)
| O quê | Onde |
|---|---|
| Capturar o valor mencionado no `desire` num campo NOVO e NÃO-BLOQUEANTE, `q.creditMentionedAtDesire?: number` (mesmo padrão oportunista de `desiredItem`/`motivation`, `analyze.ts:161-170` — sem gating por `activeGateAtTurnStart`, já que este campo NUNCA substitui a agulha formal, só serve pra CONFIRMAR depois) | `analyze.ts` (novo bloco de merge, ao lado do de `desiredItem`) |
| Novo campo no tipo `QualifyAnswers` | `personas.ts` |
| `gateQuestion("credit", ...)` passa a aceitar um parâmetro opcional (valor mencionado) e, quando presente, devolve copy de CONFIRMAÇÃO ("Uns {valor} então, é isso? Pode ajustar se quiser.") em vez da pergunta em branco; sem o valor, mantém o texto atual (fallback, D11) | `gate-questions.ts` (assinatura de `gateQuestion`, caso `"credit"`) |
| Atualizar os call-sites de `gateQuestion("credit", ...)` (`whatsapp/adapter.ts:108`, `gate-reengage.ts:108`, o caminho web equivalente) pra passar `meta.qualifyAnswers?.creditMentionedAtDesire` | verificar `whatsapp/adapter.ts`, `gate-reengage.ts`, adapter web (grep `gateQuestion(` antes de mexer) |

## Regressão exigida
- `analyze.test.ts`: novo caso — mensagem de `desire` tipo "Um carro, uns 70 mil" popula
  `q.creditMentionedAtDesire = 70000` MAS **NÃO** popula `q.creditMax` (a agulha do FIX-279 tem
  que continuar disparando — teste de não-regressão explícito do G3 morto).
- Novo `gate-questions.fix-284-confirma-desire.test.ts` (mesmo padrão de
  `gate-questions.fix-268-reserva.test.ts`): `gateQuestion("credit", category, undefined, channel,
  <valor mencionado>)` devolve texto de CONFIRMAÇÃO citando o valor; sem valor mencionado,
  devolve o texto antigo (não quebra os testes existentes). TDD strict: falha hoje (parâmetro
  não existe), passa depois.
- Rodar `pnpm test:unit` completo — confirmar que o `gate:credit` continua disparando 5/5 (não
  reintroduzir o G3 do baseline).
