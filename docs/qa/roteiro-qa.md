# Roteiro de QA — Aja Agora (dono-de-produto)

> Fonte de verdade do fluxo de negócio para o método `qa-dono-produto`. A jornada
> canônica do cliente vive em `docs/jornada/jornada-canonica.md` (regra do produto);
> este roteiro operacionaliza o QA manual crítico. Criado em 2026-07-02 (rodada de
> templates de WhatsApp) — **parcial**: só a seção de Templates está preenchida de
> verdade; as demais seções da jornada são a preencher em rodadas futuras.

## Ambiente

- **PROD:** https://ajaagora.com.br. Deploy Docker/VPS atrás de Cloudflare.
- **Admin:** `/admin/login`. Credenciais de QA em arquivo anexado/efêmero (NÃO commitar).
- **DB prod:** MCP `postgres-prod` — atenção: pode dar `ETIMEDOUT` de fora da rede (túnel).
- **Contas de teste cliente:** `secrets.sh decrypt contas-teste` (CONTA1 = Kairo, CPF/celular reais de homologação Bevi/Conexia). Nunca inventar CPF.
- **Gate de merge do projeto:** `pnpm test:unit` (NÃO typecheck — dívida na develop).

## Feature: Templates de WhatsApp (Meta oficial)

Rota: `/admin/whatsapp/templates`. Spec: `docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md`.
Blocos: FIX-199..205. Envs: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_WABA_ID` (criar/listar template é no WABA), `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.

### Ciclo esperado (critérios de aceite verificáveis)
1. **Criar rascunho:** `POST /api/admin/whatsapp/templates` → 201; linha na tabela com status "Rascunho" (DRAFT). metaName/categoria/idioma/corpo exibidos. usageKey opcional, único-quando-setado.
2. **Submeter à Meta:** `POST .../{id}/submit` → bate em `POST /{WABA_ID}/message_templates`; sucesso persiste `metaTemplateId` + `status=PENDING` (UI "Em análise") + `submittedAt`. Falha da Meta (4xx/5xx) → mantém DRAFT + grava `rejectionReason` (visível) + responde **502 JSON com `message`** (nunca PENDING falso). Re-submeter fora de DRAFT = 409.
3. **Acompanhar status:** transição DRAFT→PENDING→APPROVED/REJECTED via (a) webhook `message_template_status_update` e (b) botão "Sincronizar status" (`POST .../sync` → `listTemplates()` reconcilia). Sem refresh manual.
4. **Conteúdo imutável após submit:** editar fora de DRAFT só permite ajustar usageKey; copy/categoria travadas.
5. **Envio na jornada:** `resolveAndSend(usageKey,...)` — janela 24h aberta → texto livre rico; fechada + APPROVED → `sendTemplate`; fechada + não-aprovado → enfileira em `whatsappOutboundQueue` + flush ao aprovar.

### Seletores/dados
- Botões: "Novo template", "Sincronizar status", "Ações" (por linha) → "Editar"/"Submeter à Meta".
- Form: Chave de uso, Nome na Meta (snake_case), Categoria (UTILITY/MARKETING/AUTHENTICATION), Idioma (pt_BR), Cabeçalho, Corpo (BODY, `{{n}}`), Rodapé.
- Categorias: `TEMPLATE_CATEGORIES` em `src/lib/validations/whatsapp-template.ts`.

### Não-bugs conhecidos
- Nome na Meta e usageKey exigem snake_case (regra da Meta) — validação intencional.
- Dialog de submit permanece aberto em caso de erro (o toast de erro aparece na área da linha) — comportamento atual; ver melhoria proposta.

### Achados 2026-07-02 (rodada PROD)
- ✅ **Criar rascunho** funciona (201, UI e PT-BR corretos).
- ❌ **Submeter à Meta** → 502 do Cloudflare (às vezes travando ~30s+), nunca chega a PENDING. Card: `docs/correcoes/inbox/2026-07-02-whatsapp-template-submit-sync-quebrados-prod.md`.
- ❌ **Sincronizar status** → 500 body-vazio.
- ⚠️ RSC prefetch de `/admin/settings` e `/admin/profile` retorna 404 (secundário, fora de escopo — verificar se as páginas existem em prod).

## Jornada do cliente (a preencher)
Ver `docs/jornada/jornada-canonica.md`. Seções a operacionalizar aqui em rodadas futuras:
descoberta (chat) → recomendação → simulador (passo 4) → auth progressiva → fechamento → confirmação cross-canal WhatsApp.
