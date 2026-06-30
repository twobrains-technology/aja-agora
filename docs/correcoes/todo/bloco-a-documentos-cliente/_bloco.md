---
bloco: bloco-a-documentos-cliente
branch: feat/documentos-cliente-s3
workspace: feat-documentos-cliente-s3
onda: 1
depends_on: []
paralelo_com: [bloco-b-chat-mesa-whatsapp, bloco-c-fechamento-trilho-b]
itens: [FIX-82, FIX-83, FIX-84]
escopo_arquivos:
  - src/db/schema.ts
  - src/lib/storage/index.ts
  - src/lib/documents/client-documents.ts
  - src/lib/documents/dispatch.ts
  - src/app/api/chat/document/route.ts
  - src/app/api/admin/documents/[id]/download/route.ts
  - src/components/admin/pipeline/lead-detail-panel.tsx
conflitos_esperados:
  - "src/db/schema.ts — nível 2: bloco-b adiciona coluna lastInboundAt em `conversations`; aqui adiciono a TABELA client_documents. Regiões diferentes; append. Merge mecânico."
  - "src/components/admin/pipeline/lead-detail-panel.tsx — nível 2: bloco-b adiciona aba/ação de chat; aqui adiciono a aba 'Documentos'. Abas diferentes; merge mecânico."
---
# Bloco A — Gestão de documentos do cliente (S3 nosso = fonte da verdade)

Design completo: `docs/superpowers/specs/2026-06-28-gestao-documentos-cliente-design.md`.

Por que juntos: os 3 itens são a mesma feature (coletar → guardar → operador vê → despachar),
fortemente acoplados (mesma tabela/módulo). Ordem interna obrigatória:
1. **FIX-82** — storage S3 dedicado + tabela `client_documents` + `/api/chat/document` grava no nosso lado.
2. **FIX-83** — aba "Documentos" no Kanban + download via URL assinada (consome FIX-82).
3. **FIX-84** — despacho desacoplado `dispatchClientDocument(documentId, target)` (consome FIX-82).

**Contrato exportado (consumido pelo bloco-c, nível 3):**
`dispatchClientDocument(documentId: string, target: "bevi_a" | "bevi_b" | "mesa"): Promise<DispatchResult>`
em `src/lib/documents/dispatch.ts`. O bloco-c chama com `target："bevi_b"`; a implementação real
do alvo `bevi_b` depende de validar o step de doc do self-contract ao vivo (PENDENTE-KAIRO) —
até lá, `bevi_b` registra `dispatchStatus="pending"` sem enviar (não perde o doc).
