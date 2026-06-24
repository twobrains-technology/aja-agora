/**
 * E2E — FIX-45: visão consolidada do contato no admin.
 *
 * Fluxo real (sem mock): login admin → /admin/pipeline → clica no card do contato
 * → painel consolidado abre com timeline cross-channel (web + WhatsApp), aba de
 * propostas e histórico de funil. Screenshot do crítico.
 *
 * Pré-requisito: container da branch UP em PLAYWRIGHT_TEST_BASE_URL + admin seedado
 * (npx tsx src/scripts/seed-admin.ts) + DATABASE_URL apontando pro mesmo Postgres.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL =
	process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/aja_agora";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@ajaagora.com.br";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const ids = {
	contact: randomUUID(),
	convWeb: randomUUID(),
	convWa: randomUUID(),
	lead: randomUUID(),
	leadWa: randomUUID(),
	proposal: randomUUID(),
};
const LEAD_NAME = `E2E-FIX45-${ids.contact.slice(0, 8)}`;

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
	// Skip se a rota não existe (servidor é develop sem a branch).
	const probe = await request.get(`/api/admin/contacts/${ids.contact}`, { failOnStatusCode: false });
	if (probe.status() === 404 && (await probe.text()).includes("Cannot")) {
		testInfo.skip(true, "Rota /api/admin/contacts/[id] não existe no servidor alvo.");
	}

	await withDb(async (db) => {
		await db.query(
			`INSERT INTO contacts (id, phone, cpf, email, name) VALUES ($1,$2,$3,$4,$5)`,
			[ids.contact, "62991450001", "52998224725", "helena.fix45@example.com", "Helena FIX45"],
		);
		await db.query(
			`INSERT INTO conversations (id, channel, status, contact_id, metadata) VALUES ($1,'web','active',$2,'{}')`,
			[ids.convWeb, ids.contact],
		);
		await db.query(
			`INSERT INTO conversations (id, channel, status, contact_id, wa_id, metadata) VALUES ($1,'whatsapp','active',$2,'62991450001','{}')`,
			[ids.convWa, ids.contact],
		);
		await db.query(
			`INSERT INTO messages (conversation_id, role, content, channel) VALUES ($1,'user','quero um carro em 2 anos','web')`,
			[ids.convWeb],
		);
		await db.query(
			`INSERT INTO messages (conversation_id, role, content, channel) VALUES ($1,'user','voltei pelo whatsapp pra fechar','whatsapp')`,
			[ids.convWa],
		);
		await db.query(
			`INSERT INTO leads (id, conversation_id, contact_id, name, phone, stage) VALUES ($1,$2,$3,$4,'62991450001','proposta_enviada')`,
			[ids.lead, ids.convWeb, ids.contact, LEAD_NAME],
		);
		// WhatsApp também cria lead na vida real (getOrCreateConversation) — mesmo
		// contato → o dedup une os dois canais num card só.
		await db.query(
			`INSERT INTO leads (id, conversation_id, contact_id, phone, stage) VALUES ($1,$2,$3,'62991450001','engajado')`,
			[ids.leadWa, ids.convWa, ids.contact],
		);
		await db.query(
			`INSERT INTO bevi_proposals (id, conversation_id, lead_id, contact_id, proposal_id, administradora, proposal_status)
			 VALUES ($1,$2,$3,$4,'prop-e2e-fix45','Bevicred','simulacao')`,
			[ids.proposal, ids.convWeb, ids.lead, ids.contact],
		);
		await db.query(
			`INSERT INTO lead_events (lead_id, from_stage, to_stage, actor_type) VALUES
			 ($1,'novo','engajado','system'),
			 ($1,'engajado','qualificado','system'),
			 ($1,'qualificado','proposta_enviada','system')`,
			[ids.lead],
		);
	});
});

test.afterAll(async () => {
	await withDb(async (db) => {
		await db.query("DELETE FROM conversations WHERE contact_id = $1", [ids.contact]);
		await db.query("DELETE FROM contacts WHERE id = $1", [ids.contact]);
	});
});

test("FIX-45: card do contato abre a visão consolidada (timeline web+WhatsApp + propostas + funil)", async ({
	page,
}) => {
	test.skip(!ADMIN_PASSWORD, "ADMIN_PASSWORD não setada no ambiente do teste.");

	// Login admin
	await page.goto("/admin/login");
	await page.fill("#userEmail", ADMIN_EMAIL);
	await page.fill("#password", ADMIN_PASSWORD);
	await page.click('button[type="submit"]:has-text("Entrar")');
	await page.waitForURL("**/admin", { timeout: 15_000 });

	// Pipeline
	await page.goto("/admin/pipeline");

	// Card do contato (dedup) na coluna proposta_enviada
	const card = page.locator(`text=${LEAD_NAME}`).first();
	await expect(card).toBeVisible({ timeout: 15_000 });

	// O card deve mostrar AMBOS os canais (badge multi-canal do dedup)
	const cardRoot = card.locator("xpath=ancestor::*[contains(@class,'cursor-pointer')][1]");
	await expect(cardRoot.getByTestId("lead-channels")).toContainText("WA");
	await expect(cardRoot.getByTestId("lead-channels")).toContainText("Web");

	await card.click();

	// Painel consolidado abre
	const panel = page.getByTestId("contact-detail-panel");
	await expect(panel).toBeVisible({ timeout: 10_000 });

	// Timeline cross-channel: mensagens dos dois canais
	const messages = panel.getByTestId("timeline-message");
	await expect(messages).toHaveCount(2);
	await expect(panel).toContainText("quero um carro em 2 anos");
	await expect(panel).toContainText("voltei pelo whatsapp pra fechar");

	// CPF mascarado no cabeçalho
	await expect(panel.getByTestId("contact-cpf")).toContainText("***.***.247-25");

	await page.screenshot({ path: "test-results/fix45-contact-detail.png", fullPage: true });

	// Aba Propostas
	await panel.getByRole("tab", { name: "Propostas" }).click();
	await expect(panel.getByTestId("proposal-item")).toContainText("Bevicred");

	// Aba Funil — histórico de raia
	await panel.getByRole("tab", { name: "Funil" }).click();
	await expect(panel.getByTestId("stage-event").first()).toBeVisible();
	await expect(panel).toContainText("Proposta Enviada");
});
