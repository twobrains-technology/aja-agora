---
titulo: Gestão de documentos do cliente — S3 nosso como fonte da verdade
data: 2026-07-01
status: shipped
projeto: aja-agora · branch: feat/documentos-cliente-s3
jornadas_afetadas: [kyc-documentos, fechamento-consorcio]
tags: [storage, kyc, mesa-operacao, s3, seguranca]
---

# Gestão de documentos do cliente (bloco-a-documentos-cliente)

## 1. Pitch

O documento de identidade do cliente (RG/CNH, comprovante de endereço) deixa
de ser pass-through direto pra Bevi e passa a ser **um ativo nosso**: guardado
no nosso S3 primeiro, sempre visível pro operador no Kanban, independente da
Bevi estar no ar.

## 2. Problema que resolveu

Antes, o upload do documento ia direto pro portal da Bevi (CONEXIA/indiky) e
não passava pelo nosso storage. Sem tabela própria, sem status, sem
visibilidade no Kanban. Se a Bevi estivesse travada (como o Trilho A está
hoje — pendência AGX), o cliente enviava o documento e ele simplesmente **se
perdia** — nem ficava guardado com a gente, nem chegava lá. O operador da
mesa também não tinha como ver o documento pelo painel; tinha que entrar no
portal da Bevi na mão.

## 3. Solução entregue

- **Bucket S3 dedicado** (`aja-client-docs`, SSE-KMS) separado do bucket de
  administradora — PII de identidade nunca mistura com manual de contratação.
- **Tabela `client_documents`**: vínculo lead/contato/conversa, slot,
  status do ativo (`stored`) e status de despacho (`pending/sent/failed/manual`)
  desacoplados.
- **`/api/chat/document` grava no nosso S3 primeiro** e responde de
  imediato — não espera mais a Bevi.
- **Aba "Documentos" no Kanban**: o operador vê e baixa o documento do
  cliente direto do painel, com download via URL pré-assinada de 5 min +
  audit trail de quem baixou e quando.
- **`dispatchClientDocument`**: função de despacho best-effort — falha ao
  enviar pra Bevi NUNCA apaga nem bloqueia o documento guardado.

## 4. Por que importa

Antes, uma Bevi travada significava um KYC sem lugar pra cair. Agora o
documento do cliente está seguro assim que ele envia, e a mesa consegue
operar o fechamento manual mesmo com a Bevi fora do ar — o que é a situação
REAL do ambiente hoje (Trilho A confirmado travado).

## 5. Arquitetura — visão de 1 minuto

```
chat (upload) → POST /api/chat/document
   → storeClientDocument: putObject (S3 dedicado, SSE-KMS) + insert client_documents
   → responde {ok, documentId}                              ← fonte da verdade, sempre

Kanban (lead-detail) → aba "Documentos"
   → GET /api/admin/leads/[id]/documents (lista, DTO sem s3Bucket/s3Key)
   → GET /api/admin/documents/[id]/download (admin-only, presign 5min + audit)

dispatchClientDocument(documentId, target) — CONSUMIDOR best-effort, não wireado
ainda em produção:
   → "mesa": no-op manual (operador assume)
   → "bevi_a": reusa uploadContractDocument (fulfillment.ts → ConexiaDocsClient)
   → "bevi_b": STUB (pending, não envia) — contrato consumido pelo bloco-c
   falha em qualquer destino → dispatchStatus=failed, documento PERMANECE stored
```

## 6. Qualidade entregue

- **TDD** em todos os 3 itens — integration tests contra Postgres real (DB
  efêmero em container), storage mockado na fronteira.
- **35 testes novos** (structural + integration): storage config, gravação
  do documento, auth/presign/audit do download, os 5 caminhos do dispatch
  (mesa/bevi_b-stub/bevi_a-sucesso/bevi_a-falha/bevi_a-exceção) + documento
  inexistente.
- **Gate `pnpm test:unit` verde: 2049/2049 testes, 199 arquivos** — validado
  duas vezes, incluindo contra um Postgres **recém-migrado do zero** (cadeia
  completa 0000→0029 aplicando limpo).
- `pnpm db:migrate` validado de ponta a ponta (migration à mão + snapshot
  do meta reconstruído — ver §7).
- `pnpm test:integration`: 2 falhas encontradas, ambas **pré-existentes e
  ambientais** (não relacionadas a este bloco) — confirmado rodando os
  testes isolados com o env correto (`IDENTITY_ENC_KEY`), onde passam 100%.
- Typecheck: zero erros novos nos arquivos tocados (`tsc --noEmit` filtrado).
- Biome: zero erros (só 1 warning tolerado — `noNonNullAssertion` em
  `session!.user.id`, padrão já usado em 3 outros arquivos do repo).

## 7. Decisões registradas

Ver `docs/correcoes/decisions/2026-06-28-bloco-a-documentos.md` — cobre:
nome dos envs, generalização do módulo de storage, dependência nova
(`@aws-sdk/s3-request-presigner` + fix de diamante de versão via
`pnpm-workspace.yaml` overrides), enums no schema, shape do audit de
download, reuso de `uploadContractDocument` no dispatch, decisão de NÃO
disparar `dispatchClientDocument` automaticamente ainda, e a mudança de
contrato `{ok, fallbackLink}` → `{ok, documentId}`.

## 8. Riscos e tratamento

- **Migration à mão + meta do drizzle:** `db:generate` está confirmadamente
  quebrado pra reuso incremental (gera migration DUPLICADA em vez de
  detectar a minha escrita à mão) — usei o output dele só pra reconstruir o
  snapshot `0029_snapshot.json` que faltava (prevId validado contra 0028),
  descartando a migration redundante que ele tentou criar. Validado com o
  gate `src/db/meta-integrity.test.ts` (a regressão do FIX-100) 100% verde.
- **Diamante de versão AWS SDK:** `@aws-sdk/s3-request-presigner` puxava uma
  versão de `@aws-sdk/core`/`@smithy/core` diferente da de `@aws-sdk/client-s3`,
  quebrando o `tsc` (tipos `S3Client`/`Client<...>` incompatíveis). Resolvido
  com `overrides` no `pnpm-workspace.yaml`.
- **PII de identidade:** bucket dedicado + SSE-KMS (quando configurado) +
  download só via presign curto + audit — nenhum código expõe `s3Bucket`/
  `s3Key` em resposta de API (checado nos testes e nos DTOs).

## 9. Gaps honestos (PENDENTE-KAIRO)

| Item | Descrição |
|---|---|
| Bucket + KMS de PROD | Provisionamento IaC (Terraform) — dev usa MinIO sem KMS. |
| `bevi_b` ao vivo | Stub `TODO(bevi_b)` — falta validar o step de doc do self-contract do Trilho B antes de implementar o envio real. |
| Gatilho de `dispatchClientDocument` | A função existe, testada, exportada — mas **ninguém a chama automaticamente ainda**. Decidi NÃO disparar `bevi_a` em fire-and-forget do `/api/chat/document` (ver decisão §8 do doc de decisões) porque o Trilho A está confirmado travado hoje e isso introduzia uma corrida nos testes de integração sem nenhum ganho real. Falta plugar um gatilho real: ação do operador no Kanban, cron, ou o fechamento via Trilho B que o bloco-c está implementando em paralelo. |
| `beviRef` (jsonb) | Fica `null` no envio `sent` — `ConexiaDocsClient.upload()` retorna `void` hoje, sem `sectionId`/`documentId` de volta pra preencher a coluna. |

## 10. Próximos passos

1. Bloco-c (fechamento Trilho B, paralelo) consome `dispatchClientDocument(id, "bevi_b")` — meu contrato já está pronto pra isso.
2. Decidir e plugar o gatilho de despacho real (ver gap acima).
3. Provisionar bucket+KMS de produção (IaC).

## 11. Métricas da sessão

- **13 arquivos novos**, 9 modificados, 3 commits `test+feat:` (1 por FIX) + 1 `fix:` (correção do meta drizzle) + 1 `chore:` (envs) + 1 `docs:` (decisões) = **6 commits**.
- 35 testes novos + 1 teste estrutural pré-existente atualizado.
- Validação em container transitório (Postgres efêmero + node com store pnpm compartilhado) — host sem `node_modules`, nada instalado/rodado fora de container.
