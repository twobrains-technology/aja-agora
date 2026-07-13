---
id: FIX-216
titulo: "Terminologia 'reserva de cota' em todo texto de usuário (contratar→reservar, sem 'fechar'); frase 'não paga nada agora / booking'; wording de reserva concluída"
status: done
severidade: alta
projeto: aja-agora
bloco: bloco-jornada-conversa
commit: c2a021775dbc71a721f0f5bb62cee24dad15c6e7
executado_em: 2026-07-04
arquivos:
  - src/lib/chat/types.ts
  - src/app/api/chat/route.ts
  - src/lib/agent/system-prompt.ts
  - src/lib/whatsapp/formatter.ts
  - src/lib/agent/orchestrator/directives.ts
  - src/components/chat/artifacts/contract-form.tsx
  - src/components/admin/whatsapp-templates/template-form-dialog.tsx
  - src/lib/validations/whatsapp-template.test.ts
rodada: 2026-07-04 — Ata de alinhamento com o cliente (itens 5 e 6, P0)
---
## Palavras do operador
> Ata 5: *"Não é 'consórcio fechado/contratado' — é RESERVA DE COTA. Botão 'confirmar e contratar' → 'confirmar e reservar'. Evitar 'fechar', 'fechado com o Itaú'. Comunicar: 'Você não paga nada agora — tipo booking. Só quando chegar o boleto na sua casa.'"*
> Ata 6: *"Ajustar wording pra deixar claro que é possível iniciar um NOVO consórcio (outra cota, outro bem) — nova jornada. Não dizer 'consórcio fechado'."*

## Cenário exato
- **Telas/canais:** card de decisão, formulário de coleta (web), templates WhatsApp, mensagens de confirmação de docs, estado terminal do agente (web e WhatsApp).

## Esperado × Atual
- **Esperado:** todo texto de usuário fala em **reservar / reserva de cota / reserva confirmada**; nunca "contratar/fechado". Após confirmar, o agente diz que **não se paga nada agora (tipo booking, só quando chegar o boleto)**. Na reserva concluída, deixa claro que dá pra **iniciar um novo consórcio** (nova jornada).
- **Atual:** 11 pontos usam "contratar/contratação/fechar/proposta registrada/contrato fechado". A frase de booking **não existe**.

## Root cause (INVESTIGADO)
Ocorrências de texto de usuário (todas confirmadas):
| # | Arquivo:linha | Texto atual → novo |
|---|---|---|
| 1 | `chat/types.ts:228` | `"Sim, quero contratar agora"` / waTitle `"Contratar agora"` → `"Sim, quero reservar agora"` / `"Reservar agora"` |
| 2 | `contract-form.tsx:71` | `"Vamos fechar sua proposta"` → `"Vamos confirmar sua reserva"` |
| 3 | `contract-form.tsx:63` | `"Enviei meus dados pra contratar"` → `"…pra reservar"` |
| 4 | `template-form-dialog.tsx:236` | placeholder `"sua contratação foi confirmada!"` → `"sua reserva de cota foi confirmada!"` |
| 5 | `route.ts:761,763,764,783,797` | `"sua ficha está completa"/"proposta já está registrada"` → `"sua reserva está confirmada"/"sua reserva de cota já está confirmada"` |
| 6 | `whatsapp-template.test.ts:15` | body `"sua contratação foi confirmada"` → `"sua reserva de cota foi confirmada"` |
| 7 | `system-prompt.ts:936-937` | `"## CONTRATO FECHADO"/"JÁ CONTRATOU"` → `"## RESERVA CONFIRMADA"/"JÁ RESERVOU"` |
| 8 | `system-prompt.ts:943` | `"fechamento já concluído"` → `"a reserva já está concluída… iniciar uma nova jornada depois"` |
| 9 | `system-prompt.ts:205` | `"escolheu contratar"/"Pra fechar, só preciso…"` → `"escolheu reservar"/"Pra confirmar sua reserva, só preciso…"` |
| 10 | `formatter.ts:1081` | `"Pra fechar a ficha…"` → `"Pra completar sua reserva…"` |
| 11 | `directives.ts:171` | `"bora seguir então. Só preciso de uns dados rápidos"` → `"…dados rápidos para confirmar sua reserva"` |

⚠️ **Identificadores de código NÃO mudam** (`intent:"contratar"`, `contractState`, `present_contract_form`, nomes de função/tipo/rota) — só o texto que o usuário lê.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Trocar os 11 textos acima | conforme tabela |
| **Adicionar** a frase de booking após a confirmação da decisão / antes de coletar dados | `directives.ts` (diretiva de avanço à coleta) e/ou reação do card de decisão — algo como *"Você não paga nada agora — é tipo um booking: só quando chegar o boleto na sua casa."* |
| Wording de reserva concluída deixando claro "novo consórcio = nova jornada" | `system-prompt.ts:943` |

## Regressão exigida (TDD strict)
1. Teste que o botão do card de decisão renderiza "reservar" (não "contratar") — web e waTitle.
2. Teste que as mensagens de sucesso de documentos falam "reserva confirmada" (não "proposta registrada/ficha completa").
3. Teste (snapshot/assert dirigido) que o estado terminal do agente usa "RESERVA CONFIRMADA" e menciona "nova jornada".
4. Teste que a frase de booking é emitida no avanço à coleta.
5. Atualizar `whatsapp-template.test.ts:15` pro novo texto.
