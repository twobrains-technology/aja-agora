/**
 * Verifica se a janela de 24h do WhatsApp está aberta para uma conversa.
 *
 * A janela de 24h da Meta Cloud API permite texto livre apenas se o último
 * inbound (mensagem recebida do cliente) foi nos últimos 24 horas.
 *
 * @param conversationId — ID da conversa no DB
 * @returns Objeto com { open: boolean, expiresAt: Date }
 */
export async function isWindowOpen(conversationId: string): Promise<{
	open: boolean;
	expiresAt: Date | null;
}> {
	// Importação tardia para não circular
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL environment variable not set");
	}

	// Usar require para evitar circular dependency
	const schemaModule = require("@/db/schema");
	const { drizzle } = require("drizzle-orm/node-postgres");

	const dbInstance = drizzle(databaseUrl, { schema: schemaModule });
	const { conversations } = schemaModule;

	const [result] = await dbInstance.select({
		id: conversations.id,
		lastInboundAt: conversations.lastInboundAt,
	}).from(conversations).where(conversations.id.eq(conversationId)).limit(1);

	// Se não há conversa ou lastInboundAt está ausente/nulo, janela fechada
	if (!result || !result.lastInboundAt) {
		return {
			open: false,
			expiresAt: null,
		};
	}

	// Calcula a data de expiração da janela (24h após o último inbound)
	const expiresAt = new Date(result.lastInboundAt.getTime() + 24 * 60 * 60 * 1000);
	const now = new Date();

	return {
		open: now < expiresAt,
		expiresAt: expiresAt,
	};
}

/**
 * Verifica rapidamente se a janela está aberta (versão sem DB).
 * Útil para validações de front-end ou contextos sem acesso ao DB.
 *
 * @param lastInboundAt — timestamp do último inbound do cliente
 * @returns true se a janela está aberta
 */
export function isWindowOpenFast(
	lastInboundAt: Date | string | null,
): boolean {
	if (!lastInboundAt) {
		return false;
	}

	const inboundDate = typeof lastInboundAt === "string" ? new Date(lastInboundAt) : lastInboundAt;
	if (Number.isNaN(inboundDate.getTime())) {
		return false;
	}

	const now = new Date();
	const windowClosedAt = new Date(inboundDate.getTime() + 24 * 60 * 60 * 1000);

	return now < windowClosedAt;
}
