---
id: FIX-82
titulo: "Guardar documento do cliente no NOSSO S3 (bucket dedicado) + tabela client_documents"
status: todo
bloco: bloco-a-documentos-cliente
arquivos:
  - src/db/schema.ts
  - src/lib/storage/index.ts
  - src/lib/documents/client-documents.ts
  - src/app/api/chat/document/route.ts
rodada: 2026-06-28 — alinhamento da jornada pós-descoberta (documentos como ativo nosso)
---

## Palavras do operador
> "sobre os documentos nós precisamos coletar os documentos do usuário de qualquer forma
> independente se for para Bevi ou se for pra fazer o processo manual da mesa (...) a gente
> precisa guardar eles e guardar também dentro da nossa parte ali de Kanban (...) porque o
> operador na mesa vai precisar disso."

## Cenário (estado atual — mapa 2026-06-28)
`document-upload.tsx` → base64 → `POST /api/chat/document` → `uploadContractDocument`
(`fulfillment.ts:202`) → `ConexiaDocsClient` → portal Bevi (indiky). O documento do cliente
**não passa pelo nosso S3**. O S3 que existe (`src/lib/storage/index.ts`, bucket
`aja-administradora-docs`) só serve docs de **administradoras**.

## Root cause (investigado)
Não há storage próprio nem registro do documento do cliente — é pass-through pra Bevi. Sem
tabela `client_documents`, sem s3Key, sem status. Depende 100% do Trilho A (travado).

## Correção proposta
| O quê | Onde |
|---|---|
| Bucket S3 DEDICADO de cliente + SSE-KMS (privado) + `getSignedDownloadUrl` (presign 5min) | `src/lib/storage/index.ts` (+ env `S3_CLIENT_DOCS_BUCKET`, `S3_CLIENT_DOCS_KMS_KEY`) |
| Tabela `client_documents` (ver shape no design §3.2): id, conversationId, leadId, contactId, slot, s3Bucket, s3Key, filename, mimeType, sizeBytes, status, dispatchStatus, dispatchTarget, dispatchedAt, beviRef, timestamps | `src/db/schema.ts` (drizzle migration via drizzle-kit; NUNCA rodar na mão — entrypoint) |
| Módulo `client-documents.ts`: `storeClientDocument({conversationId, slot, file, filename, mimeType})` → putObject (SSE) + insert (status=stored, dispatch=pending) → `{documentId}`; `listClientDocuments(leadId|conversationId)` | `src/lib/documents/client-documents.ts` (novo) |
| `/api/chat/document` grava no NOSSO S3 PRIMEIRO via `storeClientDocument` e responde `{ok, documentId}`; o envio à Bevi sai do caminho crítico (vira despacho FIX-84) | `src/app/api/chat/document/route.ts` |

Em dev usa MinIO local (cria bucket no boot). Bucket+KMS prod = **PENDENTE-KAIRO** (IaC).

## Regressão exigida
- **Camada 1 (structural):** schema tem `client_documents` com as colunas; `storeClientDocument`
  chama `putObject` no bucket de cliente (não no de administradora); `getSignedDownloadUrl` usa presign.
- **Integration:** `/api/chat/document` grava no S3 (MinIO/mock) + insere `client_documents`
  (status=stored, dispatch=pending) + responde `{ok, documentId}`. Não-agêntico → sem cassette.
