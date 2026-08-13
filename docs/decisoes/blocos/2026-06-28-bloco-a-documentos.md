# Decisão de Design — Gestão de documentos do cliente (bloco-a-documentos-cliente)

**Data:** 2026-06-28
**Status:** Implementado e commitado (FIX-82, FIX-83, FIX-84)
**Autor:** Bloco A executor
**Spec:** `docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md`

---

## Contexto

O design macro já estava fechado no spec (decisões do Kairo 2026-06-28: bucket
dedicado + SSE-KMS, S3 nosso como fonte da verdade, despacho best-effort). Só
havia decisão de design fina em aberto — nome exato do bucket/env, estrutura
da key, shape do audit de download, e alguns pontos de reuso de código que
surgiram na implementação. Registrados aqui.

## Decisões Tomadas

### 1. Nome dos envs novos e defaults

**Decisão:** `S3_CLIENT_DOCS_BUCKET` (default `aja-client-docs`) e
`S3_CLIENT_DOCS_KMS_KEY_ID` (sem default — vazio em dev).

**Razão:** segue a convenção já existente de `S3_BUCKET`/`S3_*` em
`src/lib/storage/index.ts` (molde de `aja-administradora-docs`), só
prefixando `CLIENT_DOCS` pra deixar explícito que é bucket separado. MinIO
local não tem KMS configurado — `kmsKeyId` indefinido em dev faz
`putObject` pular o `ServerSideEncryption: aws:kms` (sem isso o put falharia
contra o MinIO). Em prod, o valor real da key/ARN é PENDENTE-KAIRO (IaC).

### 2. Storage: generalizar o módulo existente em vez de duplicar

**Opções:**
- **A)** Generalizar `src/lib/storage/index.ts` — `StorageConfig` ganha
  `kmsKeyId?`, `getClientDocsStorageConfig()` novo, e `putObject`/`getObject`/
  `deleteObject`/`ensureBucket` passam a aceitar `cfg?: StorageConfig` opcional
  (default = config de administradora, mantendo compat com os chamadores
  existentes).
- **B)** Criar um módulo de storage TOTALMENTE separado só pra cliente.

**Decisão:** Opção A.

**Razão:** o próprio prompt do bloco apontou o storage de administradora-docs
como "o molde" — generalizar reaproveita `getClient`/cache de `S3Client`/
lógica de path-style vs virtual-hosted, e o bucket vira só mais um parâmetro
por chamada (nenhum client S3 novo, nenhuma duplicação de lógica de
credenciais). Duplicar o módulo criaria dois lugares pra manter a mesma lógica
de MinIO-vs-AWS-real.

### 3. Presign — nova dependência `@aws-sdk/s3-request-presigner`

**Decisão:** adicionada como dependency direta (não estava no projeto).

**Gotcha resolvido:** a versão default resolvida pelo pnpm não batia com
`@aws-sdk/client-s3` (diamante transitivo em `@aws-sdk/core`/`@smithy/core`),
gerando erro de `tsc`: *"Types have separate declarations of a private
property 'handlers'"* (S3Client de um lado, `Client<...>` esperado pelo
`getSignedUrl` do outro). Resolvido com `overrides` em `pnpm-workspace.yaml`
fixando `@aws-sdk/core` e `@smithy/core` numa única versão em toda a árvore.

### 4. Enums no schema (slot/status/dispatchStatus/dispatchTarget)

**Decisão:** todos os 4 campos viraram `pgEnum`, não texto livre.

**Razão:** o repo já usa esse padrão pra este tipo de coluna (`leadStageEnum`,
`administradoraDocTipoEnum`, `mesaHandoffStatusEnum`) — consistência > "é só
um valor por hora" (o enum de `status` só tem `"stored"` hoje, mas fica pronto
pra Postgres validar se algum dia crescer). `slot` reusa os mesmos 3 valores
já usados em `DocumentSlot` (`src/lib/adapters/proposal-gateway.ts`).

### 5. Audit de download: tabela dedicada `client_document_downloads`

**Opções:**
- **A)** Tabela append-only dedicada (`clientDocumentId`, `downloadedBy`,
  `createdAt`), mesma forma de `lead_events`/`memory_events`.
- **B)** Só um `console.log` estruturado (sem persistência).

**Decisão:** Opção A.

**Razão:** o repo já tem o padrão de tabela de audit trail append-only pra
eventos importantes (`lead_events` pro funil, `memory_events` pra memória) —
"acesso a PII de identidade" se qualifica igual. Log estruturado sozinho não é
consultável/auditável depois (quem baixou o RG de qual cliente, quando).

### 6. `dispatchClientDocument("bevi_a")`: reusa `uploadContractDocument`, não `ConexiaDocsClient` direto

**Decisão:** o branch `bevi_a` de `dispatch.ts` chama
`uploadContractDocument()` (já existente em `src/lib/bevi/fulfillment.ts`) em
vez de instanciar `ConexiaDocsClient`/`BeviApiAdapter` direto.

**Razão:** `uploadContractDocument` já encapsula EXATAMENTE a lógica que
`dispatch.ts` precisaria duplicar — resolver o gateway ativo, achar o link de
documento da proposta (`getLatestBeviProposal`), tratar o slot
`comprovante_endereco` vs identidade. Reimplementar isso em `dispatch.ts`
duplicaria uma lógica já testada (`fulfillment.test.ts`). `conexia-docs-client.ts`
(listado no escopo do FIX-84) acabou não precisando de nenhuma alteração —
o reuso em camada mais alta já fecha o contrato "bevi_a reusa ConexiaDocsClient
(fluxo atual)" pedido no card, só que através do fulfillment.ts em vez de
direto.

### 7. `documentId` inexistente: propaga erro (fail fast), não vira "failed" best-effort

**Decisão:** em `dispatchClientDocument`, buscar o documento
(`getClientDocumentFile`) acontece FORA do `try/catch` que absorve falha de
envio. Se o documento não existe, a função LANÇA — não retorna
`{dispatchStatus: "failed"}`.

**Razão:** a garantia "best-effort, nunca perde o documento" é sobre falha do
DESTINO (Bevi fora do ar, rede, etc.) — não sobre erro do CHAMADOR (passou um
`documentId` errado). Misturar as duas categorias mascararia bugs de
integração (ex.: bloco-c chamando com um id errado veria "failed" silencioso
em vez de um erro claro).

### 8. `/api/chat/document` NÃO dispara `dispatchClientDocument` automaticamente

**Opções:**
- **A)** Disparar `dispatchClientDocument(documentId, "bevi_a")` em
  fire-and-forget logo após `storeClientDocument`, preservando o auto-envio
  atual pro Trilho A quando ele está de pé.
- **B)** Não disparar nenhum chamador dentro deste bloco — `dispatch.ts` fica
  pronto como contrato, sem wiring automático.

**Decisão:** Opção B (revertida depois de testar a Opção A).

**Razão:** cheguei a implementar a Opção A, mas ela introduz uma condição de
corrida real nos testes de integração do FIX-82 (a resposta do POST volta
antes do fire-and-forget terminar de atualizar `dispatchStatus`, deixando
`pending` vs `failed` não-determinístico) — e o ganho é zero hoje: o próprio
spec confirma que **o Trilho A (CONEXIA) está travado** neste ambiente
("productId, pendência AGX"), então todo disparo automático falharia sempre,
só adicionando ruído/latência de background sem entregar nada. O escopo de
arquivos do FIX-84 no `_bloco.md` também só lista `dispatch.ts` +
`conexia-docs-client.ts` (não `route.ts`), reforçando que o wiring do
chamador é responsabilidade de um próximo passo (ação do operador no Kanban,
cron, ou o fechamento via Trilho B que o bloco-c está implementando em
paralelo com `target="bevi_b"`). `dispatchClientDocument` está pronto,
testado e exportado — só falta decidir e plugar o gatilho real quando fizer
sentido (ver Pendente-Kairo).

### 9. Contrato de resposta do `/api/chat/document` muda: `{ok, fallbackLink}` → `{ok, documentId}`

**Decisão:** a resposta deixa de esperar o resultado do upload à Bevi
(`fallbackLink`) e passa a refletir só a gravação no nosso S3
(`documentId`). Ajustado `document-upload.tsx` (frontend) e seu teste —
removida a UI de link de fallback (não existe mais um valor síncrono pra
mostrar).

**Razão:** consequência direta e OBRIGATÓRIA do design ("responde `{ ok,
documentId }` — NÃO espera o despacho", §3 do spec) — não dava pra manter o
endpoint gravando primeiro e ainda assim devolver o resultado síncrono do
envio à Bevi (isso seria voltar a bloquear no destino). Documento seguro no
Kanban (FIX-83) substitui a necessidade do link de fallback pro cliente —
o operador da mesa assume pelo painel em vez do cliente precisar de um link
externo.

---

## Arquivos Alterados

| Arquivo | Tipo | FIX |
|---|---|---|
| `src/db/schema.ts` | Adicionado — `client_documents`, `client_document_downloads` + 4 enums | 82 |
| `drizzle/0029_client_documents.sql` + `drizzle/meta/_journal.json` | Novo — migration à mão | 82 |
| `src/lib/storage/index.ts` | Generalizado — `StorageConfig.kmsKeyId`, `getClientDocsStorageConfig`, `getSignedDownloadUrl` | 82 |
| `src/lib/documents/client-documents.ts` | Novo — `storeClientDocument`/`listClientDocuments`/`getClientDocumentDownloadUrl`/`recordClientDocumentDownload`/`getClientDocumentFile` | 82 |
| `src/app/api/chat/document/route.ts` | Refatorado — grava no nosso S3 primeiro, responde `{ok, documentId}` | 82 |
| `src/components/chat/artifacts/document-upload.tsx` | Ajustado — contrato novo, sem fallback link síncrono | 82 |
| `src/app/api/admin/leads/[id]/documents/route.ts` | Novo — listagem (admin/viewer/attendant) | 83 |
| `src/app/api/admin/documents/[id]/download/route.ts` | Novo — presign + audit (admin only) | 83 |
| `src/components/admin/pipeline/client-documents-tab.tsx` | Novo — aba "Documentos" | 83 |
| `src/components/admin/pipeline/lead-detail-panel.tsx` | Atualizado — nova `TabsTrigger`/`TabsContent` | 83 |
| `src/lib/documents/dispatch.ts` | Novo — `dispatchClientDocument` | 84 |
| `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` | Dependency nova + overrides de versão AWS SDK | 82 |
| `.env.example` | Documentados `S3_CLIENT_DOCS_BUCKET`/`S3_CLIENT_DOCS_KMS_KEY_ID` | 82 |

---

## Pendente-KAIRO

| Item | Descrição |
|---|---|
| Bucket + KMS de PROD | Provisionamento IaC (Terraform) do bucket dedicado `aja-client-docs-{env}` + chave KMS + policy de acesso mínima (task role só `PutObject`/`GetObject` nesse bucket) — dev usa MinIO local sem KMS. |
| `bevi_b` ao vivo | Validar o fluxo real de upload do self-contract (portal CONEXIA do Trilho B, `documentsToken`) antes de tirar o stub `TODO(bevi_b)` de `dispatch.ts`. |
| Gatilho de `dispatchClientDocument` | Ninguém chama a função ainda em produção — decidir e plugar: ação do operador no Kanban ("despachar pra Bevi/mesa"), cron/fila, ou o fechamento via Trilho B do bloco-c (que já consome com `target="bevi_b"`). |
| `beviRef` (jsonb) | Coluna existe no schema mas fica `null` no envio `sent` — `ConexiaDocsClient.upload()`/`BeviApiAdapter.uploadDocument()` retornam `void` hoje, sem `sectionId`/`documentId` de volta. Preencher exigiria alterar esse retorno (fora do escopo deste bloco). |

---

## Regressão

- **Camada 1 (structural):** `storage/index.test.ts` (bucket dedicado, KMS opcional), `route.guard.test.ts` (admin-only no download).
- **Integration (DB real):** `chat/document/route.integration.test.ts` (grava S3+DB, resolve leadId), `admin/documents/[id]/download/route.integration.test.ts` (401 sem sessão, presign+audit, DTO sem s3Bucket/s3Key), `dispatch.integration.test.ts` (mesa/bevi_b stub/bevi_a sucesso+falha+exceção, documento inexistente propaga).
- Não-agêntico (rotas HTTP puras, sem `streamText`) → sem cassette de Camada 2.

---

## Commits

```
test+feat: guarda documento do cliente no nosso S3 (bucket dedicado + client_documents)
test+feat: aba Documentos no Kanban com download seguro pro operador
test+feat: despacho desacoplado do documento do cliente (dispatchClientDocument)
docs: decisão de design bloco-a-documentos — storage, audit, reuso e wiring
```

---

**Conclusão:** os 3 itens fecham a base "coletar → guardar → operador vê →
despachar" com o nosso S3 como fonte da verdade, independente da Bevi estar
no ar. `dispatchClientDocument` está pronto e testado como contrato pro
bloco-c consumir — falta só decidir o gatilho de produção quando fizer
sentido (Trilho B ao vivo ou ação manual do operador).
