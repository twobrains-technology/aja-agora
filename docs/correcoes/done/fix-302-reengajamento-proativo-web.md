---
id: FIX-302
titulo: "Reengajamento proativo no web quando o usuário some (hoje só existe no WhatsApp)"
status: done
bloco: bloco-r10-1-web-reengage
severidade: alta
projeto: aja-agora
arquivos: [src/lib/workers/gate-reengage-poll.ts, src/lib/agent/gate-reengage.ts, src/lib/workers/gate-reengage-poll.integration.test.ts, src/lib/agent/gate-reengage.escada.test.ts]
rodada: 2026-07-12 (loop-de-goal r10, onda 1, bloco r10-1-web-reengage — único item paralelo sem colisão)
commit: "1 commit conventional na branch fix/r10-1-web-reengage (ver git log)"
executado_em: "2026-07-12"
decisao: docs/decisoes/blocos/2026-07-12-bloco-r10-1-web-reengage.md
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

## Implementado (2026-07-12)

Decisão de entrega registrada em `docs/decisoes/blocos/2026-07-12-bloco-r10-1-web-reengage.md`:
persistir na tabela `messages` (`saveMessage`) + reusar `/api/chat/resume` — sem endpoint novo.

- `gate-reengage-poll.ts`: query parou de filtrar por canal; `runReengageCycle` ramifica a
  entrega (WhatsApp via `fireGate`, sem mudança; web via `saveMessage` + publish best-effort no
  `message-bus`). Gates de coleta obrigatória re-armam o marcador até o teto de 4 tentativas da
  escada FIX-211 (a 4ª — `SPECIALIST_EXIT_OFFER` — não re-arma, anti-loop-infinito).
- `gate-reengage.ts`: `reengageQuestionForGate` ganhou parâmetro `channel` (bug lateral
  corrigido — sem ele, o gate `identify` mentia "aqui do WhatsApp" pro usuário web).
- 3 novos testes de integração + 1 teste unitário da escada (39/39 verdes, container
  transitório + PG shared do workspace — DB do host bloqueado por convenção).
- **Gap explícito**: `theater-chat.tsx` só consulta `/api/chat/resume` uma vez no mount — não
  há poll periódico enquanto a aba fica ociosa. A mensagem fica disponível (regressão exigida
  cumprida), mas só chega visualmente no próximo mount/reconexão, não "empurrada" numa aba já
  aberta. Fora do `escopo_arquivos` do bloco — follow-up natural, não uma correção silenciosa.
