import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5435/aja_agora";

let client: Client | null = null;

async function getDbClient(): Promise<Client> {
	if (!client) {
		client = new Client({
			connectionString: DATABASE_URL,
		});
		await client.connect();
	}
	return client;
}

export async function cleanupConversation(conversationId: string) {
	const db = await getDbClient();

	try {
		// Delete in order of foreign keys
		await db.query(
			"DELETE FROM lead_events WHERE lead_id IN (SELECT id FROM leads WHERE conversation_id = $1)",
			[conversationId],
		);
		await db.query("DELETE FROM leads WHERE conversation_id = $1", [conversationId]);
		await db.query("DELETE FROM messages WHERE conversation_id = $1", [conversationId]);
		await db.query("DELETE FROM conversations WHERE id = $1", [conversationId]);
	} catch (error) {
		console.error(`Cleanup failed for ${conversationId}:`, error);
	}
}

export async function getLeadByConversationId(conversationId: string) {
	const db = await getDbClient();
	const result = await db.query("SELECT * FROM leads WHERE conversation_id = $1", [conversationId]);
	return result.rows[0] || null;
}

export async function getConversation(conversationId: string) {
	const db = await getDbClient();
	const result = await db.query("SELECT * FROM conversations WHERE id = $1", [conversationId]);
	return result.rows[0] || null;
}

export async function getMessages(conversationId: string) {
	const db = await getDbClient();
	const result = await db.query(
		"SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
		[conversationId],
	);
	return result.rows as Array<{ role: string; content: string; created_at: Date }>;
}

export async function getLeadEvents(leadId: string) {
	const db = await getDbClient();
	const result = await db.query(
		"SELECT * FROM lead_events WHERE lead_id = $1 ORDER BY created_at",
		[leadId],
	);
	return result.rows;
}

export async function createConversation(conversationId: string) {
	const db = await getDbClient();
	try {
		await db.query(
			`INSERT INTO conversations (id, channel, status, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
			[conversationId, "web", "active"],
		);
	} catch (error) {
		console.error(`Failed to create conversation ${conversationId}:`, error);
	}
}

export async function closeDb() {
	if (client) {
		await client.end();
		client = null;
	}
}
