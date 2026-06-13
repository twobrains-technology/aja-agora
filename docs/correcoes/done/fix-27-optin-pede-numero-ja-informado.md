---
id: FIX-27
titulo: "Opt-in de WhatsApp pede o número DEPOIS que ele já foi informado 2× (lead form + identify) — card abre vazio, sem prefill"
status: done
commit: 4c3099c
executado_em: 2026-06-12
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

### Estado da arte (pesquisa web 2026-06-11 — ver `docs/correcoes/2026-06-11-pesquisa-stack-padroes.md`)

- O padrão dominante 2026 confirma e ENDURECE a correção: slot coletado se
  grava **no mesmo fluxo do submit** (server-side) num estado estruturado, e a
  capacidade de re-coleta se remove **por construção** — `prepareStep` +
  `activeTools` do AI SDK tiram `present_whatsapp_optin` do toolset quando
  `slots.phone` está preenchido (determinismo > instrução no prompt). Nosso
  tool-policy por fase (FIX-19) já dá a infra — estender pra policy por SLOT.
- Snapshot estruturado dos slots no prompt (YAML: `telefone: ✓ (62) 9...`) com
  precedência explícita, em vez de só narrativa de estágio (padrão do OpenAI
  Cookbook "Context Engineering for Personalization").

### Regressão exigida (3 camadas)

- Camada 1: derive com phone capturado ≠ "open"; componente com `knownPhone`
  renderiza confirmação (sem input vazio); leads route seta a flag no meta;
  tool-policy remove present_whatsapp_optin com slot preenchido.
- Camada 2: cassette — pós-erro Bevi + "sim", agente NÃO chama
  present_whatsapp_optin pedindo número; turno re-tenta o fechamento.
- Camada 3: cenário de eval — jornada com lead form preenchido → fechamento →
  erro → "sim": assert de que nenhuma re-coleta de telefone acontece.

### Execução (2026-06-12) — seguiu a recomendação (stage "confirm" 1-clique)

- **Meta:** `contactPhone` (MASCARADO, LGPD — `maskPhoneForDisplay` em
  identity.ts) + `contractRetryPending`. Setados no `leads/route.ts` (lead form)
  e no `chat/route.ts` contract-submit (celular do identify; retry no erro Bevi
  genérico, limpo no sucesso).
- **Derive (`system-prompt.ts`):** `deriveWhatsappOptinStage` ganhou o stage
  `"confirm"` (telefone capturado → confirma o canal, não re-coleta) e retorna
  `"done"` quando há retry de fechamento pendente. Seção `whatsappOptinSection
  ("confirm")` instrui a confirmação sem re-pedir o número.
- **Determinismo:** `shouldEmitWhatsappOptin` (tool-policy) suprime o card em
  retry pendente. O `runner.ts` enriquece o payload do `whatsapp_optin` com
  `knownPhone` (igual contract_form/identity).
- **UI:** `whatsapp-optin.tsx` aceita `payload.knownPhone` → confirmação de 1
  clique (número mascarado + "Pode sim" / "Usar outro número" / "Agora não"),
  sem input vazio. Action `whatsapp_optin_confirm` usa o número já salvo (lead →
  identity) — sem re-digitar. `artifact-renderer` passa o payload.
- **Camadas:** C1 (derive/section/guard/mask/componente/leads route — vistos
  FALHAR antes) + C2 (cassette `agent-trajectory.test.ts`: re-coleta dispara o
  detector; confirmação não; + acoplamento runner/route/leads) + C3 (eval LLM no
  pre-commit, src/lib/agent/ tocado). Suite Camadas 1+2 verde (1514). 0 erro de
  tipo em produção (tsc).
