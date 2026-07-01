---
id: FIX-113
titulo: "Agente trava em afirmação de continuidade — gate avança sem emissão visível e o guard não pega"
status: todo
bloco: bloco-funil-turno-orquestracao
arquivos:
  - src/lib/chat/empty-turn-guard.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/orchestrator/runner.ts
  - src/lib/agent/orchestrator/navigation.ts
rodada: 2026-06-30 — teste do Kairo em PROD (AWS prod, pós-release)
evidencia:
  - _evidencia/agente-trava-apos-valor-print.png
---

## Palavras do operador
> "o agente ta morrendo no meio da jornada, tendo que enviar uma mensagem pra ele."
> "o agent trava e nao responde, parece que nos casos de perguntas afirmativas. ou
> afirmacoes que tem uma continuidade."

## Cenário (PROD)
Afirmações curtas de continuidade — **"ta bom", "blz", "bora continuar", "bora"** —
travam o agente: ele não responde, a tela congela, e só destrava quando o usuário
manda OUTRA mensagem. Ex.: após "Beleza, R$ 50.000 então." → user "blz" → trava.

## Root cause INVESTIGADO (provado no código)
O guard do FIX-110 (`empty-turn-guard.ts:29`) só dispara o fallback quando o turno é
100% vazio **E** `!gate && !transitionedTo`:
```js
return textChars===0 && toolCount===0 && artifactCount===0
    && !gate && !handoff && !transitionedTo;
```
**O furo:** numa afirmação de continuidade, o funil **avança um gate internamente**
(seta `gate`/`transitionedTo` no trace) **sem emitir nada visível** (0 texto/tool/
artifact). Como `gate` está setado → `isTurnEmpty` retorna **false** → o fallback do
route (`route.ts:1109`) NÃO dispara → e como nada visível saiu, a tela **congela**.
`gate`/`transitionedTo` são estado INTERNO, não resposta visível ao usuário.

## Correção proposta
| O quê | Onde |
|---|---|
| `isTurnEmpty` = SEM emissão VISÍVEL (`textChars===0 && toolCount===0 && artifactCount===0`), **ignorando** `gate`/`transitionedTo` (são internos). Turno sem nada visível pro user = vazio → fallback OU emissão do prompt/componente do gate | `empty-turn-guard.ts` |
| Garantir que, ao avançar um gate no user-turn, o sistema SEMPRE emita a UI/pergunta do gate (senão o gate fica setado e mudo) | `route.ts` / `navigation.ts` / `runner.ts` |

⚠️ Cuidado: se um gate legítimo JÁ emite artifact (contado em `artifactCount`), o
turno não é vazio — o fix não pode disparar fallback nesses. O alvo é só o gate que
avança SEM emitir nada visível.

## Regressão exigida (3 camadas — comportamento de agente)
- **Camada 1 (structural):** `empty-turn-guard.test.ts` — `isTurnEmpty({textChars:0,
  toolCount:0, artifactCount:0, gate:"value", transitionedTo:null})` deve ser **true**
  (hoje é false). Ver o teste FALHAR antes do fix.
- **Camada 2 (cassette):** `tests/regression/agent-trajectory.test.ts` — user manda
  "ta bom"/"blz" numa continuidade → o turno NÃO fecha mudo (fallback OU próxima
  emissão visível). Determinístico.
