#!/usr/bin/env node
import { writeFileSync } from "node:fs";
/** Exportação somente-leitura da base "Percurso do lead" para CSV. */
import { createRequire } from "node:module";

const require = createRequire("/Users/kairo/code/aja-agora/package.json");
const { Client } = require("pg");
const output = process.argv[2];
if (!output || !process.env.DATABASE_URL)
	throw new Error("Uso: DATABASE_URL=... exportar-percurso-prod.mjs saida.csv");

const query = `
WITH visita AS (
  SELECT v.*, NOT EXISTS (
    SELECT 1 FROM visits eco WHERE eco.visitor_id = v.visitor_id
      AND eco.created_at < v.created_at AND v.created_at - eco.created_at < interval '2 seconds'
  ) AS conta_como_chegada
  FROM visits v
  WHERE (EXISTS (SELECT 1 FROM conversations cg WHERE cg.visit_id = v.id AND cg.is_simulated = false)
    OR (v.user_agent IS NOT NULL AND v.user_agent !~* '(ELB-HealthChecker|facebookexternalhit|python-requests|HeadlessChrome|crawler|spider|curl|wget|bot)([^a-z]|$)'))
),
por_visita AS (
  SELECT vi.*,
    COALESCE((SELECT c.contact_id::text FROM conversations c JOIN visits vp ON vp.id = c.visit_id
      WHERE vp.visitor_id = vi.visitor_id AND c.contact_id IS NOT NULL AND c.is_simulated = false
      ORDER BY c.updated_at ASC LIMIT 1), vi.visitor_id) AS chave
  FROM visita vi
),
credito AS (
  SELECT DISTINCT ON (chave) chave, landing_path, channel, utm_source, utm_medium, utm_campaign,
    utm_content, ctwa_source_id, ctwa_headline, referrer
  FROM por_visita
  ORDER BY chave, (utm_source IS NULL AND ctwa_source_id IS NULL AND ctwa_headline IS NULL) ASC, created_at ASC
),
pessoa AS (
  SELECT chave,
    min(NULLIF(chave, visitor_id)) AS contact_id,
    (array_agg(visitor_id ORDER BY created_at))[1] AS visitor_id,
    count(*) FILTER (WHERE conta_como_chegada) AS arrivals,
    min(created_at) AS first_arrival,
    max(created_at) AS last_visit,
    bool_or(EXISTS (SELECT 1 FROM page_events pe WHERE pe.visit_id = id AND pe.type IN ('click','rage_click','scroll_depth'))) AS olhou,
    bool_or(EXISTS (SELECT 1 FROM page_events pe WHERE pe.visit_id = id AND pe.type = 'chat_open')) AS abriu_teatro
  FROM por_visita GROUP BY chave
),
conv AS (
  SELECT c.id, c.visit_id, c.updated_at,
    (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS msgs,
    (SELECT max(m.created_at) FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS ultimo_inbound,
    EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user') AS escreveu,
    EXISTS (SELECT 1 FROM leads l WHERE l.conversation_id = c.id AND l.is_simulated = false AND (l.phone IS NOT NULL OR l.email IS NOT NULL)) AS identificou,
    EXISTS (SELECT 1 FROM messages m JOIN artifacts a ON a.message_id = m.id WHERE m.conversation_id = c.id AND a.type IN ('real_offer','simulation_result')) AS viu_oferta,
    EXISTS (SELECT 1 FROM bevi_proposals bp WHERE bp.conversation_id = c.id) AS teve_proposta,
    EXISTS (SELECT 1 FROM leads l WHERE l.conversation_id = c.id AND l.is_simulated = false AND l.stage = 'fechado_ganho') AS fechou
  FROM conversations c JOIN visita vi ON vi.id = c.visit_id WHERE c.is_simulated = false
),
conv_pessoa AS (
  SELECT pv.chave, count(DISTINCT c.id) AS conversations, COALESCE(sum(c.msgs),0) AS customer_messages,
    max(c.ultimo_inbound) AS ultimo_inbound, bool_or(c.escreveu) AS escreveu, bool_or(c.identificou) AS identificou,
    bool_or(c.viu_oferta) AS viu_oferta, bool_or(c.teve_proposta) AS teve_proposta, bool_or(c.fechou) AS fechou
  FROM por_visita pv JOIN conv c ON c.visit_id = pv.id GROUP BY pv.chave
),
conversa_recente AS (
  SELECT DISTINCT ON (pv.chave) pv.chave, c.id AS conversation_id
  FROM por_visita pv JOIN conv c ON c.visit_id = pv.id ORDER BY pv.chave, c.updated_at DESC
),
lead_pessoa AS (
  SELECT DISTINCT ON (pv.chave) pv.chave, l.name, l.phone, l.email, l.stage
  FROM por_visita pv JOIN conv c ON c.visit_id = pv.id JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
  ORDER BY pv.chave, (l.stage = 'perdido') ASC, l.stage DESC, l.created_at DESC
),
contato AS (
  SELECT p.chave, ct.name, ct.phone, ct.email FROM pessoa p JOIN contacts ct ON ct.id::text = p.contact_id
)
SELECT p.contact_id, p.visitor_id, COALESCE(ct.name, lp.name) AS name, COALESCE(ct.email, lp.email) AS email,
  COALESCE(ct.phone, lp.phone) AS phone, cr.channel, cr.utm_source, cr.utm_medium, cr.utm_campaign, cr.utm_content,
  cr.ctwa_source_id, cr.ctwa_headline, cr.referrer, cr.landing_path, p.first_arrival,
  GREATEST(p.last_visit, COALESCE(cp.ultimo_inbound, p.last_visit)) AS last_activity, p.arrivals,
  COALESCE(cp.conversations,0) AS conversations, COALESCE(cp.customer_messages,0) AS customer_messages,
  CASE WHEN COALESCE(cp.fechou,false) THEN 'fechado' WHEN COALESCE(cp.teve_proposta,false) THEN 'proposta'
    WHEN COALESCE(cp.viu_oferta,false) THEN 'viu_oferta' WHEN COALESCE(cp.identificou,false) THEN 'se_identificou'
    WHEN COALESCE(cp.escreveu,false) THEN 'escreveu' WHEN COALESCE(cp.conversations,0) > 0 OR p.abriu_teatro THEN 'abriu_o_chat'
    WHEN p.olhou THEN 'olhou_a_pagina' ELSE 'so_chegou' END AS step,
  lp.stage, rc.conversation_id
FROM pessoa p JOIN credito cr ON cr.chave = p.chave LEFT JOIN conv_pessoa cp ON cp.chave = p.chave
LEFT JOIN conversa_recente rc ON rc.chave = p.chave LEFT JOIN lead_pessoa lp ON lp.chave = p.chave
LEFT JOIN contato ct ON ct.chave = p.chave ORDER BY last_activity DESC, p.chave ASC`;

function csv(value) {
	const text = value == null ? "" : String(value);
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const client = new Client({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false },
});
await client.connect();
const { rows, fields } = await client.query(query);
await client.end();
writeFileSync(
	output,
	[
		fields.map((field) => csv(field.name)).join(","),
		...rows.map((row) => fields.map((field) => csv(row[field.name])).join(",")),
	].join("\n"),
	"utf8",
);
console.log(`linhas_extraidas=${rows.length}`);
