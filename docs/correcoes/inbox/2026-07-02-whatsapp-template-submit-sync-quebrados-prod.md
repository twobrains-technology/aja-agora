# Bug — Submeter à Meta (502) e Sincronizar status (500) quebrados em PRODUÇÃO

- **Data:** 2026-07-02 (QA dono-de-produto em PROD, https://ajaagora.com.br)
- **Origem:** feature Templates de WhatsApp / Meta (FIX-199..205, spec `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md`). WABA real `2536995250087380` supostamente já configurado em prod.
- **Severidade:** ALTA / bloqueador — o ciclo criar→submeter→acompanhar status **não completa** em produção. O passo de criação funciona; a integração com a Meta (submeter + sincronizar) falha.

## Cenário (reproduzido em PROD)
1. Login em `/admin/login` (admin@ajaagora.com.br) → OK.
2. `/admin/whatsapp/templates` → "0 templates".
3. **Novo template** → preenchido: usageKey `confirmacao_contratacao_qa`, metaName `aja_confirmacao_contratacao_qa`, categoria UTILITY, idioma pt_BR, header "Aja Agora", corpo "Olá {{1}}, sua contratação do consórcio foi confirmada! 🎉 Em breve você recebe os detalhes por aqui.", rodapé "Time Aja Agora" → **Criar rascunho**.
   - `POST /api/admin/whatsapp/templates` → **201**. Linha aparece com status "Rascunho". ✅
4. **Ações → Submeter à Meta → Submeter**.
   - `POST /api/admin/whatsapp/templates/{id}/submit` → **502**. Toast: "Falha ao submeter: HTTP 502". Template **continua "Rascunho"**.
5. **Sincronizar status** (botão do topo).
   - `POST /api/admin/whatsapp/templates/sync` → **500**, body vazio.

## Esperado × Atual
- **Esperado:** submit chega em `POST /{WABA_ID}/message_templates` da Meta e persiste `metaTemplateId` + `status=PENDING` (spec §Norte critério 1). Sync chama `listTemplates()` e reconcilia (critério 2). Em falha, a app devolve **502 JSON com o motivo real da Meta** (submit route tem try/catch que grava `rejectionReason` e retorna `{ error, message }`).
- **Atual:**
  - **submit → 502 do Cloudflare** (`content-type: text/html`, página "502: Bad gateway" da Cloudflare). A origem **não devolveu resposta válida** — logo o try/catch da rota **não chegou a executar** (senão viria 502 JSON com `message`). Comportamento **instável**: nas 2 primeiras tentativas travou ~30s+ (timestamps de console 144416ms e 174530ms), numa 3ª tentativa falhou rápido (~62ms).
  - **sync → 500** rápido (~61ms), body vazio, `content-type: null` = exceção não tratada na rota (sync route **não** tem try/catch). `reconcileTemplateStatuses()` chama `listTemplates()` como 1ª linha → `getWabaConfig()` lança se `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_WABA_ID` faltarem/inválidos.

## Evidência
- Screenshot: `docs/correcoes/inbox/_evidencia/2026-07-02-whatsapp-template-submit-502.png` (toast "Falha ao submeter: HTTP 502" + linha em Rascunho).
- Rede (Playwright): `POST .../submit => 502`, `POST .../sync => 500`, `POST .../templates => 201`, `GET .../templates => 200`.
- Raw fetch de `/submit` → status 502, `content-type: text/html`, corpo = `<title>ajaagora.com.br | 502: Bad gateway</title>` (Cloudflare).
- Raw fetch de `/sync` → status 500, `content-type: null`, corpo vazio, 61ms.
- Console: 2× ERROR 502 no submit (144s/174s), 1× ERROR 500 no sync.

## Hipóteses (NÃO confirmadas — DB/logs/env de prod inacessíveis desta sessão)
DB de prod dá `ETIMEDOUT` daqui; sem acesso a logs/env de prod. Candidatos a causa-raiz, a confirmar por quem tem acesso:
1. **`WHATSAPP_WABA_ID` e/ou `WHATSAPP_ACCESS_TOKEN` ausentes/inválidos em prod** → `getWabaConfig()` lança. Explica o 500 rápido do sync. (Se fosse só isso, o submit deveria devolver 502 **JSON** rápido, não o 502 HTML do Cloudflare — ver abaixo.)
2. **Egress do VPS pra `graph.facebook.com` bloqueado/lento** → o `fetch` de `createTemplate()` pendura até o Cloudflare cortar (502) — casa com os ~30s+ das 1ªs tentativas.
3. **Migrations parcialmente aplicadas em prod** (ex.: coluna `rejection_reason` / enum de status / tabela `whatsapp_outbound_queue` ausentes) → o `catch` do submit tenta `db.update(...).set({ rejectionReason })` e **também** falha, quebrando a resposta → Cloudflare vê resposta malformada → 502 HTML.
4. **Token sem permissão `whatsapp_business_management`** no WABA → Meta responde erro; mas isso normalmente é rápido, não trava.

A divergência submit(502 HTML, às vezes travando) × sync(500 limpo rápido) é o principal ponto a esclarecer com logs de prod.

## Onde mexe (provável)
- Config de prod: envs `WHATSAPP_WABA_ID`, `WHATSAPP_ACCESS_TOKEN` (validar valor + escopo do token). Deploy Docker/VPS.
- `src/app/api/admin/whatsapp/templates/sync/route.ts` — **falta try/catch**: hoje qualquer erro vira 500 body-vazio, sem mensagem acionável no admin. Deveria capturar e devolver `{ error, message }` (mesmo padrão do submit).
- `src/lib/whatsapp/api.ts` — `createTemplate`/`listTemplates` fazem `fetch` **sem timeout**: um egress pendurado leva a 502 do gateway em vez de erro rápido tratado. Adicionar `AbortSignal.timeout`.
- `src/components/admin/whatsapp-templates/template-row-actions.tsx` — quando a resposta não é JSON (502 do Cloudflare), o toast cai em "HTTP 502" genérico; considerar mensagem "serviço indisponível, tente novamente" + orientação.

## Observação de dado de teste
Ficou 1 template DRAFT de QA em prod: `aja_confirmacao_contratacao_qa` (usageKey `confirmacao_contratacao_qa`). Nunca foi enviado à Meta (submit falhou). Inerte, mas convém remover — não há ação de excluir na UI (só Editar/Submeter). Avaliar afordância de exclusão de rascunho.
