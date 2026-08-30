-- A3 — o índice que faz o código de origem ser resolvível em tempo de webhook.
--
-- O código carimbado no link do WhatsApp é o PREFIXO do próprio uuid da visita
-- (ver src/lib/attribution/codigo-de-origem.ts). Sem este índice, cada primeira
-- mensagem carimbada faria varredura sequencial em `visits` — a tabela que mais
-- cresce do banco (46 mil linhas em 28 dias) — dentro do caminho quente do
-- webhook, que tem que devolver 200 rápido para a Meta não reentregar.
--
-- Índice de EXPRESSÃO e não coluna nova de propósito: o valor é derivável dos
-- dois lados sem combinar nada, vale retroativamente para toda visita que já
-- existe e não acrescenta escrita ao caminho crítico da visita.
--
-- `left(id::text, 8)` é imutável (o cast de uuid para text e `left` ambos são),
-- então o índice é permitido. O filtro parcial por canal reduz o índice ao que
-- de fato é consultado: o código nasce no site.
--
-- Migration CUSTOM porque índice de expressão não é expressável no schema do
-- drizzle — e escrever a entry do journal à mão quebraria a cadeia de
-- snapshots que `src/db/meta-integrity.test.ts` vigia desde o FIX-100.
CREATE INDEX IF NOT EXISTS "visits_codigo_de_origem_idx"
  ON "visits" (left("id"::text, 8))
  WHERE "channel" = 'web';
