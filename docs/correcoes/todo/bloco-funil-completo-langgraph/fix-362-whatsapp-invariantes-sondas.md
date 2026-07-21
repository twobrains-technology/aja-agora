---
id: FIX-362
titulo: "WhatsApp validado + invariantes I3/I4/D6 + sondas de não-engessar"
status: todo
bloco: bloco-funil-completo-langgraph
arquivos:
  - src/lib/agent/langgraph/
rodada: 2026-07-20 — campanha runtime LangGraph, Rodada 1
---

## Cenário
Provar que os DOIS canais funcionam com o runtime LangGraph e que a rubrica de não-engessar + os
invariantes duros são checáveis mecanicamente.

## Root cause (investigado — TODO(rodada-1) da fundação + rubrica MÉDIA-9 do crítico)
- A fundação exercitou só o canal WEB nos testes. O contrato `TurnEvent` é o mesmo, então
  `whatsapp/adapter.ts` (`consumeEvents`/`artifactToWhatsApp`) DEVERIA consumir sem mudança — mas não há
  teste cobrindo. Fix ALTA-1/MÉDIA-7: cards degradam pra texto/interativo/`null` no WhatsApp.
- A rubrica "não-engessar" precisa de sondas mecânicas (não juízo subjetivo).

## Correção proposta
| O quê | Onde |
|---|---|
| Teste de integração: um turno LangGraph consumido por `consumeEvents` (WhatsApp) produz as mensagens certas (texto/interativo); cards sem mapper degradam sem quebrar | teste novo |
| Invariantes determinísticos: I1 (busca sem identidade impossível — já na fundação, reforçar), I3 (payload coerido), I4 (sanitizer barra "reservado"/"garantida"/`taxaContemplacao`), D6 (netCredit≥bem via `respectsNetCreditGuardrail`) | testes novos |
| Sondas de não-engessar (mecânicas): (a) "não entendi" 2× → as 2 respostas do agente são byte-DIFERENTES (grep de igualdade); (b) usuário puxa off-topic no gate credit → responde E reabre credit em ≤2 turnos; (c) zero `const` de fala no `converse` (o modelo sempre gera) | testes novos |

**Sem travar copy por regex** (proibido) — as sondas checam VARIAÇÃO/comportamento, nunca fixam texto exato.

## Critério de aceitação
- Teste WhatsApp: stream langgraph → mensagens corretas via `consumeEvents`.
- Invariantes I1/I3/I4/D6 verdes (imgameáveis).
- Sondas de não-engessar verdes (byte-diff, reabertura de gate).
- `pnpm test:unit` verde.

## Regressão exigida
Todos os testes acima são a regressão (invariantes + sondas). Modelo mockado onde não precisa de gateway.
