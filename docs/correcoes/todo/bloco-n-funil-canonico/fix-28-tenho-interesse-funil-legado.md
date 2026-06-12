---
id: FIX-28
titulo: "'Tenho interesse' pós-reveal cai no funil de lead LEGADO (consultor humano) em vez do passo 5 (contract_form Bevi)"
status: todo
bloco: bloco-n-funil-canonico
arquivos:
  - src/lib/agent/system-prompt.ts (regras 'Feche' e 'Fechamento — captura final via present_lead_form')
  - src/lib/agent/orchestrator/tool-policy.ts (LEAD_CAPTURE nas fases reveal/closing)
  - src/lib/agent/system-prompt.lead-funnel.test.ts (Camada 1 — atualizar contrato)
  - tests/regression/agent-trajectory.test.ts (Camada 2 — cassette novo)
rodada: 2026-06-12 (teste manual do Kairo no dev — jornada Itaú real)
anotado_em: 2026-06-12
---

# FIX-28 — "Tenho interesse" deve abrir o passo 5, não capturar lead pra consultor

## Palavras do operador

> "faz sentido ele ter me passado para o turnover de atendente?"

## Cenário exato (prints da rodada)

Jornada completa no dev até o reveal (Itaú, R$ 200.226, parcela R$ 3.914/mês).
Kairo clica **"Tenho interesse"** no recommendation_card. O agente responde:
"Show, vou reservar essa opção pra você. Só preciso de uns dados rápidos pra
te conectar com nosso consultor:" → emite **present_lead_form** → card "Dados
recebidos! Em breve entraremos em contato."

Pela jornada canônica (docx, passo 5), o sinal de avanço pós-reveal leva a
decision → **contract_form** (fechamento self-service via Bevi). O produto
existe pra ELIMINAR o consultor do meio — o funil de lead aqui é regressão de
proposta de valor.

## Root cause INVESTIGADO (provado no código)

Duas camadas deixam o caminho legado vivo:

1. **`system-prompt.ts:20`** (regra "Feche", era pré-Bevi): _"Use
   present_lead_form (...) quando o usuario escrever sinal explicito de avanco
   ('tenho interesse', 'quero prosseguir', 'vamos fechar'). Seja natural: 'Vou
   reservar essa opcao pra voce. So preciso de uns dados rapidos.'"_ — o texto
   que o agente falou é LITERALMENTE o exemplo do prompt. Reforçado na seção
   `system-prompt.ts:177-183` ("Fechamento — captura final via present_lead_form").
2. **`tool-policy.ts:96-125`**: `LEAD_CAPTURE` (present_lead_form) está
   permitido nas fases **reveal** e **closing** — a 1ª linha de defesa (FIX-19)
   não barra porque a policy diz que a tool é legítima ali.

O "Tenho interesse" do card vira texto do usuário (`recommendation-card.tsx:68`),
o modelo segue a regra legada do prompt e a policy deixa passar.

## Correção proposta

| O quê | Onde |
|---|---|
| Reescrever a regra "Feche" e a seção de fechamento: sinal de avanço pós-reveal → avançar pra decisão/passo 5 (decision_prompt/contract_form). present_lead_form NUNCA por sinal de avanço — só em contexto de captura explícita (pós-optin WhatsApp aceito, pedido de contato humano, abandono declarado) | `system-prompt.ts` |
| Tool-policy: remover `present_lead_form` das fases reveal/closing (mantém em qualify, onde a captura de lead é legítima). Avaliar se `capture_lead`/`present_value_picker` acompanham | `tool-policy.ts` |
| Decisão de produto a validar na execução: o lead_form ainda tem papel pós-reveal? (ex.: usuário diz "prefiro falar com alguém") — se sim, o gatilho é PEDIDO DE HUMANO, nunca "tenho interesse" | — |

## Regressão exigida (3 camadas — bug de agent, cassette OBRIGATÓRIO)

- **Camada 1**: `system-prompt.lead-funnel.test.ts` — prompt NÃO contém
  instrução de lead_form por sinal de avanço; tool-policy: lead_form ausente
  nas fases reveal/closing.
- **Camada 2**: cassette reproduzindo o cenário do print — meta com
  revealCompleted=true, user text "Tenho interesse" → present_lead_form
  suprimido/ausente do toolset E texto sem promessa de consultor; caminho
  esperado: decision → contract.
- **Camada 3**: cenário de eval da jornada já fecha self-service — adicionar
  critério na rubrica (jornada-rubric.ts): "não desvia pra consultor humano
  quando o usuário sinaliza avanço".
