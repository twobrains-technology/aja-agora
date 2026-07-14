---
id: FIX-350
titulo: "P1 — o fallback enlatado ainda dispara (1/8) e a evasão a administradora inexistente é inconsistente (3/8)"
status: todo
bloco: bloco-g-consent-wa-fallback
arquivos:
  - src/lib/agent/orchestrator/directives.ts
  - src/lib/agent/orchestrator/index.ts
  - src/lib/agent/orchestrator/system-context.ts
rodada: 2026-07-14 — loop-de-goal desamarra, rodada 4
---

# FIX-350 — o último resquício do fallback + evasão inconsistente

## a) Fallback enlatado (1/8, agora em `auto-whatsapp`)
O texto *"as opções que já apareceram aqui pra você continuam valendo…"* ainda aparece. Duas ondas
já atacaram isso (FIX-332, FIX-343) e a taxa caiu de 5/8 → 1/8, mas **não zerou**.

Onde: `directives.ts:452-459`, disparo em `index.ts:908-940` (branch `tool-error-recovered`).

**Prove qual tool ainda dá erro** (`docker logs | grep tool-policy-violation`) e feche o caminho:
erro de tool vira CONTEXTO pro modelo se corrigir no mesmo turno — nunca texto fixo do servidor.

## b) Evasão inconsistente à administradora inexistente (3/8)
Quando o usuário pede "simula a Bradesco" (que não existe nas ofertas), o agente às vezes lista as
reais (ótimo), às vezes **desconversa** ("Ou prefere ver todas lado a lado?") e às vezes **promete
e não cumpre**.

O guard (FIX-342/345) impede a MENTIRA — mas ninguém ensina o agente a **responder bem**. Isso é
CONVERSA, e conversa é do modelo: o servidor deve dar o FATO no contexto ("a Bradesco não está
entre as opções; as reais são X, Y, Z") e deixar o modelo redigir.

| O quê | Onde |
|---|---|
| Quando o usuário cita uma administradora que não está nas ofertas, injetar no contexto do turno: quais são as reais + que a pedida não existe | `system-context.ts` (mesmo padrão de `exactnessFacts`) |

## Regressão exigida
- Integração: pedir administradora inexistente → o agente responde citando as REAIS, sem inventar e
  sem desconversar.
- Integração: o texto de `buildToolErrorRecoveryFallback` não aparece em nenhuma jornada saudável.
