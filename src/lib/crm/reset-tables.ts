// src/lib/crm/reset-tables.ts
//
// O que o marco zero apaga e o que ele preserva.
//
// A classificação vive aqui, e não dentro do script, porque um teste
// (`reset-tables.test.ts`) confere que TODA tabela do schema está num dos dois
// grupos. Tabela nova sem decisão vira build vermelho — não vira surpresa na
// hora de zerar a base de produção.

/**
 * Dado de operação: tudo que nasce de um cliente conversando. É o que precisa
 * sumir pra que a nova operação de venda comece com números limpos.
 */
export const TABELAS_LIMPAS: readonly string[] = [
	// Conversa e o que pende dela
	"conversations",
	"messages",
	"artifacts",
	// Funil
	"leads",
	"lead_events",
	"lead_insights",
	"conversation_evaluations",
	// Fechamento na administradora
	"bevi_proposals",
	// Identidade do cliente (CPF, telefone, e-mail) — apagar é higiene de LGPD,
	// não só faxina de métrica.
	"contacts",
	// Documentos pessoais: a linha aqui, o objeto no S3 pelo script.
	"client_documents",
	"client_document_downloads",
	// Mesa de operação
	"mesa_handoffs",
	"mesa_copilot_messages",
	// A campainha do handoff: entrega/leitura da notificação que chamou o
	// atendente. É medição de uma conversa específica — sem a conversa, a linha
	// não significa nada, e um `sent` de teste distorceria o tempo de resposta da
	// mesa no período novo.
	"handoff_notifications",
	// Memória do agente — sem isto, cliente antigo volta e o agente "lembra" de
	// uma conversa que não existe mais no CRM.
	"memory_events",
	"memory_identities",
	// Fila e travas do WhatsApp (estado de execução, não configuração)
	"whatsapp_outbound_queue",
	"whatsapp_once_keys",
	"whatsapp_conversation_locks",
	// Origem de mídia: visita de teste contaminaria o relatório da campanha nova
	"visits",
	// Conversões devolvidas à mídia — sinal do funil velho não pode ser reenviado
	// pro algoritmo depois do marco zero.
	"conversion_events",
];

/**
 * Configuração da operação: o que faz o vendedor existir. Zerar isto não é
 * marco zero, é parada de operação — template aprovado leva dias pra
 * reaprovar na Meta, persona e administradora são o cérebro e o catálogo.
 */
export const TABELAS_PRESERVADAS: readonly string[] = [
	// Acesso ao admin (better-auth)
	"user",
	"session",
	"account",
	"verification",
	// Configuração do agente e do catálogo
	"personas",
	"administradoras",
	"administradora_docs",
	// Time da mesa
	"mesa_attendants",
	// Canal WhatsApp
	"whatsapp_templates",
];
