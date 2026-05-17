# Aja Agora — Context

Glossário e termos canônicos do domínio. Atualizado inline conforme decisões cristalizam em sessões de design (`/grill-with-docs`).

---

## Termos

### Conversation (canal)
Unidade de diálogo entre um lead e o sistema. Modelada em `conversations` no DB, com campo `channel ∈ {"web", "whatsapp"}` e identificadores específicos (`waId` pro WhatsApp, `id` interno pro web).

### Handoff
Passagem da conversa do agente IA pra um atendente humano. Marcada por `conversations.status = "handed_off"`. Atendentes ativos (`user.role="attendant" AND is_active=true`) são notificados — **primeiro a responder reivindica** (seta `handedOffUserId`). Depois disso o `proxy.ts` faz bridge bidirecional cliente ↔ atendente até `/fim` (vira `status="closed"`).

Gatilhos automáticos:
- **Web:** submit do `lead-form` em `/api/leads`
- **WhatsApp por interesse:** após `searchDispatched`, lead expressa intenção via regex `INTEREST_RE` ("fechado", "tenho interesse", etc.)
- **Playbook:** regra `suggest_handoff` da persona (ex: 3 objeções consecutivas) força

### Attendant
Usuário humano (`user.role="attendant"`) que recebe handoffs. Tem `phone` cadastrado (recebe notificação Meta API) e flag `is_active` que controla se entra na rotação.

### Simulator (atendente) — existente
Ferramenta dev em `/admin/simulator` que **encarna um atendente** sem precisar de um segundo número de WhatsApp. `proxy.sendToAttendant()` sempre publica no `simulator-bus` (in-memory pub/sub) em paralelo ao Meta API, e o painel admin consome via SSE.

### Simulated Conversation
Conversa iniciada pelo simulador do backoffice (usuário do admin no papel de cliente). Mora na **mesma tabela** `conversations` que conversas reais e roda o **mesmo orchestrator, prompt, tools, persistência de histórico e memória Letta** — fidelidade é o ponto, qualquer divergência invalida o uso.

Diferenciada por flag `is_simulated = true`. Implicações:
- **Filtrada de relatórios e painéis comerciais** — kanban de leads, funnel analytics, dashboard de eval scores não incluem (senão métrica corrompe em dias)
- **Não dispara efeito colateral externo** — handoff não notifica atendente real via WhatsApp; em vez disso, cai automaticamente no `/admin/simulator` de atendente existente (vira bancada de QA de ponta a ponta)
- **Eval roda opt-in** — não dispara `triggerEvalScoring` automaticamente (evita custo de Claude em sessão de brincadeira); admin pode forçar manualmente se quiser avaliar

### Simulated waId
Identificador sintético do cliente simulado no canal WhatsApp, no formato `SIM-<uuid>`. É o que entra em `conversations.waId`, namespace de memória Letta e chave de `getHandoffState`. Garante isolamento entre simulações concorrentes (devs diferentes simulando ao mesmo tempo).

### Simulator Inbox
Tela de entrada do simulador de cliente (web e WhatsApp): lista todas as conversas simuladas (de toda a equipe, com badge do autor) + botão grande **"Nova conversa"**. Clicar numa conversa anterior retoma o estado exato (histórico + meta + memória). Sem capability de "encarnar lead real de produção" no MVP — postergado por risco de uso indevido.

### Channel Simulator (novo — em design)
Tipo do simulador: `web` ou `whatsapp`. Cada um renderiza UI fiel ao canal real:
- **Web simulator** — embute os mesmos componentes do chat web (`ChatLayout`, `MessageList`, `ArtifactRenderer` com cards/gates clicáveis)
- **WhatsApp simulator** — UI estilo WhatsApp; recebe texto formatado por `formatTextForWhatsApp()` e botões/lists via `artifactToWhatsApp()` (renderizados como botões nativos WhatsApp)

Em ambos, o backend percorre **exatamente o mesmo caminho** que o canal real percorreria — interceptação acontece na camada de I/O externo (Meta API → simulator-bus), não em rota paralela.

---

## Decisões registradas inline

- **2026-05-16** — Conversa simulada é nível B (mesma tabela com `is_simulated=true`, isolada de side effects externos e relatórios). Razões: fidelidade do agente + zero poluição de painel comercial + handoff testável via simulator de atendente já existente.
- **2026-05-16** — Identidade do cliente simulado: `waId=SIM-<uuid>` por conversa, com **Inbox** que lista conversas simuladas da equipe (compartilhadas, badge do autor) + "Nova conversa". MVP **não** inclui "encarnar lead real de produção" (postergado por risco de uso indevido > valor imediato).
- **2026-05-16** — UX dos simuladores de cliente: **Web** reusa import direto dos componentes do site (`ChatLayout`, `MessageList`, `ChatMessage`, `ArtifactRenderer`, providers) — nada de iframe, nada de recriar. **WhatsApp** nível 2 (bolhas verde/branca, header com avatar+nome, pattern de fundo, double-check, container ~440px). Botões/lists interativos do WhatsApp renderizados fiéis (até 3 reply buttons, list message com sheet) e clique chama `processInteractiveReply` real. Cadência de mensagens preserva delay/split do `whatsapp/api.ts`. Typing indicator espelhado via `simulator-bus`. Mockup de device (iPhone/Android frame) **fora de escopo**.
- **2026-05-16** — Navegação: `/admin/simulator` vira **index com 3 cards** (Cliente WhatsApp / Cliente Web / Atendente). Cada modo em sub-rota própria: `/admin/simulator/whatsapp`, `/web`, `/attendant`. O `/admin/simulator` atual (atendente) **migra** pra `/admin/simulator/attendant`. Deep-link por sub-rota; sidebar admin tem entrada única "Simulador" apontando pra index.
- **2026-05-16** — Handoff dentro de simulação: roda **mesma função** `handoffToAgents()`, mas branch `is_simulated` pula chamada Meta API (só publica no `simulator-bus`). Default = vai pro `/admin/simulator` de atendente existente (outros devs claimam). Toggle "Assumir eu mesmo" no painel do cliente abre split lateral pra dev solo. Lead criado herda `is_simulated=true`. Painel de atendente mistura conversas reais/simuladas com badge 🧪 visível. Primeiro-a-responder claima vale igual prod.

---

*Documento vivo. Atualizado por sessões de design.*
