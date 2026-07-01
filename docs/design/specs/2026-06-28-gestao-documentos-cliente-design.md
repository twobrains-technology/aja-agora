# Design — Gestão de documentos do cliente (S3 nosso = fonte da verdade)

> 2026-06-28 · Pré-requisito do fechamento via Trilho B. Decisão do Kairo: o
> documento do cliente é um ATIVO NOSSO (coletado, guardado, vinculado ao cliente
> no Kanban, acessível pro operador da mesa), **independente do destino** (Bevi
> Trilho A, B, ou processo manual da mesa).

## 1. Problema (estado atual — mapa 2026-06-28)

Hoje o documento do cliente é **pass-through puro pra Bevi/CONEXIA**:
- **(a)** Não é guardado no nosso S3. `document-upload.tsx` → base64 → `/api/chat/document`
  → `uploadContractDocument` → `ConexiaDocsClient` → portal Bevi (indiky). O S3 que existe
  (`src/lib/storage/index.ts`, bucket `aja-administradora-docs`) só serve docs de
  **administradoras**, nunca de cliente.
- **(b)** Vínculo mínimo no DB: só URLs do portal em `bevi_proposals.documentsLinkPersonal/Address`.
  Sem registro do arquivo, slot, timestamp, status.
- **(c)** Operador não vê: `lead-detail-panel.tsx` não tem aba de docs; upload é silencioso
  (sem artifact no timeline); dossiê de transbordo (`mesa/outbound.ts`) exclui docs por LGPD.
- **(d)** Depende 100% do Trilho A (CONEXIA) — que está **travado** (productId, pendência AGX).
  Sem Bevi, o KYC não tem onde cair.

## 2. Decisões (Kairo, 2026-06-28)

1. **Segurança PII:** bucket DEDICADO + SSE-KMS + download só via URL pré-assinada de curta
   expiração + acesso restrito a operador autenticado + log de acesso.
2. **Escopo:** completo (storage + tabela + UI no Kanban + despacho desacoplado pra Bevi B).
3. **Arquitetura:** nosso S3 + vínculo no DB são a FONTE DA VERDADE; o envio ao destino
   (Bevi A/B ou mesa manual) é um CONSUMIDOR best-effort, nunca um bloqueador.

## 3. Arquitetura

```
 coleta (chat, KYC: RG/CNH frente+verso + comprovante)
      │  POST /api/chat/document  {conversationId, slot, fileBase64, filename, mimeType}
      ▼
 [1] grava no NOSSO S3 (bucket dedicado, SSE-KMS)        ← fonte da verdade
      │
 [2] registra em client_documents (vínculo lead/contact/conversation, status=stored)
      │  responde { ok, documentId }  (NÃO espera o despacho)
      ▼
 [3] despacho best-effort (consumidor, assíncrono/sob demanda)
      ├─ Bevi Trilho B → step documentoPessoal/comprovanteDeEndereco (portal CONEXIA)
      ├─ Bevi Trilho A → ConexiaDocsClient (indiky)   [travado hoje]
      └─ mesa manual    → operador assume pelo Kanban
      │  atualiza dispatch_status (pending|sent|failed|manual) — falha NÃO perde o doc
      ▼
 [4] Kanban (lead-detail-panel): aba "Documentos" lista + download via URL assinada
      (operador vê/baixa SEMPRE, mesmo com a Bevi travada)
```

### 3.1 Storage (`src/lib/storage`)
- **Bucket dedicado** pra docs de cliente (ex.: `aja-client-docs-{env}`), separado de
  `aja-administradora-docs`. **SSE-KMS** (chave dedicada). Bucket privado (sem ACL pública).
- Key: `clients/{leadId|conversationId}/{slot}/{uuid}.{ext}`.
- Reusa o client S3 existente (`putObject`/`getObject`) + adiciona `getSignedDownloadUrl`
  (presign, expiração curta — 5 min).
- **Infra (dependência IaC):** o bucket dedicado + KMS key + policy de acesso (task role
  pode `PutObject`/`GetObject` só nesse bucket) precisam ser provisionados dev/prod
  (Terraform — regra TwoBrains; a infra de administradora-docs serve de molde).

### 3.2 DB — nova tabela `client_documents`
```
id              uuid pk
conversationId  uuid fk → conversations
leadId          uuid fk → leads        (nullable até o lead existir)
contactId       uuid fk → contacts     (nullable)
slot            text  (identidade_frente | identidade_verso | comprovante_endereco)
s3Bucket        text
s3Key           text
filename        text
mimeType        text
sizeBytes       integer
status          text  (stored)                       -- estado do ATIVO nosso
dispatchStatus  text  (pending | sent | failed | manual)  -- estado do despacho
dispatchTarget  text  (bevi_b | bevi_a | mesa | null)
dispatchedAt    timestamptz null
beviRef         jsonb null   -- sectionId/documentId quando enviado à Bevi
createdAt / updatedAt
```
Índice por `leadId` e `conversationId` (Kanban lista por cliente).

### 3.3 Coleta — `/api/chat/document` (refactor)
- Decode base64 (limite 8 MB mantido) → `putObject` no bucket de cliente (SSE) →
  insert `client_documents` (status `stored`, dispatch `pending`) → responde `{ ok, documentId }`.
- **Não** chama mais o `uploadContractDocument`/CONEXIA no caminho crítico — isso vira despacho.

### 3.4 Despacho — `dispatchClientDocument(documentId, target)`
- Lê o doc do S3 nosso → envia ao destino conforme `target`/gateway ativo:
  - `bevi_b`: step de doc do self-contract (validar ao vivo o portal CONEXIA do Trilho B).
  - `bevi_a`: `ConexiaDocsClient` (atual).
  - `mesa`: no-op de envio (fica `manual`; operador assume).
- Best-effort: falha → `dispatchStatus=failed` + log; o doc continua `stored` e acessível.

### 3.5 Admin/Kanban — aba "Documentos" no `lead-detail-panel`
- Nova aba lista os `client_documents` do lead (slot, filename, status, dispatch).
- Download via endpoint admin protegido (sessão de operador) que gera URL assinada curta;
  registra audit (quem baixou, quando). Nunca expõe a key/bucket direto.

## 4. Segurança (PII de identidade)
- Bucket privado + SSE-KMS; task role com acesso mínimo só ao bucket de cliente.
- Download exclusivamente via URL pré-assinada de curta expiração, atrás de auth de admin.
- Audit log de acesso a documento (operador, documentId, timestamp).
- Transbordo (`mesa/outbound.ts`) continua NÃO trafegando o doc por WhatsApp — o operador
  acessa pelo painel (isso já é a convenção; agora o painel realmente tem o doc).

## 5. Testes
- **Unit:** geração de key; `getSignedDownloadUrl` (presign + expiração); validação do endpoint.
- **Integration:** `/api/chat/document` grava S3 (mock/minio) + insere `client_documents`;
  `dispatchClientDocument` atualiza status (sucesso/falha sem perder o doc); endpoint de
  download admin exige sessão + gera URL assinada.
- **Camada agent:** upload NÃO é agêntico (route HTTP puro) → Camada 1 structural basta
  (sem cassette).
- **E2E:** upload no chat → aparece no Kanban do operador → download funciona; Bevi travada
  não impede a coleta nem o acesso.

## 6. Riscos / dependências
- **Infra:** bucket dedicado + KMS + policy a provisionar (IaC) antes do deploy prod.
- **Trilho B doc step:** o despacho `bevi_b` precisa do fluxo de upload do self-contract
  (portal CONEXIA com `documentsToken`) validado ao vivo — capturar antes de implementar [3] bevi_b.
- **Migração:** os docs já enviados (só links em `bevi_proposals`) não retroagem pro novo
  modelo; vale a partir da feature (sem backfill).

## 7. Fora de escopo
- Backfill de documentos antigos. OCR/validação automática de documento. Versão final do
  fechamento via Trilho B (esta feature é o PRÉ-REQUISITO de documentos; o fechamento via B
  é a próxima etapa e consome o `dispatchClientDocument(bevi_b)`).
