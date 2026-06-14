/**
 * E2E — FIX-46: retomada same-device.
 *
 * Cookie `aja_uid` vinculado a uma conversa web → ao abrir /chat, o histórico
 * reaparece (server lê o cookie, hidrata o ChatProvider). Cookie limpo → primeira
 * vez intacta (chat vazio). Não invoca o agente (seed direto no DB) — prova só a
 * ponte cookie↔conversa↔reidratação.
 *
 * Pré-requisito: container UP em PLAYWRIGHT_TEST_BASE_URL + DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const BASE_URL =
	process.env.PLAYWRIGHT_TEST_BASE_URL || "http://aja-improving-web-conversation.orb.local";

const COOKIE = `e2e-fix46-${randomUUID()}`;
const convId = randomUUID();
const MSG_USER = `quero um apartamento — ${COOKIE.slice(0, 8)}`;
const MSG_ASSISTANT = `legal! vamos planejar isso — ${COOKIE.slice(0, 8)}`;

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
	const db = new Client({ connectionString: DATABASE_URL });
	await db.connect();
	try {
		return await fn(db);
	} finally {
		await db.end();
	}
}

test.beforeAll(async ({ request }, testInfo) => {
	const probe = await request.get("/api/chat/resume", { failOnStatusCode: false });
	if (probe.status() === 404) {
		testInfo.skip(true, "Rota /api/chat/resume não existe no servidor alvo.");
	}
	await withDb(async (db) => {
		await db.query(
			`INSERT INTO conversations (id, channel, status, metadata) VALUES ($1,'web','active',$2)`,
			[convId, JSON.stringify({ webCookie: COOKIE })],
		);
		await db.query(
			`INSERT INTO messages (conversation_id, role, content, channel) VALUES ($1,'user',$2,'web')`,
			[convId, MSG_USER],
		);
		await db.query(
			`INSERT INTO messages (conversation_id, role, content, channel) VALUES ($1,'assistant',$2,'web')`,
			[convId, MSG_ASSISTANT],
		);
	});
});

test.afterAll(async () => {
	await withDb(async (db) => {
		await db.query("DELETE FROM conversations WHERE id = $1", [convId]);
	});
});

test("same-device: cookie com conversa → histórico reaparece ao abrir /chat", async ({
	context,
	page,
}) => {
	await context.addCookies([{ name: "aja_uid", value: COOKIE, url: BASE_URL, httpOnly: true }]);
	await page.goto("/chat");
	await expect(page.getByText(MSG_USER)).toBeVisible({ timeout: 15_000 });
	await expect(page.getByText(MSG_ASSISTANT)).toBeVisible();
	await page.screenshot({ path: "test-results/fix46-resume-same-device.png", fullPage: true });
});

test("primeira vez: sem cookie → chat vazio (não vaza conversa anterior)", async ({
	context,
	page,
}) => {
	await context.clearCookies();
	await page.goto("/chat");
	// dá tempo de hidratar; o histórico anterior NÃO pode aparecer
	await page.waitForLoadState("networkidle");
	await expect(page.getByText(MSG_USER)).toHaveCount(0);
});
