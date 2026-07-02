---
id: FIX-197
titulo: "Tela admin /admin/whatsapp/templates (shadcn/studio Pro)"
status: todo
severidade: media
projeto: aja-agora
arquivos:
  - src/app/admin/whatsapp/templates/page.tsx
  - src/app/admin/whatsapp/templates/
rodada: 2026-07-02 — feature cadastro/envio de Message Templates Meta oficial
---
## Palavras do operador
> "temos q ter o cadastro ... e sempre atualizarmos seu status até ficar aprovada.
> depois temos que falar onde essa mensagem é usada."

## Cenário exato
- **Rota/tela:** `/admin/whatsapp/templates`.
- **Passos:** 1) operador vê a lista de templates com o status de cada um; 2) cria um novo
  (define `usageKey`, categoria, corpo com variáveis); 3) submete à Meta; 4) acompanha o
  status virar `APPROVED` (ou vê o motivo da rejeição); 5) sincroniza sob demanda.

## Esperado × Atual
- **Esperado:** tela de gestão com badge de status, form de criação e ações submeter/sincronizar.
- **Atual:** inexistente.

## Root cause (INVESTIGADO)
Não há tela de templates (mapa do Explore, 2026-07-02). A gestão do vínculo `usageKey`→template
(decisão de design travada) precisa de UI: é aqui que o operador "diz onde a mensagem é usada".

## Correção proposta (o quê × onde)
| O quê | Onde |
|-------|------|
| Lista de templates com badge de status (DRAFT/PENDING/APPROVED/REJECTED/…) + `rejectionReason` visível + `usageKey` | `src/app/admin/whatsapp/templates/page.tsx` |
| Form de criação: `usageKey`, `metaName`, `category` (select), `language`, corpo (BODY) com variáveis `{{1}}`, HEADER/FOOTER opcionais | componentes da tela |
| Ações: "submeter à Meta" (chama `[id]/submit`), "sincronizar status" (chama `sync`) | componentes da tela |
| **Blocos shadcn/studio Pro via MCP** (Badge/Table/Card/Input/Button, inspiração `application-shell`) — NÃO criar do zero | toda a UI |

## Regressão exigida
Camada 1 onde couber (render/estado): a lista renderiza status como badge; o form valida campos
obrigatórios (usageKey, metaName, category, corpo); ações chamam as rotas certas. Prioridade nos
testes de rota (FIX-196); teste de UI leve o suficiente pra pegar regressão de comportamento.
Sem cassette.
