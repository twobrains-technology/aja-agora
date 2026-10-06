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
-- ── Decodificação (senão a mesma campanha vira duas) ─────────────────────────
-- O `referrer` traz os valores ainda percent-encoded (`utm_campaign=CR%2D002+CARRO`),
-- mas o caminho vivo (`parseCampaignParams`/`URLSearchParams`, em
-- `src/lib/attribution/params.ts`) grava `CR-002 CARRO`: ele troca `+` por espaço,
-- decodifica `%XX`, faz trim e corta em 255. Se o backfill transcrevesse o valor
-- cru, a dashboard contaria a MESMA campanha em dois grupos (`CR-002 CARRO` e
-- `CR%2D002+CARRO`) — o defeito que a migration existe para fechar, por outra porta.
-- Por isso o backfill replica o caminho vivo, com a mesma ordem: `+`→espaço e
-- percent-decode, depois trim, depois `left(…,255)`.
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
	-- Cada valor cru vai para um campo separado por `chr(1)` (separador que não
	-- aparece em UTM). `coalesce(…, '')` é obrigatório: `NULL || chr(1) || …`
	-- anularia o bruto inteiro quando um único parâmetro não vem na URL.
	SELECT
		v."id" AS "id",
		coalesce(replace(nullif(substring(v."referrer" from '[?&]utm_source=([^&#]*)'), ''),   '+', ' '), '') || chr(1) ||
		coalesce(replace(nullif(substring(v."referrer" from '[?&]utm_medium=([^&#]*)'), ''),   '+', ' '), '') || chr(1) ||
		coalesce(replace(nullif(substring(v."referrer" from '[?&]utm_campaign=([^&#]*)'), ''), '+', ' '), '') || chr(1) ||
		coalesce(replace(nullif(substring(v."referrer" from '[?&]utm_content=([^&#]*)'), ''),  '+', ' '), '') || chr(1) ||
		coalesce(replace(nullif(substring(v."referrer" from '[?&]utm_term=([^&#]*)'), ''),     '+', ' '), '') || chr(1) ||
		coalesce(replace(nullif(substring(v."referrer" from '[?&]gclid=([^&#]*)'), ''),        '+', ' '), '') || chr(1) ||
		coalesce(replace(nullif(substring(v."referrer" from '[?&]fbclid=([^&#]*)'), ''),       '+', ' '), '') AS "bruto"
	FROM "visits" AS v
	WHERE v."channel" = 'web'
	  AND v."utm_campaign" IS NULL
	  AND v."referrer" IS NOT NULL
	  AND v."referrer" ~ '^https?://(www\.)?ajaagora\.com\.br/direto\?'
),
-- Percent-decode. O `%XX` é decodificado em BLOCO de sequências consecutivas
-- (`%C3%A9` → `é`); byte a byte quebraria, porque cada byte sozinho não é UTF-8
-- válido. Literal que não é `%XX` é copiado como está (o `+` já virou espaço na
-- CTE anterior) — mesma semântica do `URLSearchParams`.
decodificadas AS (
	SELECT c."id" AS "id", d."decodificado" AS "bruto"
	FROM candidatas AS c
	CROSS JOIN LATERAL (
		WITH RECURSIVE passo("resto", "saida") AS (
			SELECT c."bruto", ''::text COLLATE "C"
			UNION ALL
			SELECT
				CASE
					WHEN substring("resto" from '^((%[0-9A-Fa-f]{2})+)') IS NULL
						THEN substring("resto" from 2)
					ELSE substring("resto" from char_length(substring("resto" from '^((%[0-9A-Fa-f]{2})+)')) + 1)
				END,
				"saida" ||
				CASE
					WHEN substring("resto" from '^((%[0-9A-Fa-f]{2})+)') IS NULL
						THEN left("resto", 1)
					ELSE convert_from(decode(replace(substring("resto" from '^((%[0-9A-Fa-f]{2})+)'), '%', ''), 'hex'), 'UTF8')
				END
			FROM passo
			WHERE "resto" <> ''
		)
		SELECT "saida" AS "decodificado" FROM passo WHERE "resto" = ''
	) AS d
),
valores AS (
	-- Mesma normalização do `clean()` de `parseCampaignParams`: trim, corte em 255
	-- e vazio → NULL.
	SELECT
		d."id" AS "id",
		nullif(left(btrim(split_part(d."bruto", chr(1), 1), E' \t\n\r\f'), 255), '') AS "utm_source",
		nullif(left(btrim(split_part(d."bruto", chr(1), 2), E' \t\n\r\f'), 255), '') AS "utm_medium",
		nullif(left(btrim(split_part(d."bruto", chr(1), 3), E' \t\n\r\f'), 255), '') AS "utm_campaign",
		nullif(left(btrim(split_part(d."bruto", chr(1), 4), E' \t\n\r\f'), 255), '') AS "utm_content",
		nullif(left(btrim(split_part(d."bruto", chr(1), 5), E' \t\n\r\f'), 255), '') AS "utm_term",
		nullif(left(btrim(split_part(d."bruto", chr(1), 6), E' \t\n\r\f'), 255), '') AS "gclid",
		nullif(left(btrim(split_part(d."bruto", chr(1), 7), E' \t\n\r\f'), 255), '') AS "fbclid"
	FROM decodificadas AS d
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
FROM "valores" AS c
WHERE v."id" = c."id"
  AND c."utm_campaign" IS NOT NULL;