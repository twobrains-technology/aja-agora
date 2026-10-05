-- B3 / P5 — backfill da UTM das visitas que nasceram em `/` vindas de `/direto`.
--
-- O defeito que esta migration fecha (o conserto para a frente está em
-- `src/proxy.ts`): `/direto` é o destino dos anúncios da Meta, mas não estava em
-- `LANDINGS` nem no `matcher`. O proxy não gravava a chegada nele, então a UTM da
-- URL do criativo morria na primeira navegação — a visita nascia depois, na home,
-- como acesso direto, e a única pista da campanha ficava no `referrer`
-- (`https://ajaagora.com.br/direto?utm_source=…&utm_campaign=…&fbclid=…`).
--
-- Medido em produção em 05/10/2026: ~130 visitas assim desde 02/10, e a campanha
-- AJA-CR-002 (58 cliques, conversas reais) aparecendo como "zero chegada" — número
-- que levaria a cortar verba de quem estava trazendo gente certa. A dashboard
-- lê a UTM da própria linha da visita, então é aqui que o sinal precisa chegar.
--
-- Por que é sinal REAL e não atribuição inventada: a UTM não é inferida nem
-- chutada — ela está literalmente escrita no `referrer` que o navegador mandou,
-- e o `referrer` aponta para o NOSSO domínio. O backfill só TRANSCREVE para a
-- coluna o que já estava na requisição.
--
-- Escopo estreito de propósito:
--   • só `channel = 'web'` (a coluna é do canal web; o WhatsApp tem `referral`);
--   • só `utm_campaign IS NULL` — visita já atribuída nunca é reescrita;
--   • só `referrer` do nosso domínio na rota `/direto` com query string;
--   • só quando o `referrer` traz `utm_campaign` (sem ele não há campanha a
--     recuperar, e exigir isso é o que torna a migration idempotente);
--   • cada coluna usa `COALESCE(coluna, extraído)`: nunca sobrescreve valor já
--     gravado, só preenche o que está NULL.
-- Idempotente: reaplicar não muda nada (a primeira passada deixa `utm_campaign`
-- não nulo, e a linha deixa de casar com `utm_campaign IS NULL`).

WITH candidatas AS (
	SELECT
		v."id" AS "id",
		nullif(substring(v."referrer" from '[?&]utm_source=([^&#]*)'), '')   AS "utm_source",
		nullif(substring(v."referrer" from '[?&]utm_medium=([^&#]*)'), '')   AS "utm_medium",
		nullif(substring(v."referrer" from '[?&]utm_campaign=([^&#]*)'), '') AS "utm_campaign",
		nullif(substring(v."referrer" from '[?&]utm_content=([^&#]*)'), '')  AS "utm_content",
		nullif(substring(v."referrer" from '[?&]utm_term=([^&#]*)'), '')     AS "utm_term",
		nullif(substring(v."referrer" from '[?&]gclid=([^&#]*)'), '')        AS "gclid",
		nullif(substring(v."referrer" from '[?&]fbclid=([^&#]*)'), '')       AS "fbclid"
	FROM "visits" AS v
	WHERE v."channel" = 'web'
	  AND v."utm_campaign" IS NULL
	  AND v."referrer" IS NOT NULL
	  AND v."referrer" ~ '^https?://(www\.)?ajaagora\.com\.br/direto\?'
)
UPDATE "visits" AS v
SET
	"utm_source"   = COALESCE(v."utm_source",   c."utm_source"),
	"utm_medium"   = COALESCE(v."utm_medium",   c."utm_medium"),
	"utm_campaign" = COALESCE(v."utm_campaign", c."utm_campaign"),
	"utm_content"  = COALESCE(v."utm_content",  c."utm_content"),
	"utm_term"     = COALESCE(v."utm_term",     c."utm_term"),
	"gclid"        = COALESCE(v."gclid",        c."gclid"),
	"fbclid"       = COALESCE(v."fbclid",       c."fbclid"),
	-- O id determinístico da Meta vem DENTRO da UTM (é assim que o link do
	-- criativo é montado): mesmo fallback do `parseCampaignParams`, aqui para as
	-- linhas que já existem — só dígitos de 15 a 18 viram id.
	"campaign_id"  = COALESCE(v."campaign_id", CASE WHEN c."utm_campaign" ~ '^[0-9]{15,18}$' THEN c."utm_campaign" END),
	"adset_id"     = COALESCE(v."adset_id",    CASE WHEN c."utm_term"     ~ '^[0-9]{15,18}$' THEN c."utm_term"     END),
	"ad_id"        = COALESCE(v."ad_id",       CASE WHEN c."utm_content"  ~ '^[0-9]{15,18}$' THEN c."utm_content"  END)
FROM "candidatas" AS c
WHERE v."id" = c."id"
  AND c."utm_campaign" IS NOT NULL;