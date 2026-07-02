# Roteiro de QA — Aja Agora (dono do produto)

> Fonte da verdade do fluxo de negócio para o QA manual crítico (skill `qa-dono-produto`).
> A jornada do cliente é regida por `docs/jornada/jornada-canonica.md`. Este roteiro cobre,
> por ora, a **seção do FUNIL DE LEADS no /admin** (kanban, visão de contato, dashboard).
> Semeado na rodada 2026-07-02 (QA em PRODUÇÃO contra https://ajaagora.com.br).

## Ambiente e acesso

- **Prod:** https://ajaagora.com.br · Admin em `/admin` (login `/admin/login`).
- **Credenciais admin de prod:** fora do repo (arquivo `qa-admin-prod.md` anexado à sessão;
  nunca commitar). `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- **Contas de teste do cliente:** `secrets.sh decrypt contas-teste` (CONTA1 = Kairo CPF/celular).
  Bevi/Conexia é **homologação** — simular/fechar é seguro. Só necessário se a rodada exercitar
  a jornada do cliente ponta-a-ponta (o QA de funil admin é read-only e dispensa).
- **DB prod (`postgres-prod` MCP):** exige rota de rede/VPN; na rodada 2026-07-02 estava
  inacessível (ETIMEDOUT) — verificações feitas pela API/UI do admin.

## Escopo padrão desta seção: FUNIL DE LEADS

### As raias (fonte: `docs/jornada/proposta-funil-contatos-retorno.md`, Parte 2)

Ordem canônica forward-only. **Prod tem 10 colunas** (evoluiu além do branch `qa/funil`, que
tem 9 em `src/lib/admin/lead-stages.ts` — prod inseriu `Em Atendimento` entre `Na Administradora`
e `Aguardando Pagamento`):

1. Novo · 2. Engajado · 3. Qualificado · 4. Em Negociação · 5. Proposta Enviada ·
6. Na Administradora · 7. **Em Atendimento** · 8. Aguardando Pagamento · 9. Fechado Ganho · 10. Perdido

Transições **automáticas** (actor `system`) por evento da jornada:
`Novo→Engajado` (contact-capture/simulate), `Engajado→Qualificado` (recommend_groups),
`Qualificado→Proposta Enviada` (createBeviProposal, FIX-48). Raias 6-10 dependem de **polling**
Conexia (mesa manual + boleto) — sem webhook.

### Cenários e critérios de aceite

| # | Cenário | Critério de aceite | Status 2026-07-02 |
|---|---|---|---|
| F1 | Colunas presentes e rotuladas | 10 raias na ordem canônica, labels com acento | ✅ (labels do kanban OK, ex.: "Em Negociação") |
| F2 | Transições automáticas | `lead_events` mostra Novo→Engajado→Qualificado→Proposta como `system` | ✅ (tab Funil do contato) |
| F3 | Forward-only / regressão | Drag não regride silenciosamente; sinaliza regressão | ⚠️ NÃO VALIDADO (evitado em prod p/ não mutar dados reais) |
| F4 | Dedup por contato | 1 contato (mesmo phone/CPF) = 1 card, na raia mais avançada | ✅ p/ leads com contactId; ⚠️ legado sem contactId não deduplica (ver D-contatos) |
| F5 | Unificação cross-channel | web + WhatsApp do mesmo cliente sob 1 contato | ⚠️ risco de normalização de telefone (ver D-contatos) |
| F6 | Visão do contato (timeline) | timeline única cross-channel, CPF mascarado | ✅ (CPF `***.***.xxx-xx`) |
| F7 | Visão do contato (propostas) | lista propostas c/ admin, crédito, parcela, status, PDF, "Atual" destacada | ⚠️ funciona, mas valores/status crus (ver D-copy-propostas) |
| F8 | Visão do contato (funil) | histórico de `lead_events` com quem/quando | ✅ |
| F9 | Filtro por canal | Todos/Web/WhatsApp filtra o board | ✅ (label do trigger cru — ver D-combobox) |
| F10 | Busca por nome/telefone | filtra o board client-side | ✅ |
| F11 | Dashboard funil | métricas e "Funil de Conversão" corretos | ❌ deltas malformados + copy (ver D-dashboard) |

## Não-bugs conhecidos (decisões / gaps documentados)

- **Raias 6-10 vazias** — dependem de polling Conexia (homolog); gap conhecido (proposta Parte 2).
- **Leads anônimos (nome sem phone/CPF) não deduplicam** — por design (proposta Parte 1).
- **Várias conversas do mesmo CPF sob 1 contato** com nomes diferentes (Mirella/Kairo/Diego no
  mesmo CPF de teste) — correto: unificação por telefone/CPF.
- **"Em Atendimento"** existe em prod e não neste branch — prod está à frente; não é bug.
- **Mensagens de erro gracioso do agente** ("Tive um problema... pode tentar de novo") na timeline
  — degradação esperada da homolog Bevi/Conexia.

## Como dirigir (resumo operacional)

1. Login `/admin/login`; kanban em `/admin/pipeline`; dashboard em `/admin`.
2. Dados do board: `GET /api/admin/leads` (retorna `{leads:{<stage>:[...]}}`; query-params
   `channel`/`q` são **ignorados server-side** — o filtro é **client-side**).
3. Painel do contato: clicar um card (deep-link `?lead=<id>` **não** abre o painel — bug menor).
   Tabs: Timeline · Propostas · Funil.
4. Evidência de UI: preferir **screenshot**; contagens via `evaluate` logo após digitar podem
   ler o DOM antes do re-render (falso "0 cards").
