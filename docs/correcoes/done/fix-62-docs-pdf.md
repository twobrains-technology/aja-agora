---
id: FIX-62
titulo: "Documentos da administradora (PDF: storage + extração + CRUD)"
status: done
commit: 68cd9938
executado_em: 2026-06-21
bloco: bloco-mesa-a-cadastros
arquivos:
  - src/app/api/admin/administradora-docs/
  - src/lib/storage/
  - src/lib/pdf/
  - src/components/admin/administradoras/
rodada: 2026-06-21 feature mesa de operação (Kairo, autônomo)
---
# FIX-62 — Documentos da administradora (PDF)

**Spec:** `docs/visao/mesa-de-operacao.md` §3.2. O manual de contratação (PDF) por administradora.

## O quê × onde
- Tabela `administradora_docs` (JÁ no schema): administradoraId (FK), titulo, tipo, storageKey,
  textoExtraido, versao, isActive, uploadedBy.
- Upload PDF → **object storage** (MinIO local / S3 prod — `src/lib/storage/`, client S3-compat por
  env). `storage_key` na tabela.
- **Extração de texto** do PDF (`src/lib/pdf/`, lib `unpdf`/`pdf-parse` via `pnpm add`) → `texto_extraido`.
  É o que o copiloto (bloco C) injeta no prompt. DEC-C da spec: full-text, não RAG.
- CRUD: cadastrar (escolhe administradora), listar, remover, versionar (incrementa versao).

## Regressão
- Integration-db: criar doc com PDF fixture pequeno → `storage_key` setado + `texto_extraido`
  não-vazio (assert de valor). Mock só a fronteira do storage se preciso; DB real.
