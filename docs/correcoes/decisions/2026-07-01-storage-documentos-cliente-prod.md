---
data: 2026-07-01
bloco: hotfix-infra
item: upload-documento-cliente-prod
status: resolvido
decisor: Kairo (via sessão — "resolve imediatamente dev e prod")
---

# Correção — upload de documento de cliente quebrado em prod (e dev): infra de storage nunca provisionada

## Sintoma

Upload de RG/CNH do cliente (card "Envie seu documento", Passo 6 / KYC) falhava
em **produção** — o slot não concluía. Reportado pelo Kairo com screenshot da UI.

## Causa-raiz (com evidência)

O upload do cliente grava num bucket S3 **dedicado** com SSE-KMS
(`getClientDocsStorageConfig` → `storeClientDocument` → `putObject`), separado do
bucket da administradora (`aja-agora-docs-*`). Esse bucket + KMS + IAM + env eram
`PENDENTE-KAIRO` desde o FIX-82 (ver comentário em `src/lib/storage/index.ts`) e
**nunca foram provisionados** — em **nenhum** dos dois ambientes.

Sem o env `S3_CLIENT_DOCS_BUCKET`, o código caía no default `aja-client-docs`,
que não existia. Fluxo do erro:

```
putObject → ensureBucket → HeadBucket "aja-client-docs" → 404 (não existe)
          → CreateBucket "aja-client-docs" → AccessDenied
          → rota /api/chat/document responde 422
```

Log real de prod (`/ecs/tb/prod`, stream `aja-agora/aja-agora/…`):

```
[storage] falha ao criar bucket: User: arn:aws:sts::438465163995:assumed-role/
ecs-task-aja-agora-prod/… is not authorized to perform: s3:CreateBucket on
resource: "arn:aws:s3:::aja-client-docs" because no identity-based policy allows
the s3:CreateBucket action
```

Estado antes do fix (dev **e** prod idênticos):

| Recurso | Antes |
|---|---|
| Bucket de cliente (`aja-client-docs-*`) | ❌ inexistente |
| env `S3_CLIENT_DOCS_BUCKET` / `S3_CLIENT_DOCS_KMS_KEY_ID` | ❌ ausente |
| CMK KMS dedicada | ❌ inexistente |
| Policy da task role no bucket de cliente | ❌ inexistente (só `aja-agora-docs-*`) |

**O código sempre esteve correto** (a config já lê `S3_CLIENT_DOCS_*` e tem
regressão em `src/lib/storage/index.test.ts`). O defeito era puramente de
**provisionamento de infra + env**.

## Decisões tomadas

- **Criptografia:** CMK KMS **dedicada** por ambiente (`alias/aja-client-docs-<env>`),
  rotação automática. É PII de identidade (RG/CNH) e o design FIX-82 já pedia
  SSE-KMS (o código repassa `kmsKeyId`). CMK dedicada dá controle/rotação/audit
  granular — escolha security-first.
- **Nomes:** buckets `aja-client-docs-dev` / `aja-client-docs-prod` (segue a
  convenção `aja-agora-docs-<env>`), setados explicitamente via env
  `S3_CLIENT_DOCS_BUCKET` na task def (não confiar no default do código).
- **Escopo:** dev **e** prod (ambos estavam quebrados pelo mesmo motivo).
- **IaC-by-CLI:** o projeto não usa Terraform; o provisionamento virou script
  idempotente versionado em `scripts/infra/provision-client-docs.sh` (repetível,
  auditável — nada mais "manual e perdido").

## O que foi provisionado (conta 438465163995 / sa-east-1)

Por ambiente, via `scripts/infra/provision-client-docs.sh <env> <perfil>`:

- **CMK KMS** dedicada + alias `alias/aja-client-docs-<env>` + rotação automática.
- **Bucket** `aja-client-docs-<env>`: Block Public Access total, SSE-KMS default
  com a CMK + Bucket Key, bucket policy negando tráfego não-TLS.
- **IAM** na role `ecs-task-aja-agora-<env>` (inline `app-permissions`, append):
  S3 Get/Put/Delete em `bucket/*` + ListBucket no bucket + KMS
  GenerateDataKey/Encrypt/Decrypt/DescribeKey na CMK (least-privilege, escopado).
- **Task def**: env `S3_CLIENT_DOCS_BUCKET` + `S3_CLIENT_DOCS_KMS_KEY_ID`
  (dev rev 9, prod rev 8) + `force-new-deployment`.

## Validação

- **IAM policy simulator** (dev+prod): a role `ecs-task-aja-agora-<env>` é
  `allowed` em s3:PutObject/GetObject/DeleteObject no bucket + kms:GenerateDataKey/
  Decrypt na CMK.
- **Put/get/delete real** (dev+prod): objeto gravado criptografado com `aws:kms`
  usando a CMK correta de cada ambiente.
- **E2E contra a app real de prod** (`POST https://ajaagora.com.br/api/chat/document`):
  o `putObject` **sucedeu** (objeto gravado em `aja-client-docs-prod`) — a resposta
  só falhou no INSERT por FK, porque o teste usou um `conversationId` sintético
  inexistente em `conversations` (artefato do teste, não do produto). Objeto de
  teste removido (cleanup).
- Deployment prod estabilizado na task def rev 8.

## Relacionados

- FIX-82/83/84 — gestão de documentos de cliente (SSE-KMS, audit trail, dispatch).
- Memória: `project_aja_s3_storage_provisionado` (bucket da administradora).
