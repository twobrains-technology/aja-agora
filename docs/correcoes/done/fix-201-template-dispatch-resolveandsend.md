---
id: FIX-201
titulo: "template-dispatch.ts: resolveAndSend (janela) + fila + flushOutboundQueue"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - src/lib/whatsapp/template-dispatch.ts
rodada: 2026-07-02 — feature cadastro/envio de Message Templates Meta oficial
---
## Palavras do operador
> "hoje enviamos uma mensagem direta, mas isso não vai ser possível ... é esse modelo de
> templates que vamos poder enviar no final da contratação com o agente."

## Cenário exato
- **Rota/tela:** fim da jornada de contratação (passo 5 / fechamento Bevi), disparo pro WhatsApp do cliente.
- **Passos:** 1) cliente conclui contratação (na web OU no WhatsApp); 2) plataforma envia confirmação pro celular.
- **Dados usados:** `conversations.lastInboundAt` (janela 24h), `whatsappTemplates` (por `usageKey`), `whatsappOutboundQueue`.

## Esperado × Atual
- **Esperado:** camada única que decide, por janela + status de template, COMO enviar; e uma fila que garante entrega ao aprovar.
- **Atual:** envio de texto livre direto pra `55{celular}` (`sendContractSummary`, `closingPresentation`) — **quebra fora da janela de 24h** (caso web→WhatsApp), pois a Meta bloqueia texto livre business-initiated.

## Root cause (INVESTIGADO)
Mapa do Explore (2026-07-02): a confirmação é texto livre disparado direto
(`contract-summary.ts:133-135` envia pra `to = 55${identity.celular}`;
`closingPresentation` em `bevi/closing-presentation.ts:96-135`). Não há verificação de
janela nesses caminhos — só "funciona por acaso" quando a jornada rolou no próprio
WhatsApp (janela aberta). `isWindowOpen` existe em `src/lib/whatsapp/window.ts` mas não é
consultada no disparo da confirmação.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| `resolveAndSend({to, waId, usageKey, params, freeTextFallback})`: janela aberta→`freeTextFallback()`; fechada+APPROVED→`sendTemplate`; fechada+não-aprovado→enfileira `pending` + alerta admin | `src/lib/whatsapp/template-dispatch.ts` (NOVO) |
| `flushOutboundQueue(usageKey)`: dispara `pending` do usageKey via `sendTemplate`, marca `sent`; falha→`attempts++`/`lastError`, mantém `pending`; idempotente | `src/lib/whatsapp/template-dispatch.ts` |
| Mapeamento `params`→placeholders dos `components` do template | `src/lib/whatsapp/template-dispatch.ts` |

## Regressão exigida
Camada 1 (`src/lib/whatsapp/template-dispatch.test.ts`, integração com DB de teste + `sendTemplate`/`sendTextMessage` mockados):
- janela aberta → chama `freeTextFallback`, não toca template/fila;
- janela fechada + template APPROVED → chama `sendTemplate` com componentes corretos;
- janela fechada + template PENDING → grava `pending` na fila, NÃO envia;
- `flushOutboundQueue` envia pendentes e marca `sent`; em falha mantém `pending` e incrementa `attempts`;
- `flushOutboundQueue` é idempotente (rodar 2x não duplica envio das já `sent`).
Sem cassette.
