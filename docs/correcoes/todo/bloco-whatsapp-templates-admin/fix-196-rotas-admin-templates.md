---
id: FIX-196
titulo: "Rotas admin de templates: listar/criar/submeter/sincronizar"
status: todo
severidade: alta
projeto: aja-agora
arquivos:
  - src/app/api/admin/whatsapp/templates/route.ts
  - src/app/api/admin/whatsapp/templates/[id]/submit/route.ts
  - src/app/api/admin/whatsapp/templates/sync/route.ts
rodada: 2026-07-02 — feature cadastro/envio de Message Templates Meta oficial
---
## Palavras do operador
> "temos q ter o cadastro e envio de modelos de mensagens ao whatsapp meta oficial ...
> e sempre atualizarmos seu status até ficar aprovada."

## Cenário exato
- **Rota/tela:** backoffice admin.
- **Passos:** 1) operador cria um template (draft); 2) submete à Meta; 3) acompanha status;
  4) pode forçar uma sincronização.
- **Dados usados:** `whatsappTemplates`, `createTemplate`/`listTemplates` (api.ts).

## Esperado × Atual
- **Esperado:** rotas admin GET (lista), POST (cria draft), `[id]/submit` (submete à Meta), `sync` (reconcilia).
- **Atual:** inexistentes — não há como cadastrar/submeter/consultar templates.

## Root cause (INVESTIGADO)
Não existe nenhuma rota nem tela de gestão de templates (mapa do Explore, 2026-07-02). A
única rota que menciona `templateName` é `admin/conversations/[id]/message/route.ts:113`
(chat do Kanban, exige nome de template quando a janela fecha) — mas o nome vem "do nada"
(PENDENTE-KAIRO). Este item cria a fonte desse nome.

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| GET (lista `whatsappTemplates`) + POST (cria draft com `usageKey`, `metaName`, `category`, `language`, `components`) | `src/app/api/admin/whatsapp/templates/route.ts` |
| POST submit: chama `createTemplate` → persiste `metaTemplateId`+`status=PENDING`; falha da Meta → mantém `DRAFT` com erro (não `PENDING` falso) | `.../[id]/submit/route.ts` |
| POST sync: chama `reconcileTemplateStatuses()` (STUB nível 3 `TODO(bloco-backend)` — não criar template-sync.ts aqui) | `.../sync/route.ts` |
| Todas protegidas por role admin (mesmo guard das rotas admin existentes) | as 3 rotas |

## Regressão exigida
Camada 1 (integração das rotas, `createTemplate` mockado + DB de teste):
- POST cria draft; GET lista; `[id]/submit` chama `createTemplate` e grava `metaTemplateId`+`PENDING`;
- submit com falha da Meta mantém `DRAFT` e retorna erro (não grava `PENDING`);
- rota sem sessão admin → 401/403;
- `sync` chama a função de reconciliação (stub) e responde ok.
Sem cassette.
