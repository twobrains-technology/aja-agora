---
slug: crossfrente-agente-mudo-captura-nome
origem: QA autônomo FRENTE 2 (recomendação/fechamento) — observação CROSS-FRENTE
faixa: NÃO é FRENTE 2 (Passos 5-7). É entrada/identidade (FRENTE 1 / cross-cutting).
data: 2026-07-01
severidade: media (a verificar)
status: aberto-observacao
---

## ⚠️ Observação cross-frente (não corrigir sem o dono da faixa)

Achado durante o **E2E ao vivo do QA da FRENTE 2** (simulador WhatsApp) enquanto eu tentava
dirigir o funil até o **reveal** (Passo 5) para validar meus fixes (FIX-116/117/119). O funil
emperrou **antes** da minha área, em **Passo 1 (nome)** e **Passo 3 (identidade)** — territórios
de **entrada/welcome (FRENTE 1)** e **identidade (cross-cutting)**. Registro aqui para o dono da
faixa / Kairo triar. **Eu não corrigi** (não é minha faixa; há frente paralela nessa área).

### Achado 1 — Agente MUDO ao receber o nome (Passo 1)

- **Canal:** WhatsApp (simulador `/admin/simulator/whatsapp`, que passa pelo MESMO
  `processTextMessage` do webhook real).
- **Cenário exato:** conversa nova → agente pergunta "como posso te chamar?" → usuário responde
  **"Kairo"** → **agente não responde nada** (silêncio). O usuário só recebe resposta no turno
  SEGUINTE.
- **Evidência (turn-trace):**
  ```
  "gate":null,"toolsCalled":["save_contact_name","save_contact_name","save_contact_name",
   "save_contact_name","save_contact_name","save_contact_name","save_contact_name",
   "save_contact_name","save_contact_name","save_contact_name"],"toolCount":10,
   "artifactsEmitted":[],"textChars":0,"durationMs":27521,"finishReason":"ok"
  ```
  → `save_contact_name` chamado **10×** em loop, **`textChars:0`** (zero texto), 27s.
- **Esperado:** ao receber o nome, salvar **1×** e responder (ecoar objetivo / próxima pergunta) —
  nunca silêncio.
- **Recuperação:** o nome "Kairo" FOI salvo (`leads.name = Kairo`); o turno seguinte recuperou
  (agente foi ao gate consent). Ou seja: soluço de 1 turno, não bloqueio permanente.
- **Hipótese (NÃO confirmada — epistêmico):** o agente entra em loop de `save_contact_name` até
  bater o `stepCountIs` e termina sem gerar texto. Pode ser específico do modelo/persona (auto) ou
  regressão de prompt/tool-policy. Área guardada pelo eval `EVAL-SAVE-CONTACT-NAME-CIRURGICO`
  (`test:eval:quick`) — **vale checar se o eval pega esse loop** (se passa, o guard determinístico
  não cobre o comportamento vivo).
- **Onde provavelmente mexe:** `src/lib/agent/tools/*` (save_contact_name), tool-policy/prompt de
  captura de nome no gate `name`.

### Achado 2 — CPF/identidade dropado no simulador (Passo 3) — INCERTO

- Enviei `"Meu CPF é 02874137138"` (conta homologação Kairo) via a send API do simulador
  (`POST /api/admin/simulator/whatsapp/{id}/send`). Retornou **204** mas a mensagem **não
  persistiu** (não entrou em `messages`) e **nenhum turn-trace** foi emitido — o turno sumiu.
- **Confiança BAIXA:** pode ser específico do driving via send API (não da UI), ou do path de
  identidade. **Não cravar como bug de produto** — é observação a reproduzir com rigor.

### Por que está aqui e não corrigido
Regra da rodada: numero FIX só na minha faixa (FIX-150..169, Passos 5-7) e não invado faixa de
outra frente rodando em paralelo. Estes 2 achados são de entrada/identidade. Deixo documentado
com evidência para o dono decidir (severidade/fix). O ambiente já está saudável (corrigi as
secrets truncadas do `.env.local` que deixavam o agente mudo por `invalid x-api-key` — ver ledger).

---
## PENDENTE-KAIRO (infra de notificação, sem contorno programático — 2026-07-01)
Envio de relatório pro WhatsApp do Kairo requer AÇÃO DELE (não automatizável):
1. Adicionar o número dele à **allowlist do WhatsApp Business** (Meta Business Manager) — a API
   retorna `#131030 Recipient phone number not in allowed list` (Business em modo dev).
2. **Ativar o Remote Control do notch** (toggle no telefone) — PushNotification hoje volta
   "Remote Control inactive", então o push não chega no celular.
Feito qualquer um dos dois, relatórios futuros chegam sozinhos.

---
## Resolução (FIX-172, 2026-07-01) — TDD direto na sessão (não bloco)
**Root cause:** turno fecha MUDO quando o modelo loopa uma tool SILENCIOSA
(`save_contact_name` só grava no DB, não emite nada) até bater `stepCountIs(10)` sem gerar
texto. Dois furos: (1) `isTurnEmpty` contava `toolCount>0` como "não vazio" → não pegava o
loop; (2) o `consumeEvents` do WhatsApp nem tinha o guard de turno-vazio (só o web tinha,
`route.ts:1109`).

**Fix:**
- `src/lib/chat/empty-turn-guard.ts`: `isTurnEmpty` passa a distinguir tool ACIONÁVEL
  (search_groups → emite artifact) de SILENCIOSA (`save_contact_name`/`save_contact_whatsapp`)
  via `toolsCalled` (do TurnTrace). Turno só com silenciosas + 0 texto/artifact = mudo →
  fallback. Retrocompat: records sem `toolsCalled` mantêm o comportamento antigo.
- `src/lib/whatsapp/adapter.ts`: `consumeEvents` ganha `opts.guardEmptyTurn`;
  `processWithOrchestrator` (user-turn) emite `EMPTY_TURN_FALLBACK` se o turno fechar sem
  `hasSent` (paridade com o web).

**Regressão (viu falhar antes):** `empty-turn-guard.test.ts` (FIX-172, 5 casos) +
`adapter.fix-172.test.ts` (Camada 2 — turno mudo no WhatsApp → fallback). 17 testes verdes.
