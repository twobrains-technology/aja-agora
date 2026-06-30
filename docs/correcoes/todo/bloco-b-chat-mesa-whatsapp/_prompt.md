Você é o executor do bloco **bloco-b-chat-mesa-whatsapp** no worktree isolado deste branch (`feat/chat-mesa-whatsapp`).

1. Leia `docs/correcoes/README.md` e `docs/correcoes/todo/bloco-b-chat-mesa-whatsapp/` (_bloco.md + FIX-85, FIX-86, FIX-87). Contexto-base: a integração WhatsApp já é **Meta Cloud API oficial** (`src/lib/whatsapp/api.ts`, webhook `src/app/api/webhook/whatsapp/route.ts`). Hoje o atendente responde pelo WhatsApp pessoal (`src/lib/whatsapp/proxy.ts`) — o objetivo é dar ao operador um chat NO KANBAN que envia pelo número oficial.

2. DESIGN: a arquitetura está nos cards. Decisão de design fina (ex.: aba nova vs reusar "Conversa"; texto exato do estado "janela fechada"; nome do template env) → decida como sênior seguindo o padrão do repo (Tabs do lead-detail, padrão dos sends em api.ts) e registre o não-trivial em `docs/correcoes/decisions/2026-06-28-bloco-b-chat-mesa.md` (commit `docs:`). Se houver trade-off de UX REAL, use `superpowers:brainstorming` e faça a pergunta via `AskUserQuestion` (recomendada em 1º, rótulo "(Recomendado)"); sem resposta em tempo razoável, siga a recomendada (fallback anti-trava).

3. Execute NA ORDEM: FIX-85 → FIX-86 → FIX-87. TDD onde couber (unit de `isWindowOpen`, integration do endpoint de envio).

4. 1 commit Conventional (PT-BR) por item. Migration (`lastInboundAt`) via drizzle-kit gerando o arquivo — NUNCA rode migration na mão (entrypoint/container).

5. Regras DURAS:
   - **Janela 24h é lei da API oficial:** fora da janela, PROIBIDO texto livre — só template aprovado. O endpoint do operador DEVE checar `isWindowOpen` antes de enviar texto.
   - O template HSM aprovado na Meta é **PENDENTE-KAIRO** (externo); implemente `sendTemplate` + a lógica e use o nome via env (`.env.example`).
   - NÃO remova o proxy WhatsApp-pessoal nesta feature (compat) — só adicione o caminho Kanban.
   - Toda mensagem enviada pelo operador É persistida (espelha o aprendizado FIX-11: handler que escreve precisa de saveMessage) e aparece no timeline.
   - pnpm único; local-dev em container; não rode migration na mão.

6. Ao terminar: **push da branch** (`git push origin feat/chat-mesa-whatsapp`) + gere `.done/{data}-bloco-b-chat-mesa.md`. **NÃO abra PR, NÃO faça merge, NÃO rode deploy/restart, NÃO crie reminder.** Integração é do ORQUESTRADOR; a tag-sentinela é injetada no fim deste prompt.

7. RESUMO FINAL: decisões de design tomadas (1 por linha) + PENDENTE-KAIRO (template Meta aprovado).
