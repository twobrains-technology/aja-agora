---
id: FIX-29
titulo: "Botão 'Ajustar valor' dispara o fluxo de FECHAMENTO ('vou reservar essa opção... te conectar com nosso consultor' + lead form) — todas as actions do card mandam kind 'interest'"
status: todo
bloco: bloco-p-acoes-e-lance-do-card
arquivos:
  - src/components/chat/artifacts/simulation-result.tsx (handleAction ignora intent)
  - src/app/api/chat/route.ts (handler kind "interest" + handler novo "adjust-value")
  - src/lib/agent/orchestrator/directives.ts (directive do turno de ajuste)
  - src/lib/chat/types.ts (kinds de action tipados por intent)
rodada: 2026-06-11 (testes manuais do Kairo no dev, pós-deploy da auditoria do dial)
anotado_em: 2026-06-11
---

# FIX-29 — "Ajustar valor" tratado como "Tenho interesse" (fechamento indevido)

### Palavras do operador

> "eh muita alucinacao, eu nao estou entendendo de verdade."

### Cenário exato (prints, dev 2026-06-11)

Detalhamento da ÂNCORA na tela (card de simulação com botões "Tenho interesse"
e "Ajustar valor") → usuário clicou **"Ajustar valor"** → resposta:
"Show, vou reservar essa opção pra você. Só preciso de uns dados rápidos pra
te conectar com nosso consultor:" + **lead form** ("Seus dados" —
Nome/WhatsApp/Email). O oposto da intenção: ele queria MUDAR o valor, o
sistema iniciou a reserva.

### Root cause INVESTIGADO (provado — NÃO é alucinação do LLM)

A resposta é 100% DETERMINÍSTICA do backend:

- `src/components/chat/artifacts/simulation-result.tsx:45-51` — `handleAction`
  envia `kind: "interest"` pra **TODA** action do card, ignorando o
  `action.intent` que a tool definiu (`adjust_value`, `new_simulation`,
  `compare_other` — cf. `ai-sdk.ts:109`). O botão "Ajustar valor" manda o
  MESMO kind do "Tenho interesse".
- `src/app/api/chat/route.ts:401-417` — handler de `kind === "interest"`
  responde com copy fixa ("Show, vou reservar essa opção pra você. Só preciso
  de uns dados rápidos pra te conectar com nosso consultor:") e emite o
  artifact `lead_form`. Reproduzível em 100% dos cliques.

Agravantes:

1. A copy fixa fala **"te conectar com nosso consultor"** — contradiz a
   jornada canônica (core value: fechar SEM corretor/redirect). Revisar a
   frase junto com o fix.
2. O lead form re-coleta nome/WhatsApp que o sistema já tem (conecta com
   FIX-27 — prefill existe pro nome, mas o form nem deveria reaparecer se já
   preenchido).

### Correção proposta

| O quê | Onde |
|---|---|
| `handleAction` envia kind derivado do `intent` da action (`adjust_value` → kind `"adjust-value"`; manter `"interest"` SÓ pro botão Tenho interesse) — tipar fim-a-fim | `simulation-result.tsx` + `types.ts` |
| Handler novo `kind === "adjust-value"`: NÃO abre lead form; injeta directive pro agente reabrir o ajuste (what-if: perguntar o novo valor em UMA frase OU reabrir o value picker), reusando o padrão das directives existentes | `route.ts` + `directives.ts` |
| Copy do handler "interest" sem "consultor" (jornada: fecha direto na plataforma) | `route.ts` |
| Auditar os DEMAIS artifacts com actions (recommendation-card etc.) — mesmo padrão de kind único? Corrigir junto | `recommendation-card.tsx` e afins |

### Regressão exigida (3 camadas)

- Camada 1: component test — clique em "Ajustar valor" envia kind
  `"adjust-value"` (não `"interest"`); route test — kind novo não emite
  lead_form; copy do interest sem "consultor".
- Camada 2: cassette — turno pós-"adjust-value": agente pergunta novo valor /
  reabre picker, NÃO chama present_lead_form.
- Camada 3: cenário de eval — clique "Ajustar valor" no detalhamento → ajuste
  acontece e fechamento NÃO inicia.
