---
id: FIX-302
titulo: "Reengajamento proativo no web quando o usuário some (hoje só existe no WhatsApp)"
status: todo
bloco: bloco-r10-1-web-reengage
severidade: alta
projeto: aja-agora
arquivos: [src/lib/workers/gate-reengage-poll.ts, src/lib/agent/gate-reengage.ts, src/app/api/chat/resume/route.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-web-reengage — único item paralelo sem colisão)
---
## Palavras do operador
> "tem que dar uma chamada no usuário, tem que ser bem proativo... se o usuário não responder, tem
> que dar uma chamada, falar 'cara, você ainda está aí? vamos continuar'" — pedido explícito do
> Kairo, 2026-07-12.

## Cenário exato
- **Rota/tela:** chat web, qualquer ponto da jornada com um gate pendente.
- **Passos:** parar de responder por 90s+ no meio de um gate; observar se o agente reengaja.
- **Dados usados:** comparar com o comportamento já existente no canal WhatsApp
  (`gate-reengage-poll.ts`, `gate-reengage.ts`).

## Esperado × Atual
- **Esperado:** usuário inativo no web recebe a mesma escada de reengajamento do WhatsApp (4
  tentativas: pergunta direta → incentivo → reforço de segurança → oferta de especialista),
  timeout 90s (D4 aprovado).
- **Atual:** o reengajamento existe e funciona bem, mas **só no WhatsApp** — a query do worker
  filtra `channel === "whatsapp"` e exige `waId`. No web, usuário sumiu = conversa morta.

## Root cause (INVESTIGADO — confirmado pelo crítico)
- `gate-reengage-poll.ts:53-59`: filtra `channel === "whatsapp"`.
- `gate-reengage-poll.ts:99`: `if (!row.waId) continue` — web não tem `waId`.
- Comentário já existente em `gate-reengage-poll.ts:14-15` admite o gap: "Web fica fora deste
  worker (o push server→client numa sessão SSE já fechada é PENDENTE-KAIRO)".
- `pendingGateAfterTurn()`/`shouldReengageGate()` (`gate-reengage.ts:58-71,123-136`) e a escada de
  cobrança (`reengageQuestionForGate`, `gate-reengage.ts:98-117`) são reusáveis — a lógica de
  "quando reengajar e o que dizer" já está pronta e testada.
- Rota de resume/reidratação já existe (`/api/chat/resume`), mas ela reidrata na RECONEXÃO — não
  entrega proativamente enquanto o usuário está ocioso com a aba aberta.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Remover o filtro `channel === "whatsapp"` da query do worker | `gate-reengage-poll.ts` |
| Ramificar a ENTREGA por canal: WhatsApp continua via `fireGate`/Meta Cloud API; web persiste a mensagem de reengajamento na conversa (mesma tabela/registro de mensagens) | `gate-reengage-poll.ts` |
| Cliente web faz poll leve enquanto ocioso (ou reaproveita o mecanismo de resume) pra puxar a mensagem de reengajamento persistida e exibi-la sem precisar de reload | `/api/chat/resume` ou novo endpoint de poll leve |
| Timeout: 90s, igual WhatsApp (D4 aprovado) — reusa `GATE_REENGAGE_TIMEOUT_MS` sem ajuste |  |

## Regressão exigida
- Teste de integração: gate pendente + 90s sem resposta no canal WEB → mensagem de reengajamento é
  persistida e entregue ao cliente (não precisa reload manual).
- Teste de integração: comportamento do WhatsApp não regride (continua via `fireGate`).
- Teste da escada completa (4 tentativas) reproduzida no canal web.
