-- FIX-39: a API de Parceiro da Bevi (2026-06-12) passou a devolver `prazo` (meses)
-- na oferta real — o gap do FIX-13 acabou. Persistimos o prazo no snapshot da
-- proposta pra ele chegar ao resumo da contratação (WhatsApp, docx passo 5).
-- Nullable: shape antigo não tinha e a API pode voltar atrás (consumo defensivo).
ALTER TABLE "bevi_proposals" ADD COLUMN IF NOT EXISTS "term_months" integer;
