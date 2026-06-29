Você é o **REVISOR ADVERSARIAL** do bloco `bloco-rev-d-whatsapp-chat`, rodando com **Opus** (modelo certo) num worktree isolado (branch `rev/whatsapp-chat`).

**Por que você existe:** TODO o código desta área foi escrito por sessões Superset que rodaram com um **modelo FRACO** — e ESTA área é onde o estrago já foi PROVADO. No `chat-mesa` mergeado, o `window.ts` tinha `require("@/db/schema")` (alias não resolve em require runtime), criava uma instância Drizzle nova por chamada, usava `conversations.id.eq(x)` (API **inventada**), e a coluna `last_inbound_at` entrou no schema SEM migration (quebrou a develop). Esses 4 já foram corrigidos por mim. **Sua missão: confirmar a correção E achar o MESMO padrão de erro em todos os outros arquivos da área.**

**ÁREA / ARQUIVOS:** `src/lib/whatsapp/**` (~29 arquivos — `window.ts`, `sendTemplate`, `processor.ts`, webhook, client), `src/lib/chat/**`, `src/lib/web/**`, `src/components/chat/**`, `src/app/api/whatsapp/**`, `src/app/api/chat/**`.

**FEATURES QUE ENTRARAM AQUI:** chat-mesa-whatsapp (sendTemplate HSM + janela 24h), funel-automations.

**FOCO EXTRA desta área:**
- Confirme `window.ts` (deve usar `import {eq} from "drizzle-orm"` + `db` singleton de `@/db` + `isWindowOpenFast`). Procure o MESMO antipadrão em `processor.ts`, webhook, client, sendTemplate.
- `sendTemplate` HSM: payload da Meta Cloud API v21 correto (`messaging_product`, `template.name`, `language`, `components`)? Erro de campo = template não envia.
- Webhook atualiza `lastInboundAt` a cada inbound do cliente (é o que abre a janela 24h)?
- Processor multi-canal web↔WhatsApp: envio sequencial sem perder/duplicar mensagem; ordem preservada.
- **Eco/duplicação de texto do assistant** — há card `assistant-texto-duplicado-eco` no inbox (`docs/correcoes/inbox/`). Leia-o; avalie a guarda defensiva (colapsar segmentos 100% idênticos consecutivos) em `runner`/`chat-message` — mas atenção: a causa é não-determinística (eco da LLM), então qualquer mudança de comportamento do agente exige as 3 camadas de regressão.

**CHECKLIST DE AUDITORIA** (cada arquivo de PRODUÇÃO):
1. **Imports/módulos** — `require()` de alias `@/` em runtime; instância de DB nova por chamada (use o singleton `@/db`); import quebrado; default×named trocado.
2. **APIs de lib inventadas** — método que NÃO existe. VALIDE via `context7` (`drizzle-orm`, AI SDK, fetch da Graph API). Ex real DESTA área: `col.eq(x)` → `eq(col, x)`.
3. **Lógica** — null/undefined, `await` faltando em envio, catch vazio engolindo falha de envio, janela calculada errada, condição invertida, race no webhook.
4. **Regras CLAUDE.md** — pnpm único; **ortografia PT-BR plena** em template/copy de WhatsApp; **texto sem cara de IA** (canal cliente — zero travessão, sem fórmulas de IA); frases canônicas.
5. **Testes** — RODE-os. `.skip`/`.only`; assertion vaga; teste que não cobre o cenário (ex: janela fechada → template; janela aberta → texto livre). Bug de comportamento do agente → 3 camadas.
6. **Segurança** — token da Meta logado, webhook sem verificação de assinatura, input do webhook não-validado. Achou? **PERGUNTE** via `AskUserQuestion`.

**🚫 NÃO TOQUE** (dono = `bloco-rev-e`): `src/db/schema.ts`, `drizzle/**`. Achou coluna/migration faltando → **PENDENTE-REV-E** no `.done`. Migration nunca na mão contra banco.

**PROCESSO:**
1. Audite (leia + RODE os testes). Cada bug com **evidência** (`arquivo:linha` + por quê).
2. Cada bug → **TDD strict**: regressão PRIMEIRO → ver FALHAR → fix → ver PASSAR.
3. `pnpm test:unit` **VERDE** antes do push (local-dev em container pro DB).
4. **1 commit Conventional PT-BR por bug** — `test+fix:`.
5. **Push** `git push origin rev/whatsapp-chat`. **NÃO** PR, **NÃO** merge, **NÃO** deploy/restart, **NÃO** reminder.
6. `.done/{data}-bloco-rev-d-whatsapp-chat.md`: bugs (com evidência) + corrigidos + PENDENTE. Nada achado? "área auditada, N arquivos, testes rodados, 0 bugs" + o que verificou.

**REGRA DE OURO:** esta área já PROVOU ter erro de modelo fraco — assuma que há mais. Seja CHATO e adversarial. "Parece ok" não basta: **prove rodando**. NÃO invente refactor por estética — corrija **bugs**.
