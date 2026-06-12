---
id: FIX-27
titulo: "Opt-in de WhatsApp pede o número DEPOIS que ele já foi informado 2× (lead form + identify) — card abre vazio, sem prefill"
status: todo
bloco: bloco-n-optin-redundante
arquivos:
  - src/lib/agent/system-prompt.ts (deriveWhatsappOptinStage + seção "open")
  - src/lib/agent/personas.ts (campo novo no ConversationMetadata)
  - src/lib/agent/agents/index.ts (resolveAgent passa o meta novo)
  - src/app/api/leads/route.ts (setar flag no meta ao salvar phone do lead)
  - src/app/api/chat/route.ts (contract-submit/identify setar flag no meta)
  - src/components/chat/artifacts/whatsapp-optin.tsx (prefill/confirmação 1-clique)
  - src/lib/chat/types.ts (payload do whatsapp_optin com knownPhone)
rodada: 2026-06-11 (testes manuais do Kairo no dev, pós-deploy da auditoria do dial)
anotado_em: 2026-06-11
---

# FIX-27 — Opt-in de WhatsApp pede o número que o usuário já informou

### Palavras do operador

> "nao faz setnio nenhum ter pedido o numero uma vez qo numero foi informado."

### Cenário exato (prints da sessão, dev 2026-06-11)

1. Lead form ("Seus dados") coletou **WhatsApp 62992496793** (campo até veio
   preenchido — o sistema JÁ conhecia o número).
2. Fechamento: identify card coletou **CPF mascarado + Celular (62) 99249-6793**
   de novo. Usuário clicou "Continuar com segurança".
3. Bevi falhou: "Tive um problema ao falar com a administradora agora. Pode
   tentar de novo em instantes?". Usuário respondeu "sim".
4. Em vez de re-tentar o fechamento, o agente: "Pra garantir que você não perca
   o atendimento, me compartilha seu WhatsApp?" + card `whatsapp_optin` com
   **input VAZIO** pedindo o número pela **terceira vez**.

### Root cause INVESTIGADO (provado no código)

- `deriveWhatsappOptinStage` (`src/lib/agent/system-prompt.ts:747-754`) olha SÓ
  `revealCompleted` + `whatsappOptinShown`. O celular salvo pelo lead form
  (`POST /api/leads` grava `phone` na tabela `leads`) e o celular do identify
  (identity cifrada do fechamento) **não setam nada que o derive enxergue** →
  stage permaneceu `"open"`.
- Com stage `"open"`, a seção dinâmica do prompt **MANDA** o agente oferecer
  ("## WhatsApp — ofereca AGORA... EM SEGUIDA chame present_whatsapp_optin").
  O modelo obedeceu a instrução — não é alucinação, é o prompt mandando errado.
- Agravante 1: o componente `WhatsappOptin`
  (`src/components/chat/artifacts/whatsapp-optin.tsx:40`) nasce com
  `useState("")` — não recebe payload, não tem prefill, mesmo o sistema
  conhecendo o número.
- Agravante 2 (timing): o derive não sabe que há um **fechamento em andamento
  com erro pendente** — a seção "open" diz "o usuario acabou de ver a 1a
  recomendacao", mas dispara em qualquer turno pós-reveal, inclusive no meio
  do retry de submit da proposta.

### Correção proposta

| O quê | Onde |
|---|---|
| Flag `phoneCaptured` (ou `contactPhone` mascarado) no `ConversationMetadata`, setada quando o lead form salva phone E quando o identify do fechamento captura celular | `personas.ts` + `api/leads/route.ts` + `api/chat/route.ts` (contract-submit) |
| `deriveWhatsappOptinStage` retorna `"done"` quando phone já capturado SEM opt-in formal — OU novo stage `"confirm"`: prompt instrui pedir só a CONFIRMAÇÃO do canal ("posso te chamar no (62) 9...-6793?") sem re-coleta | `system-prompt.ts` |
| Card `whatsapp_optin` aceita `knownPhone` no payload → vira confirmação 1-clique (número mascarado + botão "usar outro número") em vez de input vazio. Preserva o consentimento explícito (LGPD) sem re-digitação | `whatsapp-optin.tsx` + `types.ts` |
| Opt-in NUNCA oferecido com fechamento em andamento/erro Bevi pendente — derive considera o estado do fechamento | `system-prompt.ts` + `agents/index.ts` |

Recomendação: stage `"confirm"` com 1-clique (consentimento de canal é
diferente de ter o número — LGPD), supressão total só se o opt-in já tiver
sido respondido em qualquer forma.

### Regressão exigida (3 camadas)

- Camada 1: derive com phone capturado ≠ "open"; componente com `knownPhone`
  renderiza confirmação (sem input vazio); leads route seta a flag no meta.
- Camada 2: cassette — pós-erro Bevi + "sim", agente NÃO chama
  present_whatsapp_optin pedindo número; turno re-tenta o fechamento.
- Camada 3: cenário de eval — jornada com lead form preenchido → fechamento →
  erro → "sim": assert de que nenhuma re-coleta de telefone acontece.
