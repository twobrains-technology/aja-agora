-- Template da mesa (`usage_key = mesa_novo_caso`) como DADO VERSIONADO.
--
-- Reportado por Kairo (2026-07-30): proposta fechada no WhatsApp não chegou ao
-- atendente. A causa foi dupla — o lead ficava na raia errada do board (já
-- corrigido) e a notificação era TEXTO LIVRE, que a Meta só entrega dentro da
-- janela de 24h. O atendente não conversa com o próprio sistema, então a janela
-- dele está fechada quase sempre e o aviso morria em silêncio.
--
-- Fora da janela só passa Message Template aprovado. O runtime resolve o
-- template pela `usage_key` no banco (`findTemplateByUsageKey`), e cadastrar
-- isso pelo admin seria um clique manual em cada ambiente — o que a regra do
-- projeto proíbe. Então a linha nasce aqui, na migration, e sobe sozinha em
-- todo ambiente junto com o deploy.
--
-- Submetido à Meta em 2026-07-30 (WABA 2536995250087380):
--   name = aja_agora_mesa_novo_caso · id = 910556708148286 · UTILITY · pt_BR
-- Nasce PENDING de propósito: quem promove pra APPROVED é a Meta, via webhook
-- `message_template_status_update` ou pela reconciliação automática de status.
--
-- Idempotente e não-destrutiva: se a linha já existir (cadastro manual anterior),
-- só completa o que estiver faltando e NUNCA sobrescreve um template que já tem
-- identidade na Meta.
INSERT INTO "whatsapp_templates" (
	"usage_key",
	"meta_name",
	"language",
	"category",
	"components",
	"body_preview",
	"status",
	"meta_template_id",
	"submitted_at"
) VALUES (
	'mesa_novo_caso',
	'aja_agora_mesa_novo_caso',
	'pt_BR',
	'UTILITY',
	'[{"type":"HEADER","format":"TEXT","text":"Novo caso na mesa"},{"type":"BODY","text":"Um cliente concluiu a proposta pelo Aja Agora e o caso está aguardando atendimento.\n\n{{1}}\n\nAbra o painel da mesa para assumir e dar sequência.","example":{"body_text":[["Maria Silva · consórcio de auto · R$ 120.000"]]}},{"type":"FOOTER","text":"Aja Agora · Mesa de operação"}]'::jsonb,
	'Um cliente concluiu a proposta pelo Aja Agora e o caso está aguardando atendimento.

{{1}}

Abra o painel da mesa para assumir e dar sequência.',
	'PENDING',
	'910556708148286',
	now()
)
ON CONFLICT ("usage_key") DO UPDATE SET
	"meta_name" = EXCLUDED."meta_name",
	"language" = EXCLUDED."language",
	"category" = EXCLUDED."category",
	"components" = EXCLUDED."components",
	"body_preview" = EXCLUDED."body_preview",
	"status" = EXCLUDED."status",
	"meta_template_id" = EXCLUDED."meta_template_id",
	"submitted_at" = EXCLUDED."submitted_at"
WHERE "whatsapp_templates"."meta_template_id" IS NULL;
