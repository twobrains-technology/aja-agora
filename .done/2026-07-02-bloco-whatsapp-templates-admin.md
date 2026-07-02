# Bloco — Admin de Message Templates WhatsApp (onda 2)

> 2026-07-02 · aja-agora · branch `feat/whatsapp-templates-admin` · FIX-204 + FIX-205

## O que entregou (visão de negócio)

O operador agora tem uma **tela de gestão dos modelos de mensagem oficiais do
WhatsApp** (`/admin/whatsapp/templates`). Dá pra cadastrar um modelo, submeter à
Meta com um clique, acompanhar o status até "Aprovado" (ou ver o motivo da
rejeição) e dizer **onde cada mensagem é usada** na jornada — tudo sem depender de
deploy ou de alguém editar código.

Isso destrava a confirmação de contratação **web→WhatsApp** fora da janela de 24h:
quando o cliente fecha pela web e nunca abriu conversa no WhatsApp, só um template
aprovado pode iniciar a mensagem. Este bloco é a porta de entrada desses templates.

## Como funciona

- **Cadastro → submissão → acompanhamento**: cria rascunho (DRAFT), submete à Meta
  (vira "Em análise"), e o status caminha até "Aprovado"/"Rejeitado". Botão de
  **sincronizar status** força a reconciliação sob demanda.
- **Vínculo por chave lógica (`usageKey`)**: o código dispara por uma chave estável
  (ex. `confirmacao_contratacao`); o admin liga essa chave ao template Meta aprovado.
  Trocar a copy/versão do template não exige subir código.
- **Rede de segurança da Meta**: falha na submissão mantém o template como rascunho
  com o erro visível — nunca finge que foi enviado. Depois de submetido, a copy fica
  travada (imutável na Meta); só o vínculo `usageKey` continua editável.

## Decisões de design tomadas

- **D1 — `usageKey` opcional no cadastro, editável depois** (confirmado com o Kairo).
  Casa com o schema (nullable, único-quando-setado) e permite preparar uma v2 antes
  de aposentar a v1. Obrigatórios no form: `metaName`, `category`, corpo.
- **D2 — rota `PATCH [id]`** para editar o vínculo/rascunho: `usageKey` sempre;
  conteúdo só enquanto DRAFT.
- **D3 — `submit` só a partir de DRAFT**; falha da Meta mantém DRAFT (sem PENDING falso).
- **D4 — `sync` = sync-all** contra o backend (seam nível 3 — ver gaps).
- **D5 — UI** com componentes shadcn já instalados, espelhando o padrão de
  `administradoras/`; página sob `(dashboard)` pra herdar o shell/sidebar.

(Detalhe em `docs/correcoes/decisions/2026-07-02-bloco-whatsapp-templates-admin.md`.)

## Qualidade

- **`pnpm test:unit` verde** validado em container transitório: 249 arquivos,
  **2497 testes** (inclui os novos: schema/builder, mapa status→badge, guard
  estrutural das 4 rotas, render RTL da tabela).
- **Integração das rotas** (DB real, cliente Meta mockado): **10/10** — criar draft,
  submeter→PENDING+metaTemplateId, falha→DRAFT+erro (sem PENDING falso), 409 de
  re-submissão, rebind de `usageKey` fora de DRAFT, 409 de conteúdo pós-submit, sync.
- Sem cassette (Camada 2): feature não-agêntica — nenhum comportamento da LLM muda
  (conforme a spec).

## Gaps honestos / pendências de merge

- **SEAM nível 3 — STUB `TODO(bloco-backend)`**: a rota
  `src/app/api/admin/whatsapp/templates/sync/route.ts` chama
  `reconcileTemplateStatuses()` via **stub local** (`return { updated: 0 }`), porque o
  arquivo real `src/lib/whatsapp/template-sync.ts` é do **bloco backend** e não existe
  neste worktree (evita conflito de arquivo). **No merge**, o orquestrador (backend
  entra ANTES) troca o stub pelo import real
  `import { reconcileTemplateStatuses } from "@/lib/whatsapp/template-sync"` e remove a
  função stub.
- **WABA ID real** (`WHATSAPP_WABA_ID`) segue PENDENTE-KAIRO na spec — a submissão real
  à Meta depende disso; os testes usam a Graph mockada.
- Sync **per-template** (`[id]/sync`) ficou fora de escopo (o bloco só previa sync-all).
