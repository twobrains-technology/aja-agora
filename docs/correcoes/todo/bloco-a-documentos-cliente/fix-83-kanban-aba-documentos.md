---
id: FIX-83
titulo: "Aba 'Documentos' no Kanban (lead-detail) com download seguro pro operador"
status: todo
bloco: bloco-a-documentos-cliente
arquivos:
  - src/components/admin/pipeline/lead-detail-panel.tsx
  - src/app/api/admin/documents/[id]/download/route.ts
  - src/lib/documents/client-documents.ts
rodada: 2026-06-28 — alinhamento da jornada pós-descoberta (documentos como ativo nosso)
---

## Palavras do operador
> "guardar também dentro da nossa parte ali de Kanban (...) porque o operador na mesa vai
> precisar disso."

## Cenário (estado atual)
`lead-detail-panel.tsx` tem abas "Conversa" e "Insights" — **não há aba de documentos**.
O upload é silencioso (sem artifact no timeline). O operador teria que entrar no portal Bevi
na mão pra ver o documento do cliente.

## Root cause (investigado)
Nenhuma UI admin lista/baixa os documentos do cliente; o dossiê de transbordo
(`mesa/outbound.ts`) exclui docs por LGPD. O operador não tem acesso pelo painel.

## Correção proposta
| O quê | Onde |
|---|---|
| Nova aba "Documentos" no lead-detail listando os `client_documents` do lead (slot, filename, status, dispatch) | `src/components/admin/pipeline/lead-detail-panel.tsx` (consome `listClientDocuments` do FIX-82) |
| Endpoint admin de download protegido (sessão de operador) que gera URL pré-assinada curta + registra audit (quem baixou, quando) — nunca expõe key/bucket | `src/app/api/admin/documents/[id]/download/route.ts` (novo) |

⚠️ Conflito nível 2 com bloco-b no mesmo arquivo (`lead-detail-panel.tsx`): abas diferentes.
Quem mergear depois resolve (mesma estrutura de Tabs).

## Regressão exigida
- **Camada 1:** o endpoint de download exige sessão de admin (401 sem auth) e gera URL assinada
  (não retorna o objeto direto); a aba "Documentos" referencia `listClientDocuments`.
- **Integration:** operador autenticado baixa → recebe URL assinada de curta expiração; sem
  auth → 401. Não-agêntico → sem cassette.
